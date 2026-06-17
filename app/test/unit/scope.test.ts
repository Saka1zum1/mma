import { describe, it, expect } from "vitest";
import { applyScope } from "@/store/useMapStore";

describe("applyScope", () => {
	const pool = [{ id: 1 }, { id: 2 }, { id: 3 }];

	it("'all' is the identity over any pool (no copy)", () => {
		expect(applyScope({ kind: "all" }, pool)).toBe(pool);
	});

	it("'selected' narrows the pool to the live selection (empty by default → [])", () => {
		expect(applyScope({ kind: "selected" }, pool)).toEqual([]);
	});

	it("is pool-agnostic: operates on any id-bearing records, not just Locations", () => {
		const records = [
			{ id: 7, name: "a" },
			{ id: 8, name: "b" },
		];
		expect(applyScope({ kind: "all" }, records)).toEqual(records);
	});
});
