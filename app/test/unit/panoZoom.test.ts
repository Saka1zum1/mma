import { describe, it, expect } from "vitest";
import { PANO_ZOOM, displayZoom, storedZoom, zoomInStep, zoomOutStep } from "@/lib/sv/constants";

describe("pano zoom stored/display mapping", () => {
	it("renders unset (0) as fully zoomed out", () => {
		expect(displayZoom(0)).toBe(PANO_ZOOM.min);
	});

	it("passes explicit zooms through to display", () => {
		expect(displayZoom(2.5)).toBe(2.5);
		expect(displayZoom(-0.5)).toBe(-0.5);
	});

	it("normalizes the floor back to unset on save", () => {
		expect(storedZoom(PANO_ZOOM.min)).toBe(0);
		expect(storedZoom(PANO_ZOOM.min - 1)).toBe(0);
	});

	it("persists partial negative zooms", () => {
		expect(storedZoom(-0.5)).toBe(-0.5);
		expect(storedZoom(1.25)).toBe(1.25);
	});

	it("steps out down the grid to 0, then fully out, never past the floor", () => {
		expect(zoomOutStep(2)).toBe(1);
		expect(zoomOutStep(1)).toBe(0);
		expect(zoomOutStep(0)).toBe(PANO_ZOOM.min);
		expect(zoomOutStep(-1.5)).toBe(PANO_ZOOM.min);
		expect(zoomOutStep(PANO_ZOOM.min)).toBe(PANO_ZOOM.min);
	});

	it("steps in from fully-out back to 0, then up the grid to the max", () => {
		expect(zoomInStep(PANO_ZOOM.min)).toBe(0);
		expect(zoomInStep(-0.5)).toBe(0);
		expect(zoomInStep(0)).toBe(1);
		expect(zoomInStep(PANO_ZOOM.max)).toBe(PANO_ZOOM.max);
	});

	it("round-trips: save(display(stored)) is stable", () => {
		for (const stored of [0, -0.5, 1, 4, PANO_ZOOM.min]) {
			const normalized = storedZoom(displayZoom(stored));
			expect(storedZoom(displayZoom(normalized))).toBe(normalized);
		}
		expect(storedZoom(displayZoom(0))).toBe(0);
	});
});
