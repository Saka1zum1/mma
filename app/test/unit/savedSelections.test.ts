/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

// The store binds tag lookups internally; back them with a settable fake tag set.
const h = vi.hoisted(() => ({
	tags: {} as Record<number, { id: number; name: string; color: string; visible: boolean }>,
	saved: [] as unknown[],
	resolve: undefined as unknown as ReturnType<typeof vi.fn>,
}));
vi.mock("@/store/useMapStore", () => ({
	addSelections: vi.fn(),
	getTag: (id: number) => h.tags[id],
	getVisibleTags: () => Object.values(h.tags).filter((t) => t.visible !== false),
}));
vi.mock("@/store/settings", () => ({
	getSettings: () => ({ savedSelections: h.saved }),
	setSetting: vi.fn(),
}));
vi.mock("@/lib/commands", () => ({
	cmd: { storeResolveSelection: (props: unknown) => h.resolve(props) },
}));

import {
	selectionToSaved,
	savedToSelectionProps,
	describeRule,
	rewriteSavedSelectionFields,
	resolveSavedSelectionIds,
	type SavedSelection,
	type SavedSelectionProps,
} from "@/store/savedSelections";
import type { Selection } from "@/bindings.gen";

beforeEach(() => {
	h.tags = {};
	h.saved = [];
	h.resolve = vi.fn();
});

function makeSel(props: Selection["props"]): Selection {
	return { key: "test", color: [100, 100, 100], props };
}

// ============================================================================
// rewriteSavedSelectionFields
// ============================================================================

describe("rewriteSavedSelectionFields", () => {
	const wrap = (props: SavedSelectionProps): SavedSelection => ({
		id: "s1",
		name: "n",
		items: [{ props, color: [0, 0, 0] }],
		createdAt: 0,
	});

	it("renames a Filter field", () => {
		const out = rewriteSavedSelectionFields(
			[wrap({ type: "Filter", field: "a", op: "eq", value: 1 })],
			"a",
			"b",
		);
		expect((out[0].items[0].props as any).field).toBe("b");
	});

	it("drops a saved selection whose only Filter is deleted", () => {
		const out = rewriteSavedSelectionFields(
			[wrap({ type: "Filter", field: "a", op: "eq", value: 1 })],
			"a",
			null,
		);
		expect(out).toEqual([]);
	});

	it("rewrites filters nested in a composite and collapses singletons", () => {
		const out = rewriteSavedSelectionFields(
			[
				wrap({
					type: "Union",
					selections: [{ type: "Filter", field: "a", op: "eq", value: 1 }, { type: "Untagged" }],
				}),
			],
			"a",
			null,
		);
		// Union loses its Filter child, collapsing to the lone Untagged
		expect(out[0].items[0].props.type).toBe("Untagged");
	});
});

// ============================================================================
// selectionToSaved
// ============================================================================

