import { describe, it, expect, vi } from "vitest";
import { boundsToTiles, fetchPanoDots, peekPanoDots, tileKey } from "@/lib/geo/photometa";

describe("boundsToTiles", () => {
	it("returns at least one tile for a small area", () => {
		const tiles = boundsToTiles(-74.01, 40.71, -74.0, 40.72);
		expect(tiles.length).toBeGreaterThanOrEqual(1);
	});

	it("returns more tiles for a larger area", () => {
		const small = boundsToTiles(-74.01, 40.71, -74.0, 40.72);
		const large = boundsToTiles(-74.05, 40.7, -73.95, 40.75);
		expect(large.length).toBeGreaterThan(small.length);
	});

	it("each tile has x and y", () => {
		const tiles = boundsToTiles(-74.01, 40.71, -74.0, 40.72);
		for (const t of tiles) {
			expect(typeof t.x).toBe("number");
			expect(typeof t.y).toBe("number");
		}
	});
});

describe("tileKey", () => {
	it("produces comma-separated string", () => {
		expect(tileKey({ x: 10, y: 20 })).toBe("10,20");
	});
});

describe("peekPanoDots", () => {
	const body =
		")]}'\n" + JSON.stringify([null, [null, [[[[null, "pid1"], null, [[null, null, 1.5, 2.5]]]]]]]);

	it("is undefined before fetch, undefined in flight, stable array after resolve", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: true, text: async () => body })),
		);
		try {
			const tile = { x: 111111, y: 222222 };
			expect(peekPanoDots(tile)).toBeUndefined();

			const pending = fetchPanoDots(tile);
			expect(pending).toBeInstanceOf(Promise);
			expect(peekPanoDots(tile)).toBeUndefined();

			const dots = await pending;
			expect(dots).toEqual([{ lat: 1.5, lng: 2.5, panoId: "pid1" }]);
			expect(peekPanoDots(tile)).toBe(dots);
			expect(fetchPanoDots(tile)).toBe(dots);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
