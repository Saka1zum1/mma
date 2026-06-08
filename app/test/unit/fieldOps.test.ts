import { describe, it, expect } from "vitest";
import {
	planFieldMove,
	planFieldDelete,
	planFieldSet,
	fieldPatch,
	groupByField,
	rewriteSelectionFields,
} from "@/lib/data/fieldOps";
import { buildSelection } from "@/store/selections";
import type { Location, MapData } from "@/types";

function makeLoc(id: number, extra?: Record<string, unknown>): Location {
	return {
		id,
		lat: 0,
		lng: 0,
		heading: 0,
		pitch: 0,
		zoom: 0,
		panoId: null,
		flags: 0,
		tags: [],
		extra,
		createdAt: "",
		modifiedAt: null,
	} as Location;
}

const map = { meta: { tags: {} } } as unknown as MapData;

describe("planFieldMove", () => {
	it("renames a key (target absent)", () => {
		const out = planFieldMove([makeLoc(1, { a: 5 })], "a", "b", "from");
		expect(out).toEqual([{ id: 1, patch: { extra: { b: 5 } } }]);
	});

	it("merge: winner 'from' takes the moved value", () => {
		const out = planFieldMove([makeLoc(1, { a: 5, b: 9 })], "a", "b", "from");
		expect(out).toEqual([{ id: 1, patch: { extra: { b: 5 } } }]);
	});

	it("merge: winner 'to' keeps the existing target value", () => {
		const out = planFieldMove([makeLoc(1, { a: 5, b: 9 })], "a", "b", "to");
		expect(out).toEqual([{ id: 1, patch: { extra: { b: 9 } } }]);
	});

	it("skips locations without the source key", () => {
		expect(planFieldMove([makeLoc(1, { x: 1 })], "a", "b", "from")).toEqual([]);
	});

	it("preserves unrelated keys", () => {
		const out = planFieldMove([makeLoc(1, { a: 5, keep: 1 })], "a", "b", "from");
		expect(out[0].patch.extra).toEqual({ b: 5, keep: 1 });
	});

	it("is a no-op when from === to or to is empty", () => {
		expect(planFieldMove([makeLoc(1, { a: 5 })], "a", "a", "from")).toEqual([]);
		expect(planFieldMove([makeLoc(1, { a: 5 })], "a", "", "from")).toEqual([]);
	});
});

describe("planFieldDelete", () => {
	it("removes the key from locations that have it", () => {
		const out = planFieldDelete([makeLoc(1, { a: 5, b: 9 }), makeLoc(2, { b: 1 })], "a");
		expect(out).toEqual([{ id: 1, patch: { extra: { b: 9 } } }]);
	});
});

describe("planFieldSet", () => {
	it("sets an extra value, creating extra when absent", () => {
		const out = planFieldSet([makeLoc(1), makeLoc(2, { k: "old" })], { extra: { k: "new" } });
		expect(out).toEqual([
			{ id: 1, patch: { extra: { k: "new" } } },
			{ id: 2, patch: { extra: { k: "new" } } },
		]);
	});

	it("merges into existing extra, preserving other keys", () => {
		const out = planFieldSet([makeLoc(1, { keep: 1 })], { extra: { k: "new" } });
		expect(out).toEqual([{ id: 1, patch: { extra: { keep: 1, k: "new" } } }]);
	});

	it("skips locations whose extra value already matches", () => {
		expect(planFieldSet([makeLoc(1, { k: "v" })], { extra: { k: "v" } })).toEqual([]);
	});

	it("patches a top-level field directly", () => {
		const out = planFieldSet([makeLoc(1), makeLoc(2)], { heading: 90 });
		expect(out).toEqual([
			{ id: 1, patch: { heading: 90 } },
			{ id: 2, patch: { heading: 90 } },
		]);
	});

	it("skips top-level fields already equal", () => {
		const loc = makeLoc(1);
		(loc as Record<string, unknown>).pitch = 10;
		expect(planFieldSet([loc], { pitch: 10 })).toEqual([]);
	});
});

describe("fieldPatch", () => {
	it("nests unknown keys under extra", () => {
		expect(fieldPatch("foo", 5)).toEqual({ extra: { foo: 5 } });
	});

	it("places built-in keys at the top level", () => {
		expect(fieldPatch("heading", 90)).toEqual({ heading: 90 });
	});
});

describe("groupByField", () => {
	it("groups locations by their extra field value", () => {
		const locs = [
			makeLoc(1, { country: "FR" }),
			makeLoc(2, { country: "DE" }),
			makeLoc(3, { country: "FR" }),
		];
		const groups = groupByField(locs, "country");
		expect(groups.get("FR")).toEqual([1, 3]);
		expect(groups.get("DE")).toEqual([2]);
		expect(groups.size).toBe(2);
	});

	it("skips locations with null, undefined, or empty string values", () => {
		const locs = [
			makeLoc(1, { x: null }),
			makeLoc(2, { x: undefined }),
			makeLoc(3, { x: "" }),
			makeLoc(4, { x: "val" }),
			makeLoc(5), // no extra at all
		];
		const groups = groupByField(locs, "x");
		expect(groups.size).toBe(1);
		expect(groups.get("val")).toEqual([4]);
	});

	it("coerces non-string values to strings", () => {
		const locs = [makeLoc(1, { n: 42 }), makeLoc(2, { n: 42 })];
		const groups = groupByField(locs, "n");
		expect(groups.get("42")).toEqual([1, 2]);
	});

	it("returns an empty map when no locations have the field", () => {
		expect(groupByField([makeLoc(1, { other: "x" })], "missing").size).toBe(0);
	});
});

describe("rewriteSelectionFields", () => {
	const filter = (field: string) =>
		buildSelection({ type: "Filter", field, op: "eq", value: 1, value2: null });

	it("rewrites a Filter field and regenerates its key", () => {
		const out = rewriteSelectionFields([filter("a")], "a", "b");
		expect(out).toHaveLength(1);
		expect((out[0].props as { field: string }).field).toBe("b");
		expect(out[0].key).toBe("filter:b:eq:1");
	});

	it("leaves unrelated filters untouched", () => {
		const f = filter("c");
		const out = rewriteSelectionFields([f], "a", "b");
		expect(out[0].key).toBe(f.key);
	});

	it("drops a Filter when the field is deleted (to = null)", () => {
		expect(rewriteSelectionFields([filter("a")], "a", null)).toEqual([]);
	});

	it("rewrites filters nested in a composite", () => {
		const union = buildSelection({ type: "Union", selections: [filter("a"), filter("c")] });
		const out = rewriteSelectionFields([union], "a", "b");
		const children = (out[0].props as { selections: { props: { field: string } }[] }).selections;
		expect(children.map((c) => c.props.field)).toEqual(["b", "c"]);
	});

	it("collapses a group to its sole survivor when a child is deleted", () => {
		const tag = buildSelection({ type: "Tag", tagId: 1 });
		const union = buildSelection({ type: "Union", selections: [filter("a"), tag] });
		const out = rewriteSelectionFields([union], "a", null);
		expect(out).toHaveLength(1);
		expect(out[0].props.type).toBe("Tag");
	});
});