describe("selectionToSaved", () => {
	it("converts Everything selection", () => {
		const result = selectionToSaved(makeSel({ type: "Everything" }));
		expect(result).toEqual({ type: "Everything" });
	});

	it("converts Untagged selection", () => {
		const result = selectionToSaved(makeSel({ type: "Untagged" }));
		expect(result).toEqual({ type: "Untagged" });
	});

	it("converts Unpanned selection", () => {
		const result = selectionToSaved(makeSel({ type: "Unpanned" }));
		expect(result).toEqual({ type: "Unpanned" });
	});

	it("converts PanoIds selection", () => {
		const result = selectionToSaved(makeSel({ type: "PanoIds" }));
		expect(result).toEqual({ type: "PanoIds" });
	});

	it("converts NotPanoIds selection", () => {
		const result = selectionToSaved(makeSel({ type: "NotPanoIds" }));
		expect(result).toEqual({ type: "NotPanoIds" });
	});

	it("converts Duplicates selection with distance", () => {
		const result = selectionToSaved(makeSel({ type: "Duplicates", distance: 50 }));
		expect(result).toEqual({ type: "Duplicates", distance: 50 });
	});

	it("converts Tag selection to TagName using map tag lookup", () => {
		h.tags = { 7: { id: 7, name: "Mountains", color: "#ff0000", visible: true } };
		const result = selectionToSaved(makeSel({ type: "Tag", tagId: 7 }));
		expect(result).toEqual({ type: "TagName", tagName: "Mountains" });
	});

	it("returns null for Tag selection with unknown tagId", () => {
		const result = selectionToSaved(makeSel({ type: "Tag", tagId: 999 }));
		expect(result).toBeNull();
	});

	it("returns null for Manual selection (not saveable)", () => {
		const result = selectionToSaved(makeSel({ type: "Manual", locations: [1, 2, 3] }));
		expect(result).toBeNull();
	});

	it("returns null for Locations selection (not saveable)", () => {
		const result = selectionToSaved(makeSel({ type: "Locations", locations: [1, 2], name: null }));
		expect(result).toBeNull();
	});

	it("returns null for ValidationState selection (not saveable)", () => {
		const result = selectionToSaved(makeSel({ type: "ValidationState", locations: [1], state: 0 }));
		expect(result).toBeNull();
	});

	it("converts Filter selection", () => {
		const result = selectionToSaved(
			makeSel({ type: "Filter", field: "altitude", op: "gt", value: 1000, value2: null }),
		);
		expect(result).toEqual({
			type: "Filter",
			field: "altitude",
			op: "gt",
			value: 1000,
			value2: null,
		});
	});

	it("converts Union of saveable children", () => {
		h.tags = { 1: { id: 1, name: "A", color: "#aaa", visible: true } };
		const sel = makeSel({
			type: "Union",
			selections: [
				{ key: "panoids", color: [0, 0, 0], props: { type: "PanoIds" } },
				{ key: "tag:1", color: [0, 0, 0], props: { type: "Tag", tagId: 1 } },
			],
		});
		const result = selectionToSaved(sel);
		expect(result).toEqual({
			type: "Union",
			selections: [{ type: "PanoIds" }, { type: "TagName", tagName: "A" }],
		});
	});

	it("returns null for composite where all children are unsaveable", () => {
		const sel = makeSel({
			type: "Intersection",
			selections: [{ key: "manual", color: [0, 0, 0], props: { type: "Manual", locations: [1] } }],
		});
		const result = selectionToSaved(sel);
		expect(result).toBeNull();
	});
});

// ============================================================================
// savedToSelectionProps
// ============================================================================

describe("savedToSelectionProps", () => {
	it("resolves TagName to Tag using map lookup (case-insensitive)", () => {
		h.tags = { 3: { id: 3, name: "Coastal", color: "#00f", visible: true } };
		const result = savedToSelectionProps({ type: "TagName", tagName: "coastal" });
		expect(result).toEqual({ type: "Tag", tagId: 3 });
	});

	it("returns null for TagName when tag no longer exists", () => {
		const result = savedToSelectionProps({ type: "TagName", tagName: "Deleted" });
		expect(result).toBeNull();
	});

	it("passes through Everything unchanged", () => {
		const result = savedToSelectionProps({ type: "Everything" });
		expect(result).toEqual({ type: "Everything" });
	});

	it("passes through PanoIds unchanged", () => {
		const result = savedToSelectionProps({ type: "PanoIds" });
		expect(result).toEqual({ type: "PanoIds" });
	});

	it("passes through Filter unchanged", () => {
		const saved: SavedSelectionProps = {
			type: "Filter",
			field: "altitude",
			op: "between",
			value: 0,
			value2: 5000,
		};
		const result = savedToSelectionProps(saved);
		expect(result).toEqual(saved);
	});

	it("returns null for composite with all unresolvable children", () => {
		const saved: SavedSelectionProps = {
			type: "Intersection",
			selections: [{ type: "TagName", tagName: "NoSuchTag" }],
		};
		const result = savedToSelectionProps(saved);
		expect(result).toBeNull();
	});

	it("resolves composite with mixed resolvable/unresolvable children", () => {
		h.tags = { 1: { id: 1, name: "Valid", color: "#aaa", visible: true } };
		const saved: SavedSelectionProps = {
			type: "Union",
			selections: [
				{ type: "TagName", tagName: "Valid" },
				{ type: "TagName", tagName: "Missing" },
			],
		};
		const result = savedToSelectionProps(saved);
		expect(result).not.toBeNull();
		expect(result!.type).toBe("Union");
		if (result!.type === "Union") {
			expect(result!.selections).toHaveLength(1);
			expect(result!.selections[0].props.type).toBe("Tag");
		}
	});
});

