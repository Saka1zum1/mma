import { describe, it, expect, afterEach } from "vitest";
import {
	startMeasure,
	endMeasure,
	addMeasurePoint,
	moveMeasureNode,
	getMeasurePoints,
	measureLength,
} from "@/lib/sv/measure";
import { distMeters } from "@/lib/geo/geo";

const A = { lat: 40, lng: -74 };
const B = { lat: 40.01, lng: -74 };
const C = { lat: 40.01, lng: -73.99 };

afterEach(() => endMeasure());

describe("measure tool", () => {
	it("starts anchored at the clicked point with no length", () => {
		startMeasure(A);
		expect(getMeasurePoints()).toEqual([[A.lng, A.lat]]);
		expect(measureLength()).toBe(0);
	});

	it("sums every placed segment", () => {
		startMeasure(A);
		addMeasurePoint(B);
		expect(measureLength()).toBeCloseTo(distMeters(A, B), 6);
		addMeasurePoint(C);
		expect(measureLength()).toBeCloseTo(distMeters(A, B) + distMeters(B, C), 6);
	});

	it("remeasures when a node is dragged", () => {
		startMeasure(A);
		addMeasurePoint(B);
		moveMeasureNode(1, C);
		expect(getMeasurePoints()[1]).toEqual([C.lng, C.lat]);
		expect(measureLength()).toBeCloseTo(distMeters(A, C), 6);
	});

	it("ignores a drag of a node that does not exist", () => {
		startMeasure(A);
		moveMeasureNode(4, C);
		expect(getMeasurePoints()).toEqual([[A.lng, A.lat]]);
	});

	it("takes no points once ended", () => {
		startMeasure(A);
		endMeasure();
		addMeasurePoint(B);
		expect(getMeasurePoints()).toEqual([]);
		expect(measureLength()).toBe(0);
	});
});
