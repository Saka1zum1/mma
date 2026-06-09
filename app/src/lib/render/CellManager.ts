import type {
	RenderDelta_Serialize,
	RenderEntry,
	CellRemoval as _CellRemoval,
	ColorPatchEntry,
} from "@/bindings.gen";

export type RenderDelta = RenderDelta_Serialize;

/** Per-cell, per-selection membership: a dense bitmask or a sparse selected-index list. */
export type SelEntry =
	| { kind: "mask"; mask: Uint8Array }
	| { kind: "idx"; indices: Uint32Array };
export interface SelCellEntry {
	cellChar: string;
	locCount: number;
	sels: SelEntry[];
}

/**
 * Decode the inline selection-bitmask bytes written by Rust's `serialize_cell_bitmask`
 * (location_store.rs). Sole reader of that wire format — all format knowledge lives here
 * and in `applySelectionBitmasks`, which consumes the decoded entries.
 */
export function decodeSelectionBitmask(bytes: number[]): {
	selColors: [number, number, number][];
	cellEntries: SelCellEntry[];
} {
	const buf = new Uint8Array(bytes).buffer;
	const dv = new DataView(buf);
	let off = 0;
	const numSels = dv.getUint32(off, true);
	off += 4;
	const selColors: [number, number, number][] = [];
	for (let i = 0; i < numSels; i++) {
		selColors.push([dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2)]);
		off += 3;
	}
	const numCells = dv.getUint8(off);
	off += 1;
	const cellEntries: SelCellEntry[] = [];
	for (let ci = 0; ci < numCells; ci++) {
		const cellChar = String.fromCharCode(dv.getUint8(off));
		off += 1;
		const locCount = dv.getUint32(off, true);
		off += 4;
		const maskBytes = Math.ceil(locCount / 8);
		const sels: SelEntry[] = [];
		for (let si = 0; si < numSels; si++) {
			const fmt = dv.getUint8(off);
			off += 1;
			if (fmt === 1) {
				const count = dv.getUint32(off, true);
				off += 4;
				const indices = new Uint32Array(count);
				for (let k = 0; k < count; k++) {
					indices[k] = dv.getUint32(off, true);
					off += 4;
				}
				sels.push({ kind: "idx", indices });
			} else {
				sels.push({ kind: "mask", mask: new Uint8Array(buf, off, maskBytes) });
				off += maskBytes;
			}
		}
		cellEntries.push({ cellChar, locCount, sels });
	}
	return { selColors, cellEntries };
}

/** The read-only id-membership surface shared by `Set<number>` and `SelectedIds`, for code
 *  that only needs `size` / `has` / iteration over either. */
export interface ReadonlyIdSet extends Iterable<number> {
	readonly size: number;
	has(id: number): boolean;
}

/**
 * Membership set of selected location ids, backed by a bit array indexed by id rather than a
 * hash `Set`. Location ids are dense u32s, so a bitset makes the build ~10x cheaper than 1M
 * `Set.add`s (a typed-array OR vs hashing), with O(1) `has`/`size`. Iteration yields the
 * selected ids from the overlay's id array. Exposes the Set-like surface its consumers use.
 */
export class SelectedIds {
	/** Shared empty selection (no map open / cleared). */
	static readonly EMPTY = new SelectedIds(new Uint8Array(0), 0);

	constructor(
		private readonly bits: Uint8Array,
		/** Count of distinct selected ids (not overlay entries — an id selected by N
		 *  overlapping selections still counts once). */
		readonly size: number,
	) {}

	has(id: number): boolean {
		const w = id >>> 3;
		return w < this.bits.length && (this.bits[w] & (1 << (id & 7))) !== 0;
	}

	/** Yields each selected id once, ascending. Scans the bit array, so it's O(maxId/8);
	 *  used by deliberate bulk consumers (export, bulk-tag, delete), not the per-frame path. */
	*[Symbol.iterator](): Iterator<number> {
		const bits = this.bits;
		for (let w = 0; w < bits.length; w++) {
			const byte = bits[w];
			if (byte === 0) continue;
			const base = w << 3;
			for (let b = 0; b < 8; b++) {
				if (byte & (1 << b)) yield base + b;
			}
		}
	}
}

