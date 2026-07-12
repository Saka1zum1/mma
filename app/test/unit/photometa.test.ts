import { describe, it, expect } from "vitest";
import { boundsToTiles, tileKey } from "@/lib/geo/photometa";

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
