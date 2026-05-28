import { describe, it, expect } from "vitest";
import { lerp, gradientColor, isNumericField } from "@/plugins/gradient/gradientMath";

describe("lerp", () => {
	it("t=0 returns first color", () => {
		expect(lerp([10, 20, 30], [200, 100, 50], 0)).toEqual([10, 20, 30]);
	});

	it("t=1 returns second color", () => {
		expect(lerp([10, 20, 30], [200, 100, 50], 1)).toEqual([200, 100, 50]);
	});

	it("t=0.5 returns midpoint", () => {
		expect(lerp([0, 0, 0], [100, 100, 100], 0.5)).toEqual([50, 50, 50]);
	});

	it("t=0.25 returns quarter point", () => {
		expect(lerp([0, 0, 0], [100, 200, 40], 0.25)).toEqual([25, 50, 10]);
	});

	it("rounds to integers", () => {
		expect(lerp([0, 0, 0], [1, 1, 1], 0.5)).toEqual([1, 1, 1]);
		expect(lerp([0, 0, 0], [3, 3, 3], 0.5)).toEqual([2, 2, 2]);
	});

	it("identical colors return same", () => {
		expect(lerp([42, 99, 200], [42, 99, 200], 0.7)).toEqual([42, 99, 200]);
	});

	it("handles negative channel interpolation", () => {
		expect(lerp([200, 200, 200], [0, 0, 0], 0.5)).toEqual([100, 100, 100]);
	});
});

describe("gradientColor", () => {
	const twoStops: [number, number, number][] = [
		[0, 0, 0],
		[255, 255, 255],
	];

	const threeStops: [number, number, number][] = [
		[255, 0, 0],
		[0, 255, 0],
		[0, 0, 255],
	];

	it("t=0 returns first stop", () => {
		expect(gradientColor(twoStops, 0)).toEqual([0, 0, 0]);
	});

	it("t=1 returns last stop", () => {
		expect(gradientColor(twoStops, 1)).toEqual([255, 255, 255]);
	});

	it("t<0 clamps to first stop", () => {
		expect(gradientColor(twoStops, -0.5)).toEqual([0, 0, 0]);
	});

	it("t>1 clamps to last stop", () => {
		expect(gradientColor(twoStops, 1.5)).toEqual([255, 255, 255]);
	});

	it("t=0.5 with 2 stops returns midpoint", () => {
		expect(gradientColor(twoStops, 0.5)).toEqual([128, 128, 128]);
	});

	it("3 stops: t=0 first, t=0.5 second, t=1 third", () => {
		expect(gradientColor(threeStops, 0)).toEqual([255, 0, 0]);
		expect(gradientColor(threeStops, 0.5)).toEqual([0, 255, 0]);
		expect(gradientColor(threeStops, 1)).toEqual([0, 0, 255]);
	});

	it("3 stops: t=0.25 midpoint of first two", () => {
		expect(gradientColor(threeStops, 0.25)).toEqual([128, 128, 0]);
	});

	it("5 stops at segment boundaries", () => {
		const fiveStops: [number, number, number][] = [
			[10, 0, 0],
			[20, 0, 0],
			[30, 0, 0],
			[40, 0, 0],
			[50, 0, 0],
		];
		expect(gradientColor(fiveStops, 0)).toEqual([10, 0, 0]);
		expect(gradientColor(fiveStops, 0.25)).toEqual([20, 0, 0]);
		expect(gradientColor(fiveStops, 0.5)).toEqual([30, 0, 0]);
		expect(gradientColor(fiveStops, 0.75)).toEqual([40, 0, 0]);
		expect(gradientColor(fiveStops, 1)).toEqual([50, 0, 0]);
	});

	it("single stop returns it for any t", () => {
		const oneStop: [number, number, number][] = [[42, 42, 42]];
		expect(gradientColor(oneStop, 0)).toEqual([42, 42, 42]);
		expect(gradientColor(oneStop, 1)).toEqual([42, 42, 42]);
	});
});

describe("isNumericField", () => {
	it("undefined returns false", () => {
		expect(isNumericField(undefined)).toBe(false);
	});

	it("number type returns true", () => {
		expect(isNumericField({ type: "number" })).toBe(true);
	});

	it("date type returns true", () => {
		expect(isNumericField({ type: "date" })).toBe(true);
	});

	it("string type returns false", () => {
		expect(isNumericField({ type: "string" })).toBe(false);
	});

	it("enum type returns false", () => {
		expect(isNumericField({ type: "enum" })).toBe(false);
	});

	it("month type returns false", () => {
		expect(isNumericField({ type: "month" })).toBe(false);
	});
});
