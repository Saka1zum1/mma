import type {
	RenderDelta,
	RenderEntry,
	CellRemoval as _CellRemoval,
	ColorPatchEntry,
} from "@/bindings.gen";
import type { Bounds } from "@/types";
import { log } from "@/lib/util/log";

// ---------------------------------------------------------------------------
// Render cell geometry
// ---------------------------------------------------------------------------

const GEOHASH32 = "0123456789bcdefghjkmnpqrstuvwxyz";
const cellBoundsCache = new Map<string, Bounds>();

/** Lat/lng bounds of a 1-char geohash render cell (45x45 degrees). Mirrors Rust's
 *  `render_cell_idx` bit walk — 5 bits, lng first, alternating. */
export function cellBounds(key: string): Bounds {
	const cached = cellBoundsCache.get(key);
	if (cached) return cached;
	const idx = GEOHASH32.indexOf(key);
	let west = -180;
	let east = 180;
	let south = -90;
	let north = 90;
	let even = true;
	for (let bit = 4; bit >= 0; bit--) {
		const on = (idx >> bit) & 1;
		if (even) {
			const mid = (west + east) / 2;
			if (on) west = mid;
			else east = mid;
		} else {
			const mid = (south + north) / 2;
			if (on) south = mid;
			else north = mid;
		}
		even = !even;
	}
	const b = { west, south, east, north };
	cellBoundsCache.set(key, b);
	return b;
}

/** Does the view intersect the cell? View may cross the antimeridian (west > east);
 *  cells never do. */
export function boundsIntersectCell(view: Bounds, cell: Bounds): boolean {
	if (view.south > cell.north || view.north < cell.south) return false;
	if (view.west <= view.east) return view.west <= cell.east && view.east >= cell.west;
	return cell.east >= view.west || cell.west <= view.east;
}

// ---------------------------------------------------------------------------
// Aggregation LOD
// ---------------------------------------------------------------------------
// Zoomed out, cells render a decimated buffer instead of every marker: one
// representative per geo-anchored screen bin, derived lazily from the cell's live
// arrays and rebuilt when the cell's versions move. Representatives render as the
// current marker style at full size — the LOD only decimates, never restyles. The
// renderer never submits the occluded pile; the hit-test queries the drawn band.

export interface LodBand {
	/** Band is active while zoom < maxZoom (and the previous band's maxZoom <= zoom). */
	maxZoom: number;
	/** Bins are sized so representatives sit >= binPx apart at this zoom. */
	binPx: number;
}

// One band per zoom level: on-screen rep spacing only drifts between ~binPx/2 and
// binPx before the next band re-bins, so density never visibly pops. Bins nest
// exactly 2x between adjacent bands, which is what lets coarser bands cascade from
// finer ones in getLod. Full detail resumes at the last maxZoom.
export const LOD_BANDS: LodBand[] = Array.from({ length: 9 }, (_, i) => ({
	maxZoom: 4 + i,
	binPx: 12,
}));

/** Maps smaller than this always render full detail — no visual change. */
export const LOD_MIN_TOTAL = 50_000;

/** The bin spacing LOD_BANDS are built for. Band selection shifts to finer bands
 *  when the marker's solid footprint is smaller than this, so decimation never
 *  drops a marker that wasn't visually covered by its bin's representative. */
export const LOD_BIN_PX = 12;

export function lodBandForZoom(
	zoom: number,
	totalCount: number,
	binTargetPx: number = LOD_BIN_PX,
): number | null {
	if (totalCount < LOD_MIN_TOTAL) return null;
	// Smaller markers need tighter rep spacing: selecting a finer band halves the
	// on-screen spacing per step. This also returns small markers to full detail
	// at a lower zoom, which they can afford (fragment cost scales with area).
	const z = zoom + Math.max(0, Math.log2(LOD_BIN_PX / binTargetPx));
	for (let i = 0; i < LOD_BANDS.length; i++) {
		if (z < LOD_BANDS[i].maxZoom) return i;
	}
	return null;
}

export interface LodBufs {
	count: number;
	positions: Float32Array;
	colors: Uint8Array;
	angles: Float32Array;
	ids: Uint32Array;
	/** Monotonic per rebuild — use as the layer update trigger. */
	version: number;
}

type LodEntry = LodBufs & {
	srcPosVer: number;
	srcColVer: number;
	/** Each rep's index in the source arrays — painter's order for cascades. */
	srcIdx: Uint32Array;
};

type DecimateSrc = {
	count: number;
	positions: Float32Array;
	colors: Uint8Array;
	angles: Float32Array;
	ids: ArrayLike<number>;
	/** Painter's-order rank per element; absent = the element index itself. */
	srcIdx?: Uint32Array;
};

