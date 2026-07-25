import type {
	RenderDelta,
	RenderEntry,
	CellRemoval as _CellRemoval,
	ColorPatchEntry,
} from "@/bindings.gen";

function bitHas(bits: Uint8Array, id: number): boolean {
	return (bits[id >>> 3] & (1 << (id & 7))) !== 0;
}

function bitSet(bits: Uint8Array, id: number): boolean {
	const w = id >>> 3,
		m = 1 << (id & 7);
	const was = (bits[w] & m) !== 0;
	bits[w] |= m;
	return !was;
}

/** Per-cell, per-selection membership: a dense bitmask or a sparse selected-index list. */
export type SelEntry = { kind: "mask"; mask: Uint8Array } | { kind: "idx"; indices: Uint32Array };
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
	/** Per-marker visibility, 255 draws and 0 hides. Every base marker is drawn in the one
	 *  global marker colour, which the layer supplies as a constant, so the only per-marker
	 *  colour fact is whether a selection or the active highlight is covering it. */
	visible: Uint8Array;
	angles: Float32Array;
	count = 0;
	capacity: number;
	positionVersion = 0;
	colorVersion = 0;

	constructor(capacity = MIN_CAPACITY) {
		this.capacity = capacity;
		this.positions = new Float32Array(capacity * 2);
		this.visible = new Uint8Array(capacity);
		this.angles = new Float32Array(capacity);
	}

	/** Append a marker, growing the buffer if needed. */
	append(entry: RenderEntry) {
		this.ensureCapacity(this.count + 1);
		const i = this.count;
		this.positions[i * 2] = entry.lng;
		this.positions[i * 2 + 1] = entry.lat;
		this.visible[i] = entry.a;
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
			this.visible[index] = this.visible[last];
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

	/** Show (255) or hide (0) one marker in the base layer. */
	patchVisible(index: number, visible: number) {
		if (index < 0 || index >= this.count) return;
		this.visible[index] = visible;
		this.colorVersion++;
	}

	private ensureCapacity(needed: number) {
		if (needed <= this.capacity) return;
		const newCap = Math.max(needed, this.capacity * 2, MIN_CAPACITY);
		const newPos = new Float32Array(newCap * 2);
		const newVis = new Uint8Array(newCap);
		const newAng = new Float32Array(newCap);
		newPos.set(this.positions.subarray(0, this.count * 2));
		newVis.set(this.visible.subarray(0, this.count));
		newAng.set(this.angles.subarray(0, this.count));
		this.positions = newPos;
		this.visible = newVis;
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
			const visBytes = count;
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
			cb.visible = new Uint8Array(buf.slice(offset, offset + visBytes));
			offset += visBytes;
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

	/** Scratch for `applySelectionBitmasks`: per-row winning selection index, reused across
	 *  cells so a full sync does not allocate one array per cell. */
	private selWinner = new Int32Array(0);

	/** Drop every overlay entry whose id is in `ids`, compacting in place. */
	private dropOverlayEntries(ids: Set<number>) {
		if (ids.size === 0 || this.selOverlayCount === 0) return;
		const pos = this.selOverlayPositions;
		const col = this.selOverlayColors;
		const ang = this.selOverlayAngles;
		const sid = this.selOverlayIds;
		let oi = 0;
		for (let i = 0; i < this.selOverlayCount; i++) {
			if (ids.has(sid[i])) continue;
			if (oi !== i) {
				pos[oi * 2] = pos[i * 2];
				pos[oi * 2 + 1] = pos[i * 2 + 1];
				const o4 = oi * 4,
					p4 = i * 4;
				col[o4] = col[p4];
				col[o4 + 1] = col[p4 + 1];
				col[o4 + 2] = col[p4 + 2];
				col[o4 + 3] = col[p4 + 3];
				ang[oi] = ang[i];
				sid[oi] = sid[i];
			}
			oi++;
		}
		if (oi === this.selOverlayCount) return; // nothing matched, leave the version alone
		this.selOverlayCount = oi;
		this.selOverlayVersion++;
	}

	/** Apply an incremental delta (adds, swap-removes, position patches, color patches). Returns affected cell keys. */
	applyDelta(delta: RenderDelta): Set<string> {
		const affected = new Set<string>();
		// Ids leaving the overlay: deleted rows plus rows that lost membership. One pass at the end.
		const dropped = new Set<number>();

		for (const rem of delta.removed) {
			const cb = this.cells.get(rem.cell);
			if (cb) {
				cb.swapRemove(rem.cellIndex);
				this.totalCount--;
				affected.add(rem.cell);
			}
			dropped.add(rem.id);
		}

		let overlayMoved = false;
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
			// A selected row moving across cells arrives as removed + added, hidden in the
			// base layer. Its overlay entry already has the right colour: move it with the
			// row instead of letting the removal drop it, or the marker vanishes.
			if (entry.a === 0) {
				const oi = this.overlayIndexOf(entry.id);
				if (oi >= 0) {
					this.selOverlayPositions[oi * 2] = entry.lng;
					this.selOverlayPositions[oi * 2 + 1] = entry.lat;
					this.selOverlayAngles[oi] = entry.heading;
					dropped.delete(entry.id);
					overlayMoved = true;
				}
			}
		}
		for (const patch of delta.updated) {
			const cb = this.cells.get(patch.cell);
			if (!cb) continue;
			cb.patchPosition(
				patch.cellIndex,
				patch.lng ?? undefined,
				patch.lat ?? undefined,
				patch.heading ?? undefined,
			);
			affected.add(patch.cell);
			// A selected row's base marker is hidden; its overlay entry must follow the move
			// or the visible marker stays at the old position.
			const oi = this.overlayIndexOf(cb.ids[patch.cellIndex]);
			if (oi >= 0) {
				if (patch.lng != null) this.selOverlayPositions[oi * 2] = patch.lng;
				if (patch.lat != null) this.selOverlayPositions[oi * 2 + 1] = patch.lat;
				if (patch.heading != null) this.selOverlayAngles[oi] = patch.heading;
				overlayMoved = true;
			}
		}
		if (overlayMoved) this.selOverlayVersion++;

		// Membership changes. The RGBA is the base layer's, and `a` says which way the
		// overlay entry goes: a gained row is transparent there (the overlay draws it), a
		// lost row is opaque again. Dropping first means a row that re-enters a selection
		// never doubles up.
		const gained: ColorPatchEntry[] = [];
		for (const cp of delta.colorPatches) {
			const cb = this.cells.get(cp.cell);
			if (!cb) continue;
			cb.patchVisible(cp.cellIndex, cp.a);
			affected.add(cp.cell);
			dropped.add(cb.ids[cp.cellIndex]);
			if (cp.a === 0) gained.push(cp);
		}
		this.dropOverlayEntries(dropped);
		this.appendToSelectionOverlay(gained);

		this.version++;
		return affected;
	}

	/** Index of `id` in the live overlay entries, or -1. Linear over the overlay, but capped
	 *  at `selOverlayCount` — the arrays can carry a stale tail past it. */
	private overlayIndexOf(id: number): number {
		const ids = this.selOverlayIds;
		for (let i = 0; i < this.selOverlayCount; i++) {
			if (ids[i] === id) return i;
		}
		return -1;
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

	/** Write patches as overlay entries from `startIndex`, compacting over any patch whose
	 *  cell/index is stale, and return the entry count — a skipped slot must not be counted
	 *  or a zeroed phantom entry (id 0) leaks into `selectedIds`. */
	private writeOverlayEntries(
		startIndex: number,
		colorPatches: ColorPatchEntry[],
		pos: Float32Array,
		col: Uint8Array,
		ang: Float32Array,
		ids: Uint32Array,
	): number {
		let oi = startIndex;
		for (let i = 0; i < colorPatches.length; i++) {
			const cp = colorPatches[i];
			const cb = this.cells.get(cp.cell);
			if (!cb || cp.cellIndex >= cb.count) continue;
			pos[oi * 2] = cb.positions[cp.cellIndex * 2];
			pos[oi * 2 + 1] = cb.positions[cp.cellIndex * 2 + 1];
			col[oi * 4] = cp.r;
			col[oi * 4 + 1] = cp.g;
			col[oi * 4 + 2] = cp.b;
			// The overlay always draws opaque; `cp.a` is the base layer's alpha, which is 0
			// for a selected row precisely so this entry is what shows.
			col[oi * 4 + 3] = 255;
			ang[oi] = cb.angles[cp.cellIndex];
			ids[oi] = cb.ids[cp.cellIndex];
			oi++;
		}
		return oi;
	}

	/** Build a selection overlay from explicit color patches (used by non-bitmask code paths). */
	buildSelectionOverlay(colorPatches: ColorPatchEntry[], _angles?: boolean) {
		if (colorPatches.length === 0) {
			this.selOverlayCount = 0;
			this.selOverlayIds = new Uint32Array(0);
			this.selOverlayVersion++;
			return;
		}
		const n = colorPatches.length;
		this.selOverlayPositions = new Float32Array(n * 2);
		this.selOverlayColors = new Uint8Array(n * 4);
		this.selOverlayAngles = new Float32Array(n);
		this.selOverlayIds = new Uint32Array(n);
		this.selOverlayCount = this.writeOverlayEntries(
			0,
			colorPatches,
			this.selOverlayPositions,
			this.selOverlayColors,
			this.selOverlayAngles,
			this.selOverlayIds,
		);
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
		this.selOverlayCount = this.writeOverlayEntries(oldCount, colorPatches, pos, col, ang, ids);
		this.selOverlayPositions = pos;
		this.selOverlayColors = col;
		this.selOverlayAngles = ang;
		this.selOverlayIds = ids;
		this.selOverlayVersion++;
	}

	/** Selected-id set derived from the current selection overlay. */
	selectedIds(): SelectedIds {
		const n = this.selOverlayCount;
		if (n === 0) return SelectedIds.EMPTY;
		const ids = this.selOverlayIds;
		const bits = new Uint8Array((this.maxId >>> 3) + 1);
		let size = 0;
		for (let i = 0; i < n; i++) {
			if (bitSet(bits, ids[i])) size++;
		}
		return new SelectedIds(bits, size);
	}

	/**
	 * Decode per-cell bitmasks from Rust into a colored selection overlay.
	 * Selected locations are hidden in their main cell and drawn in the overlay in the
	 * selection's color, one entry each. Returns the set of selected IDs.
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
					bitSet(incomingBits, ids[i]);
				}
			}
			// Deleted rows already left the overlay in `applyDelta`, so only incoming-cell
			// membership decides what is kept here.
			for (let i = 0; i < prevCount; i++) {
				if (bitHas(incomingBits, prevIds[i])) continue;
				keptCount++;
			}
		}

		// Upper bound on new overlay entries: the (selection, row) pair count. A row in
		// several selections yields one entry, not several, so the write loop below can
		// finish under this; the buffers are trimmed to the real count afterwards.
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
					for (let li = 0; li < n; li++) if (bitHas(m, li)) newEntries++;
				}
			}
		}

		const total = keptCount + newEntries;
		this.selOverlayPositions = new Float32Array(total * 2);
		this.selOverlayColors = new Uint8Array(total * 4);
		this.selOverlayAngles = new Float32Array(total);
		this.selOverlayIds = new Uint32Array(total);

		// Copy the kept entries straight from the old typed arrays into the new ones (skipping
		// incoming cells), setting their selected bits. No objects, no Set lookups.
		let oi = 0;
		if (!isFull) {
			const sp = this.selOverlayPositions,
				sc = this.selOverlayColors;
			const sa = this.selOverlayAngles,
				sid = this.selOverlayIds;
			const inc = incomingBits!;
			for (let i = 0; i < prevCount; i++) {
				const id = prevIds[i];
				if (bitHas(inc, id)) continue;
				sp[oi * 2] = prevPos[i * 2];
				sp[oi * 2 + 1] = prevPos[i * 2 + 1];
				const o4 = oi * 4,
					p4 = i * 4;
				sc[o4] = prevCol[p4];
				sc[o4 + 1] = prevCol[p4 + 1];
				sc[o4 + 2] = prevCol[p4 + 2];
				sc[o4 + 3] = prevCol[p4 + 3];
				sa[oi] = prevAng[i];
				sid[oi] = id;
				if (bitSet(bits, id)) selCount++;
				oi++;
			}
		}

		// Show every marker in the incoming cells again, then hide the selected ones below.
		for (const entry of cellEntries) {
			const cb = this.cells.get(entry.cellChar);
			if (!cb) continue;
			cb.visible.fill(255, 0, Math.min(entry.locCount, cb.count));
		}

		// Write the new overlay entries, one per selected location rather than one per
		// (selection, row) pair. `winner` records which selection owns each row: later
		// selections overdraw earlier ones, so the highest matching index is the colour.
		// Resolving it here rather than by stacking quads keeps overlapping selections from
		// uploading entries that are drawn and immediately covered.
		// Hot path at scale (select-all hides ~N markers), so reads/writes go through
		// hoisted local refs rather than repeated `this.`/`cb.` property chains.
		const sp = this.selOverlayPositions;
		const sc = this.selOverlayColors;
		const sa = this.selOverlayAngles;
		const sid = this.selOverlayIds;
		for (const entry of cellEntries) {
			const cb = this.cells.get(entry.cellChar);
			if (!cb) continue;
			const n = Math.min(entry.locCount, cb.count);
			if (n === 0) continue;
			if (this.selWinner.length < n) this.selWinner = new Int32Array(n);
			const winner = this.selWinner;
			winner.fill(-1, 0, n);
			for (let si = 0; si < numSels; si++) {
				const sel = entry.sels[si];
				if (sel.kind === "idx") {
					const idx = sel.indices;
					for (let k = 0; k < idx.length; k++) if (idx[k] < n) winner[idx[k]] = si;
				} else {
					const m = sel.mask;
					for (let li = 0; li < n; li++) if (bitHas(m, li)) winner[li] = si;
				}
			}
			const cvis = cb.visible,
				cpos = cb.positions,
				cang = cb.angles,
				cids = cb.ids;
			for (let li = 0; li < n; li++) {
				const si = winner[li];
				if (si < 0) continue;
				const locId = cids[li];
				if (bitSet(bits, locId)) selCount++;
				// Base row hides; the overlay entry below is what draws.
				cvis[li] = 0;
				sp[oi * 2] = cpos[li * 2];
				sp[oi * 2 + 1] = cpos[li * 2 + 1];
				const o4 = oi * 4;
				sc[o4] = selColors[si][0];
				sc[o4 + 1] = selColors[si][1];
				sc[o4 + 2] = selColors[si][2];
				sc[o4 + 3] = 255;
				sa[oi] = cang[li];
				sid[oi] = locId;
				oi++;
			}
		}

		// Overlapping selections finish under the pair-count bound; hand deck.gl buffers
		// that are exactly the size of what is drawn.
		if (oi < total) {
			this.selOverlayPositions = this.selOverlayPositions.slice(0, oi * 2);
			this.selOverlayColors = this.selOverlayColors.slice(0, oi * 4);
			this.selOverlayAngles = this.selOverlayAngles.slice(0, oi);
			this.selOverlayIds = this.selOverlayIds.slice(0, oi);
		}

		for (const entry of cellEntries) {
			const cb = this.cells.get(entry.cellChar);
			if (cb) cb.colorVersion++;
		}

		this.selOverlayCount = oi;
		this.selOverlayVersion++;
		this.version++;
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
