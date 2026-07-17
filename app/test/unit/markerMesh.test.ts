import { describe, it, expect } from "vitest";
import {
	sdCircle,
	sdArrow,
	sdPin,
	sdShape,
	markerDistancePx,
	interiorMesh,
	PICK_SLOP_PX,
	type MarkerShape,
} from "@/lib/render/sdf-marker-layer/markerMesh";

describe("SDF sanity", () => {
	it("sdCircle(0,0) is inside (negative)", () => {
		expect(sdCircle(0, 0)).toBeLessThan(0);
	});

	it("sdCircle(1,0) is on the edge (circle inscribes the unit quad)", () => {
		expect(sdCircle(1, 0)).toBeCloseTo(0, 9);
	});

	it("sdPin at the tip (unit 0, 0.9) is on the edge", () => {
		expect(sdPin(0, 0.9)).toBeCloseTo(0, 6);
	});

	it("sdPin at the head center (unit 0, -0.3) is -0.65", () => {
		expect(sdPin(0, -0.3)).toBeCloseTo(-0.65, 9);
	});

	it("sdArrow inside the shaft is negative", () => {
		expect(sdArrow(0, 0.3)).toBeLessThan(0);
	});

	it("sdArrow well outside the shape is positive", () => {
		expect(sdArrow(1, 0)).toBeGreaterThan(0);
	});
});

describe("markerDistancePx: pin tip-anchor", () => {
	const radiusPx = 16;

	it("cursor exactly at the anchor is a hit (tip)", () => {
		const d = markerDistancePx("pin", 0, 0, radiusPx);
		expect(d).toBeCloseTo(0, 6);
		expect(d).toBeLessThanOrEqual(PICK_SLOP_PX);
	});

	it("cursor 20px below the anchor misses (pin body sits above the anchor)", () => {
		const d = markerDistancePx("pin", 0, 20, radiusPx);
		expect(d).toBeGreaterThan(PICK_SLOP_PX);
	});

	it("dyDown = -0.9*radiusPx evaluates the shape at its pre-shift unit origin", () => {
		// The pin's tip-anchor shift subtracts 0.9*radiusPx from sy; canceling it
		// with dyDown = -0.9*radiusPx lands exactly on sdPin(0, 0).
		const d = markerDistancePx("pin", 0, -0.9 * radiusPx, radiusPx);
		expect(d).toBeCloseTo(sdPin(0, 0) * radiusPx, 6);
	});
});

describe("markerDistancePx: arrow rotation", () => {
	// A cursor offset chosen so it hits the shaft at angle 0 but clears the
	// whole shape once rotated 45 degrees.
	const dx = -0.84;
	const dyDown = 6.12;
	const radiusPx = 12;

	it("hits at angle 0", () => {
		expect(markerDistancePx("arrow", dx, dyDown, radiusPx, 0)).toBeLessThanOrEqual(PICK_SLOP_PX);
	});

	it("misses at angle 45", () => {
		expect(markerDistancePx("arrow", dx, dyDown, radiusPx, 45)).toBeGreaterThan(PICK_SLOP_PX);
	});
});

describe("interiorMesh: inscribed invariant", () => {
	const shapes: MarkerShape[] = ["circle", "arrow", "pin"];
	const margins = [0.05, 0.09, 0.125, 0.1875];

	for (const shape of shapes) {
		for (const margin of margins) {
			it(`${shape} margin ${margin}: every shrunk outline vertex stays inside`, () => {
				const mesh = interiorMesh(shape);
				const n = mesh.positions.length / 3;
				for (let i = 1; i < n; i++) {
					const px = mesh.positions[i * 3];
					const py = mesh.positions[i * 3 + 1];
					const nx = mesh.normals[i * 2];
					const ny = mesh.normals[i * 2 + 1];
					const sx = px - nx * margin;
					const sy = py - ny * margin;
					expect(sdShape(shape, sx, sy)).toBeLessThanOrEqual(1e-6);
				}
			});

			it(`${shape} margin ${margin}: every shrunk triangle-edge midpoint stays inside`, () => {
				const mesh = interiorMesh(shape);
				const shrink = (i: number): [number, number] => [
					mesh.positions[i * 3] - mesh.normals[i * 2] * margin,
					mesh.positions[i * 3 + 1] - mesh.normals[i * 2 + 1] * margin,
				];
				for (let t = 0; t < mesh.indices.length; t += 3) {
					const a = shrink(mesh.indices[t]);
					const b = shrink(mesh.indices[t + 1]);
					const c = shrink(mesh.indices[t + 2]);
					for (const [p, q] of [
						[a, b],
						[b, c],
						[c, a],
					] as const) {
						const mx = (p[0] + q[0]) / 2;
						const my = (p[1] + q[1]) / 2;
						expect(sdShape(shape, mx, my)).toBeLessThanOrEqual(1e-6);
					}
				}
			});
		}

		it(`${shape}: fan center has zero normal and is inside`, () => {
			const mesh = interiorMesh(shape);
			expect(mesh.normals[0]).toBe(0);
			expect(mesh.normals[1]).toBe(0);
			expect(sdShape(shape, mesh.positions[0], mesh.positions[1])).toBeLessThan(0);
		});
	}
});

describe("interiorMesh: caching", () => {
	it("returns the identical object on a second call", () => {
		expect(interiorMesh("pin")).toBe(interiorMesh("pin"));
		expect(interiorMesh("arrow")).toBe(interiorMesh("arrow"));
		expect(interiorMesh("circle")).toBe(interiorMesh("circle"));
	});
});