/** One representative per geo bin over `src`: the element with the highest
 *  painter's-order rank. Membership is position-only — hidden (alpha 0) markers
 *  still claim their bin and render as nothing, mirroring full detail where the
 *  selection/active overlays draw the hidden marker on top. This keeps binning
 *  independent of color state, so selection syncs never force a re-bin. Shared by
 *  the per-cell buffers and the selection overlay. */
function decimateBand(bandIdx: number, src: DecimateSrc) {
	const band = LOD_BANDS[bandIdx];
	const worldPx = 256 * Math.pow(2, band.maxZoom);
	const inv = worldPx / band.binPx;
	const { positions, srcIdx } = src;
	// bin key -> slot in rep.
	const bins = new Map<number, number>();
	const rep: number[] = [];
	for (let i = 0; i < src.count; i++) {
		const lng = positions[i * 2];
		const lat = positions[i * 2 + 1];
		const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
		const bx = Math.floor((lng / 360 + 0.5) * inv);
		const by = Math.floor((0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * inv);
		// 2^17 exceeds bins-per-axis at the finest band; keys stay exact as JS numbers.
		const key = by * 131072 + bx;
		const slot = bins.get(key);
		if (slot == null) {
			bins.set(key, rep.length);
			rep.push(i);
		} else if ((srcIdx ? srcIdx[i] : i) > (srcIdx ? srcIdx[rep[slot]] : rep[slot])) {
			rep[slot] = i;
		}
	}
	return gatherReps(src, rep);
}

/** Copy the rep elements out of `src` into fresh contiguous buffers. */
function gatherReps(src: DecimateSrc, rep: ArrayLike<number>) {
	const { positions, colors, srcIdx } = src;
	const n = rep.length;
	const out = {
		count: n,
		positions: new Float32Array(n * 2),
		colors: new Uint8Array(n * 4),
		angles: new Float32Array(n),
		ids: new Uint32Array(n),
		srcIdx: new Uint32Array(n),
	};
	for (let o = 0; o < n; o++) {
		const i = rep[o];
		out.positions[o * 2] = positions[i * 2];
		out.positions[o * 2 + 1] = positions[i * 2 + 1];
		out.colors[o * 4] = colors[i * 4];
		out.colors[o * 4 + 1] = colors[i * 4 + 1];
		out.colors[o * 4 + 2] = colors[i * 4 + 2];
		out.colors[o * 4 + 3] = colors[i * 4 + 3];
		out.angles[o] = src.angles[i];
		out.ids[o] = src.ids[i];
		out.srcIdx[o] = srcIdx ? srcIdx[i] : i;
	}
	return out;
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

	private lod: (LodEntry | null)[] = [];
	private lodVersion = 0;

	/**
	 * Decimated buffers for a zoom band: one representative per geo bin — the marker
	 * with the highest cell index, the one painter's order draws on top at full
	 * detail. Binning depends only on positions: a position change re-bins (only the
	 * finest band scans the full cell; coarser bands cascade from the next finer
	 * band, bins nest exactly 2x), while a color-only change (selection sync, active
	 * hide, recolor) just re-gathers rep colors through srcIdx in O(reps). Selection
	 * clicks at LOD zooms stay off the O(cell) path.
	 */
	getLod(bandIdx: number): LodBufs {
		const cached = this.lod[bandIdx];
		if (cached && cached.srcPosVer === this.positionVersion) {
			if (cached.srcColVer !== this.colorVersion) {
				const { colors, srcIdx } = cached;
				for (let o = 0; o < cached.count; o++) {
					const i = srcIdx[o];
					colors[o * 4] = this.colors[i * 4];
					colors[o * 4 + 1] = this.colors[i * 4 + 1];
					colors[o * 4 + 2] = this.colors[i * 4 + 2];
					colors[o * 4 + 3] = this.colors[i * 4 + 3];
				}
				cached.srcColVer = this.colorVersion;
				cached.version = ++this.lodVersion;
			}
			return cached;
		}
		const finer = bandIdx < LOD_BANDS.length - 1 ? (this.getLod(bandIdx + 1) as LodEntry) : null;
		const src: DecimateSrc = finer ?? {
			count: this.count,
			positions: this.positions,
			colors: this.colors,
			angles: this.angles,
			ids: this.ids,
		};
		const entry: LodEntry = {
			...decimateBand(bandIdx, src),
			version: ++this.lodVersion,
			srcPosVer: this.positionVersion,
			srcColVer: this.colorVersion,
		};
		this.lod[bandIdx] = entry;
		log.debug(`[lod] band ${bandIdx}: ${src.count} -> ${entry.count} representatives`);
		return entry;
	}

	/** Ensure the band's position binning is cached WITHOUT touching colors — the
	 *  prewarm path. Color re-gather stays lazy (getLod, at first draw of the band),
	 *  so prewarm never pays O(reps) color copies for bands that are never drawn. */
	warmLod(bandIdx: number): void {
		const cached = this.lod[bandIdx];
		if (cached && cached.srcPosVer === this.positionVersion) return;
		this.getLod(bandIdx);
	}

	/** Install Rust-precomputed rep indices (from the render blob) as a band's
	 *  entry — gather only, no binning. Rust mirrors decimateBand's bin math. */
	seedLod(bandIdx: number, srcIdx: Uint32Array) {
		const entry: LodEntry = {
			...gatherReps(
				{
					count: this.count,
					positions: this.positions,
					colors: this.colors,
					angles: this.angles,
					ids: this.ids,
				},
				srcIdx,
			),
			version: ++this.lodVersion,
			srcPosVer: this.positionVersion,
			srcColVer: this.colorVersion,
		};
		this.lod[bandIdx] = entry;
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

		// Finest-band LOD reps precomputed by Rust: [u32 repCount][u32[] indices] per
		// non-empty cell, cells-section order; repCount 0 below the LOD threshold.
		// Seeding skips the O(cell) first bin on the JS main thread.
		const finest = LOD_BANDS.length - 1;
		for (const cb of this.cells.values()) {
			if (offset + 4 > buf.byteLength) break;
			const repCount = dv.getUint32(offset, true);
			offset += 4;
			if (repCount === 0) continue;
			const reps = new Uint32Array(buf.slice(offset, offset + repCount * 4));
			offset += repCount * 4;
			cb.seedLod(finest, reps);
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

	private selLod: (LodEntry | null)[] = [];
	private selLodVersion = 0;

	/** Decimated selection overlay for a zoom band — same binning as
	 *  CellBuffer.getLod, invalidated by selOverlayVersion. No cascade: any overlay
	 *  change rebuilds its arrays wholesale, so only the requested band is built,
	 *  one O(selected) pass. */
	getSelOverlayLod(bandIdx: number): LodBufs {
		const cached = this.selLod[bandIdx];
		if (cached && cached.srcPosVer === this.selOverlayVersion) return cached;
		const entry: LodEntry = {
			...decimateBand(bandIdx, {
				count: this.selOverlayCount,
				positions: this.selOverlayPositions,
				colors: this.selOverlayColors,
				angles: this.selOverlayAngles,
				ids: this.selOverlayIds,
			}),
			version: ++this.selLodVersion,
			srcPosVer: this.selOverlayVersion,
			srcColVer: this.selOverlayVersion,
		};
		this.selLod[bandIdx] = entry;
		return entry;
	}

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

	/** Selected-id set derived from the current selection overlay. */
	selectedIds(): SelectedIds {
		const n = this.selOverlayCount;
		if (n === 0) return SelectedIds.EMPTY;
		const ids = this.selOverlayIds;
		const bits = new Uint8Array((this.maxId >>> 3) + 1);
		let size = 0;
		for (let i = 0; i < n; i++) {
			const id = ids[i];
			const w = id >>> 3;
			const m = 1 << (id & 7);
			if ((bits[w] & m) === 0) {
				bits[w] |= m;
				size++;
			}
		}
		return new SelectedIds(bits, size);
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
		defaultColor: [number, number, number] = [42, 42, 42],
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
			const sp = this.selOverlayPositions,
				sc = this.selOverlayColors;
			const sa = this.selOverlayAngles,
				sid = this.selOverlayIds;
			const rem = this._removedIds;
			const inc = incomingBits!;
			for (let i = 0; i < prevCount; i++) {
				const id = prevIds[i];
				if ((inc[id >>> 3] & (1 << (id & 7))) !== 0 || rem.has(id)) continue;
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
				const w = id >>> 3,
					m = 1 << (id & 7);
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
			colors[0] = defaultColor[0];
			colors[1] = defaultColor[1];
			colors[2] = defaultColor[2];
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
			const r = selColors[si][0],
				g = selColors[si][1],
				b = selColors[si][2];
			for (const entry of cellEntries) {
				const cb = this.cells.get(entry.cellChar);
				if (!cb) continue;
				const n = Math.min(entry.locCount, cb.count);
				const sel = entry.sels[si];
				const cc = cb.colors,
					cpos = cb.positions,
					cang = cb.angles,
					cids = cb.ids;
				// Sets the base color transparent (the overlay draws it in the selection color)
				// and appends an overlay entry, advancing `oi`.
				const write = (li: number) => {
					const locId = cids[li];
					const bw = locId >>> 3,
						bm = 1 << (locId & 7);
					if ((bits[bw] & bm) === 0) selCount++;
					bits[bw] |= bm;
					const c4 = li * 4;
					cc[c4] = 0;
					cc[c4 + 1] = 0;
					cc[c4 + 2] = 0;
					cc[c4 + 3] = 0;
					sp[oi * 2] = cpos[li * 2];
					sp[oi * 2 + 1] = cpos[li * 2 + 1];
					const o4 = oi * 4;
					sc[o4] = r;
					sc[o4 + 1] = g;
					sc[o4 + 2] = b;
					sc[o4 + 3] = 255;
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