const MIN_CAPACITY = 256;

/**
 * Typed-array backed buffer for one geohash cell's marker data.
 * Grows by doubling. Removals use swap-remove (O(1), order not preserved).
 * Versioned per-attribute so deck.gl can skip unchanged layers.
 */
export class CellBuffer {
	ids: number[] = [];
	idToIndex = new Map<number, number>();
	positions: Float32Array;
	colors: Uint8Array;
	angles: Float32Array;
	count = 0;
	capacity: number;
	positionVersion = 0;
	colorVersion = 0;

	constructor(capacity = MIN_CAPACITY) {
		this.capacity = capacity;
		this.positions = new Float32Array(capacity * 2);
		this.colors = new Uint8Array(capacity * 4);
		this.angles = new Float32Array(capacity);
	}

	/** Append a marker, growing the buffer if needed. */
	append(entry: RenderEntry) {
		this.ensureCapacity(this.count + 1);
		const i = this.count;
		this.positions[i * 2] = entry.lng;
		this.positions[i * 2 + 1] = entry.lat;
		this.colors[i * 4] = entry.r;
		this.colors[i * 4 + 1] = entry.g;
		this.colors[i * 4 + 2] = entry.b;
		this.colors[i * 4 + 3] = entry.a;
		this.angles[i] = entry.heading;
		this.ids[i] = entry.id;
		this.idToIndex.set(entry.id, i);
		this.count++;
		this.positionVersion++;
		this.colorVersion++;
	}

	/** O(1) removal by swapping with the last element. Mirrors Rust's cell_remove_render. */
	swapRemove(index: number) {
		const last = this.count - 1;
		if (last < 0) return;
		const removedId = this.ids[index];

		if (index !== last) {
			this.positions[index * 2] = this.positions[last * 2];
			this.positions[index * 2 + 1] = this.positions[last * 2 + 1];
			this.colors[index * 4] = this.colors[last * 4];
			this.colors[index * 4 + 1] = this.colors[last * 4 + 1];
			this.colors[index * 4 + 2] = this.colors[last * 4 + 2];
			this.colors[index * 4 + 3] = this.colors[last * 4 + 3];
			this.angles[index] = this.angles[last];

			const movedId = this.ids[last];
			this.ids[index] = movedId;
			this.idToIndex.set(movedId, index);
		}

		this.idToIndex.delete(removedId);
		this.count--;
		this.positionVersion++;
		this.colorVersion++;
	}

	patchPosition(index: number, lng?: number, lat?: number, heading?: number) {
		if (index < 0 || index >= this.count) return;
		if (lng != null) this.positions[index * 2] = lng;
		if (lat != null) this.positions[index * 2 + 1] = lat;
		if (heading != null) this.angles[index] = heading;
		this.positionVersion++;
	}

	patchColor(index: number, r: number, g: number, b: number, a: number) {
		if (index < 0 || index >= this.count) return;
		this.colors[index * 4] = r;
		this.colors[index * 4 + 1] = g;
		this.colors[index * 4 + 2] = b;
		this.colors[index * 4 + 3] = a;
		this.colorVersion++;
	}

	private ensureCapacity(needed: number) {
		if (needed <= this.capacity) return;
		const newCap = Math.max(needed, this.capacity * 2, MIN_CAPACITY);
		const newPos = new Float32Array(newCap * 2);
		const newCol = new Uint8Array(newCap * 4);
		const newAng = new Float32Array(newCap);
		newPos.set(this.positions.subarray(0, this.count * 2));
		newCol.set(this.colors.subarray(0, this.count * 4));
		newAng.set(this.angles.subarray(0, this.count));
		this.positions = newPos;
		this.colors = newCol;
		this.angles = newAng;
		this.capacity = newCap;
	}
}

/**
 * Owns all marker render data as 32 geohash-cell CellBuffers plus a selection overlay.
 * Initialized from a binary blob built by Rust (`initFromBinary`), then kept in sync
 * via incremental deltas (`applyDelta`) and selection bitmasks (`applySelectionBitmasks`).
 * deck.gl layers read the typed arrays directly — no JSON serialization in the render loop.
 */
