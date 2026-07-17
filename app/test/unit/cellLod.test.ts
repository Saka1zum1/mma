import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/util/log", () => ({
	log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {} },
}));

import {
	CellBuffer,
	LOD_BANDS,
	LOD_MIN_TOTAL,
	lodBandForZoom,
	cellBounds,
	boundsIntersectCell,
} from "@/lib/render/CellManager";
import type { RenderEntry } from "@/bindings.gen";

function entry(id: number, lng: number, lat: number, a = 255, heading = 0): RenderEntry {
	return { cell: "s", id, lng, lat, heading, r: 42, g: 42, b: 42, a };
}

describe("lodBandForZoom", () => {
	it("returns null below LOD_MIN_TOTAL regardless of zoom", () => {
		expect(lodBandForZoom(0, LOD_MIN_TOTAL - 1)).toBeNull();
		expect(lodBandForZoom(20, LOD_MIN_TOTAL - 1)).toBeNull();
	});

	it("returns the first band whose maxZoom the zoom is below", () => {
		LOD_BANDS.forEach((band, i) => {
			expect(lodBandForZoom(band.maxZoom - 0.1, LOD_MIN_TOTAL)).toBe(i);
		});
	});

	it("returns null at or above the last band's maxZoom", () => {
		const last = LOD_BANDS[LOD_BANDS.length - 1];
		expect(lodBandForZoom(last.maxZoom, LOD_MIN_TOTAL)).toBeNull();
		expect(lodBandForZoom(last.maxZoom + 5, LOD_MIN_TOTAL)).toBeNull();
	});

	it("a smaller bin target selects a finer band at the same zoom", () => {
		const zoom = LOD_BANDS[2].maxZoom - 0.5;
		const base = lodBandForZoom(zoom, LOD_MIN_TOTAL)!;
		// Halving the target spacing shifts exactly one band finer (bins nest 2x).
		expect(lodBandForZoom(zoom, LOD_MIN_TOTAL, 6)).toBe(base + 1);
	});

	it("a smaller bin target returns to full detail at a lower zoom", () => {
		const last = LOD_BANDS[LOD_BANDS.length - 1];
		expect(lodBandForZoom(last.maxZoom - 1, LOD_MIN_TOTAL)).not.toBeNull();
		expect(lodBandForZoom(last.maxZoom - 1, LOD_MIN_TOTAL, 6)).toBeNull();
	});

	it("a bin target above the reference never coarsens the band", () => {
		const zoom = LOD_BANDS[2].maxZoom - 0.5;
		expect(lodBandForZoom(zoom, LOD_MIN_TOTAL, 24)).toBe(lodBandForZoom(zoom, LOD_MIN_TOTAL));
	});
});

describe("CellBuffer.getLod: binning", () => {
	it("markers far apart each get their own representative", () => {
		const cb = new CellBuffer();
		cb.append(entry(1, -170, 10));
		cb.append(entry(2, -60, -10));
		cb.append(entry(3, 60, 20));
		cb.append(entry(4, 170, -20));
		const lod = cb.getLod(0);
		expect(lod.count).toBe(4);
		expect(new Set(Array.from(lod.ids))).toEqual(new Set([1, 2, 3, 4]));
	});

	it("markers within the same bin collapse to one representative: the last appended", () => {
		const cb = new CellBuffer();
		cb.append(entry(1, 10, 10));
		cb.append(entry(2, 10 + 1e-7, 10 + 1e-7));
		cb.append(entry(3, 10 - 1e-7, 10 - 1e-7));
		const lod = cb.getLod(0);
		expect(lod.count).toBe(1);
		expect(lod.ids[0]).toBe(3);
	});

	it("a hidden topmost marker holds its bin and renders alpha 0", () => {
		// Binning is position-only: the hidden rep draws nothing while the
		// selection/active overlay draws that marker on top â€” full-detail semantics.
		const cb = new CellBuffer();
		cb.append(entry(1, 10, 10, 255));
		cb.append(entry(2, 10 + 1e-7, 10 + 1e-7, 0));
		const lod = cb.getLod(0);
		expect(lod.count).toBe(1);
		expect(lod.ids[0]).toBe(2);
		expect(lod.colors[3]).toBe(0);
	});

	it("a color-only change re-gathers rep colors without re-binning", () => {
		const cb = new CellBuffer();
		cb.append(entry(1, 10, 10));
		cb.append(entry(2, -170, -20));
		const a = cb.getLod(0);
		cb.patchColor(0, 9, 8, 7, 0);
		const b = cb.getLod(0);
		expect(b).toBe(a); // same entry, colors refreshed in place
		expect(b.version).toBeGreaterThan(0);
		const idx = Array.from(b.ids).indexOf(1);
		expect(Array.from(b.colors.subarray(idx * 4, idx * 4 + 4))).toEqual([9, 8, 7, 0]);
	});

	it("representatives carry the source marker's angle", () => {
		const cb = new CellBuffer();
		cb.append(entry(1, 10, 10, 255, 45));
		cb.append(entry(2, -170, -20, 255, 270));
		const lod = cb.getLod(0);
		expect(lod.count).toBe(2);
		const byId = new Map(Array.from(lod.ids).map((id, i) => [id, lod.angles[i]]));
		expect(byId.get(1)).toBe(45);
		expect(byId.get(2)).toBe(270);
	});
});

