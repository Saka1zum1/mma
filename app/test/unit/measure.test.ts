// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

vi.mock("measuretool-googlemaps-v3", () => ({ default: class {} }));
vi.mock("@/types", () => ({
	Location: {},
}));
vi.mock("@/lib/util/syncStore", async (importOriginal) => importOriginal());

import { formatDistance, computeScore } from "@/lib/sv/measure";

describe("formatDistance", () => {
	it("formats 500 meters as '500 m'", () => {
		expect(formatDistance(500)).toBe("500 m");
	});

	it("formats 1001 meters as km", () => {
		expect(formatDistance(1001)).toBe("1 km");
	});

	it("formats 1500 meters as '1.5 km'", () => {
		expect(formatDistance(1500)).toBe("1.5 km");
	});

	it("formats 0 meters as '0 m'", () => {
		expect(formatDistance(0)).toBe("0 m");
	});

	it("formats 999 meters as '999 m'", () => {
		expect(formatDistance(999)).toBe("999 m");
	});

	it("formats exactly 1000 meters as '1,000 m' (not over threshold)", () => {
		expect(formatDistance(1000)).toBe("1,000 m");
	});

	it("formats 50000 meters as '50 km'", () => {
		expect(formatDistance(50000)).toBe("50 km");
	});

	it("formats 123456 meters as '123.46 km'", () => {
		expect(formatDistance(123456)).toBe("123.46 km");
	});
});

describe("computeScore", () => {
	it("returns 5000 for distance <= 25", () => {
		expect(computeScore(25)).toBe(5000);
	});

	it("returns 5000 for distance = 0", () => {
		expect(computeScore(0)).toBe(5000);
	});

	it("returns 5000 for exactly 25 meters", () => {
		expect(computeScore(25)).toBe(5000);
	});

	it("returns 0 for extremely large distance", () => {
		const score = computeScore(100_000_000);
		expect(score).toBe(0);
	});

	it("score decreases monotonically as distance increases", () => {
		const distances = [500, 1000, 5000, 10000, 100000, 1000000];
		const scores = distances.map((d) => computeScore(d));
		for (let i = 1; i < scores.length; i++) {
			expect(scores[i]).toBeLessThan(scores[i - 1]);
		}
	});

	it("returns score between 0 and 5000 for distances > 25", () => {
		for (const d of [1000, 10000, 100000, 1000000]) {
			const score = computeScore(d);
			expect(score).toBeGreaterThanOrEqual(0);
			expect(score).toBeLessThanOrEqual(5000);
		}
	});

	it("custom maxErrorDistance changes the score curve", () => {
		const defaultScore = computeScore(1000);
		const widerScore = computeScore(1000, 500);
		expect(defaultScore).not.toBe(widerScore);
	});

	it("returns near-perfect score for 100m with default max", () => {
		const score = computeScore(100);
		expect(score).toBe(5000);
	});
});
