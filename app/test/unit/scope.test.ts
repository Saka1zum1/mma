import { describe, it, expect, vi } from "vitest";
import { applyScope, createScope } from "@/store/scope";

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

describe("createScope", () => {
	it("get/set holds and updates the scope, notifying subscribers", () => {
		const h = createScope({ kind: "all" });
		const cb = vi.fn();
		const unsub = h.subscribe(cb);
		expect(h.get()).toEqual({ kind: "all" });

		h.set({ kind: "selected" });
		expect(h.get()).toEqual({ kind: "selected" });
		expect(cb).toHaveBeenCalledTimes(1);

		h.set({ kind: "selected" }); // no-op, same kind
		expect(cb).toHaveBeenCalledTimes(1);

		unsub();
		h.set({ kind: "all" });
		expect(cb).toHaveBeenCalledTimes(1); // unsubscribed, not notified
	});

	it("handles are isolated — one consumer's choice never leaks into another", () => {
		const a = createScope({ kind: "all" });
		const b = createScope({ kind: "all" });
		a.set({ kind: "selected" });
		expect(a.get()).toEqual({ kind: "selected" });
		expect(b.get()).toEqual({ kind: "all" });
	});
});