describe("CellBuffer.getLod: band cascade", () => {
	// lng 10 vs 10.5 at lat 10: distinct bins in the finest band, one bin in band 0.
	it("markers merging only at a coarse band resolve to the painter's topmost", () => {
		const cb = new CellBuffer();
		cb.append(entry(1, 10, 10));
		cb.append(entry(2, 10.5, 10));
		expect(cb.getLod(LOD_BANDS.length - 1).count).toBe(2);
		const coarse = cb.getLod(0);
		expect(coarse.count).toBe(1);
		expect(coarse.ids[0]).toBe(2);
	});

	it("topmost survives the cascade regardless of the finer band's rep order", () => {
		const cb = new CellBuffer();
		cb.append(entry(2, 10.5, 10));
		cb.append(entry(1, 10, 10));
		const coarse = cb.getLod(0);
		expect(coarse.count).toBe(1);
		expect(coarse.ids[0]).toBe(1); // higher cell index, drawn on top at full detail
	});

	it("seedLod installs a rep list equivalent to local binning", () => {
		const pts: [number, number, number][] = [
			[1, 10, 10],
			[2, 10.5, 10],
			[3, 10.5 + 1e-7, 10],
		];
		const cb = new CellBuffer();
		pts.forEach(([id, lng, lat]) => cb.append(entry(id, lng, lat)));
		const local = cb.getLod(LOD_BANDS.length - 1);
		const seeded = new CellBuffer();
		pts.forEach(([id, lng, lat]) => seeded.append(entry(id, lng, lat)));
		seeded.seedLod(LOD_BANDS.length - 1, (local as unknown as { srcIdx: Uint32Array }).srcIdx);
		const got = seeded.getLod(LOD_BANDS.length - 1);
		expect(Array.from(got.ids)).toEqual(Array.from(local.ids));
		expect(Array.from(got.positions)).toEqual(Array.from(local.positions));
		// And the seed survives as the cached entry (no rebuild on next access).
		expect(seeded.getLod(LOD_BANDS.length - 1)).toBe(got);
	});

	it("every coarse-band representative is also a finer-band representative", () => {
		const cb = new CellBuffer();
		const pts: [number, number][] = [
			[10, 10],
			[10.5, 10],
			[10 + 1e-7, 10],
			[-60, -10],
			[60, 20],
			[60.3, 20.2],
		];
		pts.forEach(([lng, lat], i) => cb.append(entry(i + 1, lng, lat)));
		let finerIds = new Set(Array.from(cb.getLod(LOD_BANDS.length - 1).ids));
		for (let band = LOD_BANDS.length - 2; band >= 0; band--) {
			const ids = new Set(Array.from(cb.getLod(band).ids));
			for (const id of ids) expect(finerIds.has(id)).toBe(true);
			finerIds = ids;
		}
	});
});

describe("CellBuffer.getLod: lazy cache", () => {
	it("returns the identical object when versions are unchanged", () => {
		const cb = new CellBuffer();
		cb.append(entry(1, 10, 10));
		const a = cb.getLod(0);
		const b = cb.getLod(0);
		expect(a).toBe(b);
	});

	it("bumps the version (in place) after patchColor", () => {
		const cb = new CellBuffer();
		cb.append(entry(1, 10, 10));
		const a = cb.getLod(0);
		const v = a.version;
		cb.patchColor(0, 1, 2, 3, 255);
		const b = cb.getLod(0);
		expect(b).toBe(a);
		expect(b.version).toBeGreaterThan(v);
	});

	it("rebuilds with a bumped version after append", () => {
		const cb = new CellBuffer();
		cb.append(entry(1, 10, 10));
		const a = cb.getLod(0);
		cb.append(entry(2, -170, -20));
		const b = cb.getLod(0);
		expect(b).not.toBe(a);
		expect(b.version).toBeGreaterThan(a.version);
	});

	it("caches are independent per band", () => {
		const cb = new CellBuffer();
		cb.append(entry(1, 10, 10));
		const band0 = cb.getLod(0);
		const band1 = cb.getLod(1);
		expect(band0).not.toBe(band1);
		expect(cb.getLod(0)).toBe(band0);
		expect(cb.getLod(1)).toBe(band1);
	});
});

describe("render cell bounds (mirrors Rust render_cell_idx)", () => {
	it("decodes known geohash-1 cells", () => {
		expect(cellBounds("s")).toEqual({ west: 0, south: 0, east: 45, north: 45 });
		expect(cellBounds("7")).toEqual({ west: -45, south: -45, east: 0, north: 0 });
		expect(cellBounds("0")).toEqual({ west: -180, south: -90, east: -135, north: -45 });
		expect(cellBounds("z")).toEqual({ west: 135, south: 45, east: 180, north: 90 });
	});

	it("every cell is 45x45 degrees and the 32 cells tile the world", () => {
		const GEOHASH32 = "0123456789bcdefghjkmnpqrstuvwxyz";
		let area = 0;
		for (const c of GEOHASH32) {
			const b = cellBounds(c);
			expect(b.east - b.west).toBe(45);
			expect(b.north - b.south).toBe(45);
			area += 45 * 45;
		}
		expect(area).toBe(360 * 180);
	});
});

describe("boundsIntersectCell", () => {
	const cellS = { west: 0, south: 0, east: 45, north: 45 };

	it("plain overlap and disjoint", () => {
		expect(boundsIntersectCell({ west: 40, south: 40, east: 50, north: 50 }, cellS)).toBe(true);
		expect(boundsIntersectCell({ west: 50, south: 0, east: 60, north: 45 }, cellS)).toBe(false);
		expect(boundsIntersectCell({ west: 0, south: 46, east: 45, north: 50 }, cellS)).toBe(false);
	});

	it("antimeridian-crossing view (west > east)", () => {
		const wrap = { west: 170, south: -10, east: -170, north: 10 };
		expect(boundsIntersectCell(wrap, cellBounds("r"))).toBe(true); // 135..180, -45..0
		expect(boundsIntersectCell(wrap, cellBounds("2"))).toBe(true); // -180..-135, -45..0
		expect(boundsIntersectCell(wrap, cellS)).toBe(false);
	});
});