export class CellManager {
	cells = new Map<string, CellBuffer>();
	totalCount = 0;
	version = 0;
	/** Largest location id seen — sizes the selection bitset. Monotonic (never shrinks on
	 *  removal; an overestimate just over-allocates a few bytes). */
	maxId = 0;

	/** Parse the full render binary from Rust. Replaces all cells and the selection overlay. */
	initFromBinary(buf: ArrayBuffer) {
		this.cells.clear();
		this.totalCount = 0;
		this.maxId = 0;
		this.selOverlayCount = 0;
		this.selOverlayIds = new Uint32Array(0);
		this.selOverlayVersion++;

		const dv = new DataView(buf);
		if (buf.byteLength < 4) return;
		const cellCount = dv.getUint32(0, true);
		let offset = 4;

		for (let c = 0; c < cellCount; c++) {
			const gh0 = dv.getUint8(offset);
			const cellKey = String.fromCharCode(gh0);
			const count = dv.getUint32(offset + 1, true);
			offset += 5;

			const cb = new CellBuffer(count);
			cb.count = count;

			const idBytes = count * 4;
			const posBytes = count * 2 * 4;
			const colBytes = count * 4;
			const angBytes = count * 4;

			const idBuf = new Uint32Array(buf.slice(offset, offset + idBytes));
			offset += idBytes;
			cb.ids = Array.from(idBuf);
			cb.idToIndex.clear();
			for (let i = 0; i < count; i++) {
				const id = cb.ids[i];
				cb.idToIndex.set(id, i);
				if (id > this.maxId) this.maxId = id;
			}

			cb.positions = new Float32Array(buf.slice(offset, offset + posBytes));
			offset += posBytes;
			cb.colors = new Uint8Array(buf.slice(offset, offset + colBytes));
			offset += colBytes;
			cb.angles = new Float32Array(buf.slice(offset, offset + angBytes));
			offset += angBytes;

			cb.capacity = count;

			this.cells.set(cellKey, cb);
			this.totalCount += count;
		}

		// Selection overlay: [u32 count][f32[] positions][u8[] colors][f32[] angles][u32[] ids]
		if (offset + 4 <= buf.byteLength) {
			const selCount = dv.getUint32(offset, true);
			offset += 4;
			if (selCount > 0) {
				const selPosBytes = selCount * 2 * 4;
				const selColBytes = selCount * 4;
				const selAngBytes = selCount * 4;
				const selIdBytes = selCount * 4;
				this.selOverlayPositions = new Float32Array(buf.slice(offset, offset + selPosBytes));
				offset += selPosBytes;
				this.selOverlayColors = new Uint8Array(buf.slice(offset, offset + selColBytes));
				offset += selColBytes;
				this.selOverlayAngles = new Float32Array(buf.slice(offset, offset + selAngBytes));
				offset += selAngBytes;
				this.selOverlayIds = new Uint32Array(buf.slice(offset, offset + selIdBytes));
				this.selOverlayCount = selCount;
			}
		}

		this.version++;
	}

	/** Apply an incremental delta (adds, swap-removes, position patches, color patches). Returns affected cell keys. */
	private _removedIds = new Set<number>();

	applyDelta(delta: RenderDelta): Set<string> {
		const affected = new Set<string>();

		for (const rem of delta.removed) {
			const cb = this.cells.get(rem.cell);
			if (cb) {
				cb.swapRemove(rem.cellIndex);
				this.totalCount--;
				affected.add(rem.cell);
			}
			this._removedIds.add(rem.id);
		}

		for (const entry of delta.added) {
			let cb = this.cells.get(entry.cell);
			if (!cb) {
				cb = new CellBuffer();
				this.cells.set(entry.cell, cb);
			}
			cb.append(entry);
			if (entry.id > this.maxId) this.maxId = entry.id;
			this.totalCount++;
			affected.add(entry.cell);
		}

		for (const patch of delta.updated) {
			const cb = this.cells.get(patch.cell);
			if (cb) {
				cb.patchPosition(
					patch.cellIndex,
					patch.lng ?? undefined,
					patch.lat ?? undefined,
					patch.heading ?? undefined,
				);
				affected.add(patch.cell);
			}
		}

		for (const cp of delta.colorPatches) {
			const cb = this.cells.get(cp.cell);
			if (cb) {
				cb.patchColor(cp.cellIndex, cp.r, cp.g, cp.b, cp.a);
				affected.add(cp.cell);
			}
		}

		this.version++;
		return affected;
	}

