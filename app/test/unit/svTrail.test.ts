import { describe, it, expect, beforeEach } from "vitest";
import { resetTrail, pushTrail, clearTrail, getTrail } from "@/lib/sv/svTrail";

beforeEach(() => {
	clearTrail();
});

describe("svTrail", () => {
	it("starts empty", () => {
		expect(getTrail()).toEqual([]);
	});

	it("resetTrail sets a single point", () => {
		resetTrail(10, 20);
		expect(getTrail()).toEqual([[10, 20]]);
	});

	it("pushTrail appends a point", () => {
		resetTrail(10, 20);
		pushTrail(30, 40);
		expect(getTrail()).toEqual([
			[10, 20],
			[30, 40],
		]);
	});

	it("pushTrail deduplicates identical consecutive points", () => {
		resetTrail(10, 20);
		pushTrail(10, 20);
		expect(getTrail()).toEqual([[10, 20]]);
	});

	it("pushTrail allows same point after a different one", () => {
		resetTrail(10, 20);
		pushTrail(30, 40);
		pushTrail(10, 20);
		expect(getTrail()).toEqual([
			[10, 20],
			[30, 40],
			[10, 20],
		]);
	});

	it("clearTrail empties the trail", () => {
		resetTrail(10, 20);
		pushTrail(30, 40);
		clearTrail();
		expect(getTrail()).toEqual([]);
	});

	it("clearTrail on empty trail is a no-op", () => {
		clearTrail();
		expect(getTrail()).toEqual([]);
	});

	it("resetTrail replaces existing trail", () => {
		resetTrail(10, 20);
		pushTrail(30, 40);
		resetTrail(50, 60);
		expect(getTrail()).toEqual([[50, 60]]);
	});
});
