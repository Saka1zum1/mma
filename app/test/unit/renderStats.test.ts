import { describe, it, expect } from "vitest";
import { markerQuadPx, countInBounds } from "@/lib/render/renderStats";
import { MARKER_STYLE } from "@/lib/render/markerLayer";

describe("markerQuadPx", () => {
	it("quad extends radius + 0.5px smooth edge per side", () => {
		// pin: radius 16, size 1, dpr 1 -> side 33 -> 1089
		expect(markerQuadPx(16, 1, 1)).toBe(33 ** 2);
	});

	it("scales linearly with size and dpr in each dimension", () => {
		// circle: radius 6 at 2x size, 2x dpr -> side (6*2 + 0.5) * 2 * 2 = 50
		expect(markerQuadPx(6, 2, 2)).toBe(50 ** 2);
	});

	it("circle quad matches scatterplot-tight bounds (regression: 6/0.7 padding)", () => {
		const side = Math.sqrt(markerQuadPx(MARKER_STYLE.circle.radiusPixels, 1, 1));
		expect(side).toBe(13); // 2 * (6 + 0.5)
	});
});

function cell(coords: [number, number][]): { count: number; positions: Float32Array } {
	const positions = new Float32Array(coords.length * 2);
	coords.forEach(([lng, lat], i) => {
		positions[i * 2] = lng;
		positions[i * 2 + 1] = lat;
	});
	return { count: coords.length, positions };
}

describe("countInBounds", () => {
	const b = { west: -10, south: -5, east: 10, north: 5 };

	it("counts only markers inside the bounds", () => {
		const c = cell([
			[0, 0], // in
			[-10, -5], // on edge: in
			[11, 0], // east of bounds
			[0, 6], // north of bounds
		]);
		expect(countInBounds([c], b)).toBe(2);
	});

	it("sums across cells", () => {
		expect(countInBounds([cell([[0, 0]]), cell([[1, 1]])], b)).toBe(2);
	});

	it("handles antimeridian-crossing bounds (west > east)", () => {
		const wrap = { west: 170, south: -10, east: -170, north: 10 };
		const c = cell([
			[175, 0], // in (east of west edge)
			[-175, 0], // in (west of east edge)
			[0, 0], // out (opposite side of the world)
		]);
		expect(countInBounds([c], wrap)).toBe(2);
	});

	it("respects count over buffer capacity", () => {
		const c = cell([
			[0, 0],
			[1, 1],
		]);
		c.count = 1; // trailing slot is stale data
		expect(countInBounds([c], b)).toBe(1);
	});
});