	/** Map a deck.gl pick (cell + index) back to a location ID. */
	resolvePickFromCell(cellKey: string, cellIndex: number): number | null {
		const cb = this.cells.get(cellKey);
		if (!cb || cellIndex < 0 || cellIndex >= cb.count) return null;
		return cb.ids[cellIndex] ?? null;
	}

	selOverlayPositions = new Float32Array(0);
	selOverlayColors = new Uint8Array(0);
	selOverlayAngles = new Float32Array(0);
	selOverlayIds: Uint32Array = new Uint32Array(0);
	selOverlayCount = 0;
	selOverlayVersion = 0;

	/** Build a selection overlay from explicit color patches (used by non-bitmask code paths). */
	buildSelectionOverlay(colorPatches: ColorPatchEntry[], _angles?: boolean) {
		this.selOverlayCount = colorPatches.length;
		if (colorPatches.length === 0) {
			this.selOverlayIds = new Uint32Array(0);
			this.selOverlayVersion++;
			return;
		}
		const n = colorPatches.length;
		this.selOverlayPositions = new Float32Array(n * 2);
		this.selOverlayColors = new Uint8Array(n * 4);
		this.selOverlayAngles = new Float32Array(n);
		this.selOverlayIds = new Uint32Array(n);
		for (let i = 0; i < n; i++) {
			const cp = colorPatches[i];
			const cb = this.cells.get(cp.cell);
			if (!cb || cp.cellIndex >= cb.count) continue;
			this.selOverlayPositions[i * 2] = cb.positions[cp.cellIndex * 2];
			this.selOverlayPositions[i * 2 + 1] = cb.positions[cp.cellIndex * 2 + 1];
			this.selOverlayColors[i * 4] = cp.r;
			this.selOverlayColors[i * 4 + 1] = cp.g;
			this.selOverlayColors[i * 4 + 2] = cp.b;
			this.selOverlayColors[i * 4 + 3] = cp.a;
			this.selOverlayAngles[i] = cb.angles[cp.cellIndex];
			this.selOverlayIds[i] = cb.ids[cp.cellIndex];
		}
		this.selOverlayVersion++;
	}

	/** Append color patches to the existing selection overlay without replacing it. */
	appendToSelectionOverlay(colorPatches: ColorPatchEntry[]) {
		if (colorPatches.length === 0) return;
		const oldCount = this.selOverlayCount;
		const newCount = oldCount + colorPatches.length;
		const pos = new Float32Array(newCount * 2);
		const col = new Uint8Array(newCount * 4);
		const ang = new Float32Array(newCount);
		const ids = new Uint32Array(newCount);
		pos.set(this.selOverlayPositions.subarray(0, oldCount * 2));
		col.set(this.selOverlayColors.subarray(0, oldCount * 4));
		ang.set(this.selOverlayAngles.subarray(0, oldCount));
		ids.set(this.selOverlayIds.subarray(0, oldCount));

		for (let i = 0; i < colorPatches.length; i++) {
			const cp = colorPatches[i];
			const cb = this.cells.get(cp.cell);
			if (!cb || cp.cellIndex >= cb.count) continue;
			const oi = oldCount + i;
			pos[oi * 2] = cb.positions[cp.cellIndex * 2];
			pos[oi * 2 + 1] = cb.positions[cp.cellIndex * 2 + 1];
			col[oi * 4] = cp.r;
			col[oi * 4 + 1] = cp.g;
			col[oi * 4 + 2] = cp.b;
			col[oi * 4 + 3] = cp.a;
			ang[oi] = cb.angles[cp.cellIndex];
			ids[oi] = cb.ids[cp.cellIndex];
		}
		this.selOverlayPositions = pos;
		this.selOverlayColors = col;
		this.selOverlayAngles = ang;
		this.selOverlayIds = ids;
		this.selOverlayCount = newCount;
		this.selOverlayVersion++;
	}

