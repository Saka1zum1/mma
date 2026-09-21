import { describe, expect, it } from "vitest";
import { applyCounts, type Preview } from "@/components/editor/tags/applyCounts";

const preview = (partial: Partial<Preview>): Preview => ({
	total: 100,
	have: 80,
	groups: 12,
	covered: 80,
	...partial,
});

describe("applyCounts", () => {
	it("counts one tag per group and only the grouped locations", () => {
		expect(applyCounts(preview({}), false)).toEqual({ tags: 12, locations: 80 });
	});

	it("adds one missing tag when ungrouped rows are tagged too", () => {
		expect(applyCounts(preview({}), true)).toEqual({ tags: 13, locations: 100 });
	});

	it("does not invent a missing tag when every row already grouped", () => {
		expect(applyCounts(preview({ total: 80, have: 80, covered: 80 }), true)).toEqual({
			tags: 12,
			locations: 80,
		});
	});

	it("is empty when nothing grouped and missing rows are not tagged", () => {
		expect(applyCounts(preview({ groups: 0, covered: 0, have: 0 }), false)).toEqual({
			tags: 0,
			locations: 0,
		});
	});
});