// ============================================================================
// describeRule
// ============================================================================

describe("describeRule", () => {
	it("describes Everything", () => {
		expect(describeRule({ type: "Everything" })).toBe("All");
	});

	it("describes TagName", () => {
		expect(describeRule({ type: "TagName", tagName: "Mountains" })).toBe("Tag: Mountains");
	});

	it("describes Untagged", () => {
		expect(describeRule({ type: "Untagged" })).toBe("Untagged");
	});

	it("describes Unpanned", () => {
		expect(describeRule({ type: "Unpanned" })).toBe("Unpanned");
	});

	it("describes PanoIds", () => {
		expect(describeRule({ type: "PanoIds" })).toBe("Has Pano ID");
	});

	it("describes NotPanoIds", () => {
		expect(describeRule({ type: "NotPanoIds" })).toBe("No Pano ID");
	});

	it("describes Duplicates with distance", () => {
		expect(describeRule({ type: "Duplicates", distance: 100 })).toBe("Dupes (100m)");
	});

	it("describes Filter", () => {
		expect(describeRule({ type: "Filter", field: "altitude", op: "gt", value: 500 })).toBe(
			"altitude gt 500",
		);
	});

	it("describes Polygon with name", () => {
		const polygon = { type: "Feature", geometry: {}, properties: { name: "Europe" } } as any;
		expect(describeRule({ type: "Polygon", polygon, includeInformational: false })).toBe("Europe");
	});

	it("describes Polygon without name", () => {
		const polygon = { type: "Feature", geometry: {}, properties: {} } as any;
		expect(describeRule({ type: "Polygon", polygon, includeInformational: false })).toBe("Polygon");
	});

	it("describes Intersection", () => {
		const result = describeRule({
			type: "Intersection",
			selections: [{ type: "PanoIds" }, { type: "Untagged" }],
		});
		expect(result).toBe("Has Pano ID AND Untagged");
	});

	it("describes Union", () => {
		const result = describeRule({
			type: "Union",
			selections: [
				{ type: "TagName", tagName: "A" },
				{ type: "TagName", tagName: "B" },
			],
		});
		expect(result).toBe("Tag: A OR Tag: B");
	});

	it("describes Invert", () => {
		const result = describeRule({
			type: "Invert",
			selections: [{ type: "Everything" }],
		});
		expect(result).toBe("NOT (All)");
	});
});

// ============================================================================
// resolveSavedSelectionIds
// ============================================================================

describe("resolveSavedSelectionIds", () => {
	const entry = (items: SavedSelectionProps[]): SavedSelection => ({
		id: "s1",
		name: "n",
		items: items.map((props) => ({ props, color: [0, 0, 0] as [number, number, number] })),
		createdAt: 0,
	});

	it("unions the ids of all items", async () => {
		h.saved = [entry([{ type: "Untagged" }, { type: "Unpanned" }])];
		h.resolve.mockResolvedValueOnce([1, 2]).mockResolvedValueOnce([2, 3]);
		const ids = await resolveSavedSelectionIds("s1");
		expect([...ids].sort()).toEqual([1, 2, 3]);
		expect(h.resolve).toHaveBeenCalledTimes(2);
	});

	it("skips items that no longer resolve", async () => {
		h.saved = [entry([{ type: "TagName", tagName: "gone" }, { type: "Untagged" }])];
		h.resolve.mockResolvedValueOnce([7]);
		const ids = await resolveSavedSelectionIds("s1");
		expect([...ids]).toEqual([7]);
		expect(h.resolve).toHaveBeenCalledTimes(1);
	});

	it("returns an empty set for an unknown id", async () => {
		const ids = await resolveSavedSelectionIds("nope");
		expect(ids.size).toBe(0);
		expect(h.resolve).not.toHaveBeenCalled();
	});
});