	/**
	 * Decode per-cell bitmasks from Rust into a colored selection overlay.
	 * Selected locations are hidden in their main cell (alpha=0) and drawn in the overlay with
	 * the selection's color. Later selections overdraw earlier ones. Returns the set of selected IDs.
	 *
	 * Supports partial updates: only cells included in `cellEntries` are touched.
	 * Overlay entries and selectedIds for other cells are preserved.
	 */
	applySelectionBitmasks(
		selColors: [number, number, number][],
		cellEntries: SelCellEntry[],
	): SelectedIds {
		const numSels = selColors.length;

		// Full sync (every cell present) rebuilds the whole overlay, so nothing is kept —
		// skip the O(N) incomingIds Set + kept scan entirely. Only a partial (per-cell,
		// post-mutation) update needs to preserve overlay entries from untouched cells.
		const isFull = cellEntries.length === this.cells.size;

		// Selected-id membership as a bit array (id is the index) — built ~10x cheaper than a
		// hash Set at scale. Bits are set wherever an id is written into the overlay below;
		// selCount tracks distinct ids (an id in N overlapping selections is counted once).
		const bits = new Uint8Array((this.maxId >>> 3) + 1);
		let selCount = 0;

		// A partial sync (only some cells present) preserves overlay entries from the untouched
		// cells. Snapshot the prior overlay, mark the incoming-cell ids in a bitset (O(1)
		// membership, no hash Set), and count the survivors — so they can be copied directly
		// between the typed arrays below, with no intermediate object array.
		const prevPos = this.selOverlayPositions;
		const prevCol = this.selOverlayColors;
		const prevAng = this.selOverlayAngles;
		const prevIds = this.selOverlayIds;
		const prevCount = this.selOverlayCount;
		let incomingBits: Uint8Array | null = null;
		let keptCount = 0;
		if (!isFull) {
			incomingBits = new Uint8Array((this.maxId >>> 3) + 1);
			for (const entry of cellEntries) {
				const cb = this.cells.get(entry.cellChar);
				if (!cb) continue;
				const ids = cb.ids;
				for (let i = 0; i < cb.count; i++) {
					const id = ids[i];
					incomingBits[id >>> 3] |= 1 << (id & 7);
				}
			}
			const rem = this._removedIds;
			for (let i = 0; i < prevCount; i++) {
				const id = prevIds[i];
				if ((incomingBits[id >>> 3] & (1 << (id & 7))) !== 0 || rem.has(id)) continue;
				keptCount++;
			}
		}

		// Count new overlay entries from incoming cells. Index-list selections contribute
		// in O(selected); only dense bitmask selections need a per-row scan.
		let newEntries = 0;
		for (const entry of cellEntries) {
			const cb = this.cells.get(entry.cellChar);
			const n = cb ? Math.min(entry.locCount, cb.count) : 0;
			if (n === 0) continue;
			for (let si = 0; si < numSels; si++) {
				const sel = entry.sels[si];
				if (sel.kind === "idx") {
					const idx = sel.indices;
					for (let k = 0; k < idx.length; k++) if (idx[k] < n) newEntries++;
				} else {
					const m = sel.mask;
					for (let li = 0; li < n; li++) if (m[li >> 3] & (1 << (li & 7))) newEntries++;
				}
			}
		}

		const total = keptCount + newEntries;
		this.selOverlayPositions = new Float32Array(total * 2);
		this.selOverlayColors = new Uint8Array(total * 4);
		this.selOverlayAngles = new Float32Array(total);
		this.selOverlayIds = new Uint32Array(total);

		// Copy the kept entries straight from the old typed arrays into the new ones (skipping
		// incoming/removed), setting their selected bits — no objects, no Set lookups.
		let oi = 0;
		if (!isFull) {
			const sp = this.selOverlayPositions, sc = this.selOverlayColors;
			const sa = this.selOverlayAngles, sid = this.selOverlayIds;
			const rem = this._removedIds;
			const inc = incomingBits!;
			for (let i = 0; i < prevCount; i++) {
				const id = prevIds[i];
				if ((inc[id >>> 3] & (1 << (id & 7))) !== 0 || rem.has(id)) continue;
				sp[oi * 2] = prevPos[i * 2];
				sp[oi * 2 + 1] = prevPos[i * 2 + 1];
				const o4 = oi * 4, p4 = i * 4;
				sc[o4] = prevCol[p4];
				sc[o4 + 1] = prevCol[p4 + 1];
				sc[o4 + 2] = prevCol[p4 + 2];
				sc[o4 + 3] = prevCol[p4 + 3];
				sa[oi] = prevAng[i];
				sid[oi] = id;
				const w = id >>> 3, m = 1 << (id & 7);
				if ((bits[w] & m) === 0) selCount++;
				bits[w] |= m;
				oi++;
			}
		}

		// Reset base colors for incoming cells to gray, then write new overlay entries.
		// Fill the 4-byte gray pattern via exponential copyWithin (memcpy) rather than a
		// per-row write loop — same result, far fewer JS-level stores.
		for (const entry of cellEntries) {
			const cb = this.cells.get(entry.cellChar);
			if (!cb) continue;
			const n = Math.min(entry.locCount, cb.count);
			if (n === 0) continue;
			const colors = cb.colors;
			const total = n * 4;
			colors[0] = 42;
			colors[1] = 42;
			colors[2] = 42;
			colors[3] = 255;
			let filled = 4;
			while (filled < total) {
				const c = Math.min(filled, total - filled);
				colors.copyWithin(filled, 0, c);
				filled += c;
			}
		}

		// Write the new overlay entries. Hot path at scale (select-all hides ~N markers), so
		// reads/writes go through hoisted local refs to the typed arrays rather than repeated
		// `this.`/`cb.` property chains. The idx/mask branches share `write` — a local closure
		// V8 inlines (per SharedFunctionInfo), with the loop-variant values passed as args.
		const sp = this.selOverlayPositions;
		const sc = this.selOverlayColors;
		const sa = this.selOverlayAngles;
		const sid = this.selOverlayIds;
		for (let si = 0; si < numSels; si++) {
			const r = selColors[si][0], g = selColors[si][1], b = selColors[si][2];
			for (const entry of cellEntries) {
				const cb = this.cells.get(entry.cellChar);
				if (!cb) continue;
				const n = Math.min(entry.locCount, cb.count);
				const sel = entry.sels[si];
				const cc = cb.colors, cpos = cb.positions, cang = cb.angles, cids = cb.ids;
				// Sets the base color transparent (the overlay draws it in the selection color)
				// and appends an overlay entry, advancing `oi`.
				const write = (li: number) => {
					const locId = cids[li];
					const bw = locId >>> 3, bm = 1 << (locId & 7);
					if ((bits[bw] & bm) === 0) selCount++;
					bits[bw] |= bm;
					const c4 = li * 4;
					cc[c4] = 0; cc[c4 + 1] = 0; cc[c4 + 2] = 0; cc[c4 + 3] = 0;
					sp[oi * 2] = cpos[li * 2]; sp[oi * 2 + 1] = cpos[li * 2 + 1];
					const o4 = oi * 4;
					sc[o4] = r; sc[o4 + 1] = g; sc[o4 + 2] = b; sc[o4 + 3] = 255;
					sa[oi] = cang[li];
					sid[oi] = locId;
					oi++;
				};
				if (sel.kind === "idx") {
					const idx = sel.indices;
					for (let k = 0; k < idx.length; k++) {
						if (idx[k] < n) write(idx[k]);
					}
				} else {
					const m = sel.mask;
					for (let li = 0; li < n; li++) {
						if (m[li >> 3] & (1 << (li & 7))) write(li);
					}
				}
			}
		}

		for (const entry of cellEntries) {
			const cb = this.cells.get(entry.cellChar);
			if (cb) cb.colorVersion++;
		}

		this.selOverlayCount = oi;
		this.selOverlayVersion++;
		this.version++;
		this._removedIds.clear();
		return new SelectedIds(bits, selCount);
	}

	clear() {
		this.cells.clear();
		this.totalCount = 0;
		this.selOverlayCount = 0;
		this.selOverlayVersion++;
		this.version++;
	}
}
