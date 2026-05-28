import { describe, it, expect, afterEach } from "vitest";
import {
	colorForKey,
	buildSelection,
	addSelection,
	removeSelection,
	intersectSelections,
	unionSelections,
	invertSelections,
	toggleManualSelection,
	selectionDisplayName,
	resolveLocations,
	reorderSelections,
	composeSelections,
	decomposeChild,
	removeFromComposite,
	ValidationState,
} from "@/store/selections";
import { setUserFieldDefs, resetForMapChange } from "@/lib/data/fieldDefRegistry";
import type { MapData, Tag } from "@/types";

function makeMap(tags: Record<number, Tag> = {}): MapData {
	return {
		meta: {
			id: "map1",
			name: "Test",
			description: "",
			folder: null,
			locationCount: 0,
			tags,
			settings: {
				pointAlongRoad: false,
				preferDirection: null,
				preferOfficial: false,
				preferHigherQuality: false,
				onlyOfficial: false,
				cameraTypes: null,
				defaultPanoId: false,
				exportZoom: false,
				exportUnpanned: false,
			},
			scoreBounds: "auto",
			createdAt: "",
			updatedAt: "",
		},
	};
}

describe("colorForKey", () => {
	it("returns an RGB tuple", () => {
		const [r, g, b] = colorForKey("test");
		expect(r).toBeGreaterThanOrEqual(0);
		expect(r).toBeLessThanOrEqual(255);
		expect(g).toBeGreaterThanOrEqual(0);
		expect(b).toBeGreaterThanOrEqual(0);
	});

	it("is deterministic", () => {
		expect(colorForKey("foo")).toEqual(colorForKey("foo"));
	});

	it("produces different colors for different keys", () => {
		expect(colorForKey("alpha")).not.toEqual(colorForKey("beta"));
	});
});

describe("buildSelection", () => {
	const map = makeMap();

	it("Everything gets correct key", () => {
		const sel = buildSelection(map, { type: "Everything" });
		expect(sel.key).toBe("everything");
	});

	it("Tag gets key with tagId", () => {
		const sel = buildSelection(map, { type: "Tag", tagId: 42 });
		expect(sel.key).toBe("tag:42");
	});

	it("Untagged gets correct key", () => {
		const sel = buildSelection(map, { type: "Untagged" });
		expect(sel.key).toBe("untagged");
	});

	it("Unpanned gets correct key", () => {
		const sel = buildSelection(map, { type: "Unpanned" });
		expect(sel.key).toBe("unpanned");
	});

	it("PanoIds / NotPanoIds get correct keys", () => {
		expect(buildSelection(map, { type: "PanoIds" }).key).toBe("panoids");
		expect(buildSelection(map, { type: "NotPanoIds" }).key).toBe("notpanoids");
	});

	it("Manual gets correct key", () => {
		const sel = buildSelection(map, { type: "Manual", locations: [1, 2] });
		expect(sel.key).toBe("manual");
	});

	it("Filter generates key with field/op/value", () => {
		const sel = buildSelection(map, {
			type: "Filter",
			field: "altitude",
			op: "gt",
			value: 500,
		});
		expect(sel.key).toBe("filter:altitude:gt:500");
	});

	it("Filter between includes value2", () => {
		const sel = buildSelection(map, {
			type: "Filter",
			field: "altitude",
			op: "between",
			value: 0,
			value2: 1000,
		});
		expect(sel.key).toBe("filter:altitude:between:0:1000");
	});

	it("assigns a color", () => {
		const sel = buildSelection(map, { type: "Everything" });
		expect(sel.color).toHaveLength(3);
		expect(sel.color[0]).toBeGreaterThanOrEqual(0);
	});
});

describe("addSelection / removeSelection", () => {
	const map = makeMap();

	it("addSelection appends a new selection", () => {
		const result = addSelection(map, [], { type: "Everything" });
		expect(result).toHaveLength(1);
		expect(result[0].key).toBe("everything");
	});

	it("addSelection deduplicates by key", () => {
		const first = addSelection(map, [], { type: "Everything" });
		const second = addSelection(map, first, { type: "Everything" });
		expect(second).toHaveLength(1);
	});

	it("removeSelection removes by key", () => {
		const sels = addSelection(map, [], { type: "Everything" });
		const result = removeSelection(sels, "everything");
		expect(result).toHaveLength(0);
	});

	it("removeSelection decomposes composite on remove", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const composite = buildSelection(map, { type: "Intersection", selections: [s1, s2] });
		const result = removeSelection([composite], composite.key);
		expect(result).toHaveLength(2);
	});
});

describe("intersectSelections", () => {
	const map = makeMap();

	it("creates intersection of two selections", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const result = intersectSelections(map, [s1, s2], null);
		expect(result).toHaveLength(1);
		expect(result[0].props.type).toBe("Intersection");
	});

	it("does nothing with fewer than 2 selections", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const result = intersectSelections(map, [s1], null);
		expect(result).toHaveLength(1);
		expect(result[0].props.type).toBe("PanoIds");
	});

	it("flattens nested intersections", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const inter = intersectSelections(map, [s1, s2], null);
		const s3 = buildSelection(map, { type: "Unpanned" });
		const result = intersectSelections(map, [...inter, s3], null);
		expect(result).toHaveLength(1);
		const children = (result[0].props as { type: "Intersection"; selections: any[] }).selections;
		expect(children).toHaveLength(3);
	});
});

describe("unionSelections", () => {
	const map = makeMap();

	it("creates union of two selections", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const result = unionSelections(map, [s1, s2], null);
		expect(result).toHaveLength(1);
		expect(result[0].props.type).toBe("Union");
	});

	it("flattens nested unions", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const union = unionSelections(map, [s1, s2], null);
		const s3 = buildSelection(map, { type: "Unpanned" });
		const result = unionSelections(map, [...union, s3], null);
		expect(result).toHaveLength(1);
		const children = (result[0].props as { type: "Union"; selections: any[] }).selections;
		expect(children).toHaveLength(3);
	});
});

describe("invertSelections", () => {
	const map = makeMap();

	it("wraps a single selection in Invert", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const result = invertSelections(map, [s1], null);
		expect(result).toHaveLength(1);
		expect(result[0].props.type).toBe("Invert");
	});

	it("double invert unwraps back to original", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const inverted = invertSelections(map, [s1], null);
		const result = invertSelections(map, inverted, null);
		expect(result).toHaveLength(1);
		expect(result[0].props.type).toBe("PanoIds");
	});
});

describe("toggleManualSelection", () => {
	const map = makeMap();

	it("creates manual selection if none exists", () => {
		const result = toggleManualSelection(map, [], 1);
		expect(result).toHaveLength(1);
		expect(result[0].key).toBe("manual");
	});

	it("adds to existing manual selection", () => {
		const initial = toggleManualSelection(map, [], 1);
		const result = toggleManualSelection(map, initial, 2);
		const ids = (result[0].props as { type: "Manual"; locations: number[] }).locations;
		expect(ids).toContain(1);
		expect(ids).toContain(2);
	});

	it("removes from existing manual selection", () => {
		let sels = toggleManualSelection(map, [], 1);
		sels = toggleManualSelection(map, sels, 2);
		sels = toggleManualSelection(map, sels, 1);
		const ids = (sels[0].props as { type: "Manual"; locations: number[] }).locations;
		expect(ids).toEqual([2]);
	});

	it("removes manual selection entirely when last location toggled off", () => {
		let sels = toggleManualSelection(map, [], 1);
		sels = toggleManualSelection(map, sels, 1);
		expect(sels).toHaveLength(0);
	});
});

describe("reorderSelections", () => {
	const map = makeMap();

	it("moves selection before target", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const s3 = buildSelection(map, { type: "Unpanned" });
		const result = reorderSelections([s1, s2, s3], s3.key, s1.key, "before");
		expect(result.map((s) => s.key)).toEqual([s3.key, s1.key, s2.key]);
	});

	it("moves selection after target", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const s3 = buildSelection(map, { type: "Unpanned" });
		const result = reorderSelections([s1, s2, s3], s1.key, s3.key, "after");
		expect(result.map((s) => s.key)).toEqual([s2.key, s3.key, s1.key]);
	});
});

describe("selectionDisplayName", () => {
	it("returns type name for simple types", () => {
		const map = makeMap();
		const sel = buildSelection(map, { type: "Everything" });
		expect(selectionDisplayName(map, sel)).toBe("Everything");
	});

	it("returns tag name for Tag selection", () => {
		const map = makeMap({ 42: { id: 42, name: "My Tag", color: "#f00", visible: true } });
		const sel = buildSelection(map, { type: "Tag", tagId: 42 });
		expect(selectionDisplayName(map, sel)).toBe("Tag: My Tag");
	});

	it("falls back to tag ID if tag not found", () => {
		const map = makeMap();
		const sel = buildSelection(map, { type: "Tag", tagId: 999 });
		expect(selectionDisplayName(map, sel)).toBe("Tag: 999");
	});

	it("display name for Filter eq", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Filter",
			field: "countryCode",
			op: "eq",
			value: "BR",
		});
		expect(selectionDisplayName(map, sel)).toBe("Country code = BR");
	});

	it("display name for Filter between", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Filter",
			field: "altitude",
			op: "between",
			value: 0,
			value2: 3000,
		});
		expect(selectionDisplayName(map, sel)).toBe("Altitude between 0..3000");
	});

	afterEach(() => {
		resetForMapChange();
	});

	it("display name for Filter neq", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Filter",
			field: "countryCode",
			op: "neq",
			value: "BR",
		});
		expect(selectionDisplayName(map, sel)).toBe("Country code != BR");
	});

	it("display name for Filter gt", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Filter",
			field: "altitude",
			op: "gt",
			value: 500,
		});
		expect(selectionDisplayName(map, sel)).toBe("Altitude > 500");
	});

	it("display name for Filter lt", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Filter",
			field: "altitude",
			op: "lt",
			value: 100,
		});
		expect(selectionDisplayName(map, sel)).toBe("Altitude < 100");
	});

	it("display name for Filter gte", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Filter",
			field: "altitude",
			op: "gte",
			value: 200,
		});
		expect(selectionDisplayName(map, sel)).toBe("Altitude >= 200");
	});

	it("display name for Filter lte", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Filter",
			field: "altitude",
			op: "lte",
			value: 300,
		});
		expect(selectionDisplayName(map, sel)).toBe("Altitude <= 300");
	});

	it("display name for Filter has", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Filter",
			field: "altitude",
			op: "has",
			value: null,
		});
		expect(selectionDisplayName(map, sel)).toBe("has Altitude");
	});

	it("display name for Filter nothas", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Filter",
			field: "altitude",
			op: "nothas",
			value: null,
		});
		expect(selectionDisplayName(map, sel)).toBe("missing Altitude");
	});

	it("display name for Filter between_anyyear formats MM-DD as month day", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Filter",
			field: "imageDate",
			op: "between_anyyear",
			value: "01-15",
			value2: "03-20",
		});
		expect(selectionDisplayName(map, sel)).toBe("Image date between (any year) Jan 15..Mar 20");
	});

	it("display name for Filter between_anytime uses raw values", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Filter",
			field: "imageDate",
			op: "between_anytime",
			value: "08:00",
			value2: "16:00",
		});
		expect(selectionDisplayName(map, sel)).toBe("Image date between (any date) 08:00..16:00");
	});

	it("display name for Filter enum field shows label not raw value", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Filter",
			field: "cameraType",
			op: "eq",
			value: "gen4",
		});
		expect(selectionDisplayName(map, sel)).toBe("Camera type = Gen 4");
	});

	it("display name for Filter date field formats unix timestamp", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Filter",
			field: "datetime",
			op: "gt",
			value: 1700000000,
		});
		const expected = new Date(1700000000 * 1000).toISOString().slice(0, 16).replace("T", " ");
		expect(selectionDisplayName(map, sel)).toBe(`Exact date > ${expected}`);
	});

	it("display name for Filter uses raw field name when no fieldDef exists", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Filter",
			field: "unknownField",
			op: "eq",
			value: "test",
		});
		expect(selectionDisplayName(map, sel)).toBe("unknownField = test");
	});

	it("display name for Filter enum uses user-defined field defs", () => {
		setUserFieldDefs({
			myCustomField: {
				type: "enum",
				label: "Custom",
				values: ["a", "b"],
				labels: { a: "Alpha", b: "Beta" },
			},
		});
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Filter",
			field: "myCustomField",
			op: "eq",
			value: "a",
		});
		expect(selectionDisplayName(map, sel)).toBe("Custom = Alpha");
	});

	it("display name for Locations with name", () => {
		const map = makeMap();
		const sel = buildSelection(map, { type: "Locations", locations: [1, 2], name: "My Set" });
		expect(selectionDisplayName(map, sel)).toBe("My Set");
	});

	it("display name for Locations without name", () => {
		const map = makeMap();
		const sel = buildSelection(map, { type: "Locations", locations: [1], name: null });
		expect(selectionDisplayName(map, sel)).toBe("Selection");
	});

	it("display name for Polygon without name", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Polygon",
			polygon: { coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
			includeInformational: false,
		});
		expect(selectionDisplayName(map, sel)).toBe("Polygon");
	});

	it("display name for Polygon with name", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "Polygon",
			polygon: { coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]], properties: { name: "Europe" } },
			includeInformational: false,
		});
		expect(selectionDisplayName(map, sel)).toBe("Polygon: Europe");
	});

	it("display name for Duplicates", () => {
		const map = makeMap();
		const sel = buildSelection(map, { type: "Duplicates", distance: 100 });
		expect(selectionDisplayName(map, sel)).toBe("Duplicates (100m)");
	});

	it("display name for Manual", () => {
		const map = makeMap();
		const sel = buildSelection(map, { type: "Manual", locations: [1, 2, 3] });
		expect(selectionDisplayName(map, sel)).toBe("Manual selection");
	});

	it("display name for ValidationState", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "ValidationState",
			locations: [1],
			state: ValidationState.NotFound,
		});
		expect(selectionDisplayName(map, sel)).toBe("Not found");
	});

	it("display name for ValidationState PanoIdBroke", () => {
		const map = makeMap();
		const sel = buildSelection(map, {
			type: "ValidationState",
			locations: [2],
			state: ValidationState.PanoIdBroke,
		});
		expect(selectionDisplayName(map, sel)).toBe("Pano ID broke");
	});

	it("display name for Intersection", () => {
		const map = makeMap();
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const inter = intersectSelections(map, [s1, s2], null);
		expect(selectionDisplayName(map, inter[0])).toBe("Intersection");
	});

	it("display name for Union", () => {
		const map = makeMap();
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const union = unionSelections(map, [s1, s2], null);
		expect(selectionDisplayName(map, union[0])).toBe("Union");
	});

	it("display name for Invert includes child name", () => {
		const map = makeMap();
		const s1 = buildSelection(map, { type: "PanoIds" });
		const inverted = invertSelections(map, [s1], null);
		expect(selectionDisplayName(map, inverted[0])).toBe("Invert: Pano ID locations");
	});
});

describe("resolveLocations", () => {
	const map = makeMap();

	it("Manual returns copy of locations", () => {
		const locs = [10, 20, 30];
		const result = resolveLocations(map, { type: "Manual", locations: locs });
		expect(result).toEqual([10, 20, 30]);
		expect(result).not.toBe(locs);
	});

	it("Locations returns copy of locations", () => {
		const locs = [5, 15];
		const result = resolveLocations(map, { type: "Locations", locations: locs, name: null });
		expect(result).toEqual([5, 15]);
		expect(result).not.toBe(locs);
	});

	it("ValidationState returns copy of locations", () => {
		const locs = [7, 8, 9];
		const result = resolveLocations(map, {
			type: "ValidationState",
			locations: locs,
			state: ValidationState.Ok,
		});
		expect(result).toEqual([7, 8, 9]);
		expect(result).not.toBe(locs);
	});

	it("Everything returns empty array", () => {
		expect(resolveLocations(map, { type: "Everything" })).toEqual([]);
	});

	it("Tag returns empty array", () => {
		expect(resolveLocations(map, { type: "Tag", tagId: 1 })).toEqual([]);
	});
});

describe("reorderSelections edge cases", () => {
	const map = makeMap();

	it("returns unchanged when from key not found", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const result = reorderSelections([s1, s2], "nonexistent", s2.key, "before");
		expect(result.map((s) => s.key)).toEqual([s1.key, s2.key]);
	});

	it("returns unchanged when to key not found", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const result = reorderSelections([s1, s2], s1.key, "nonexistent", "before");
		expect(result.map((s) => s.key)).toEqual([s1.key, s2.key]);
	});

	it("returns unchanged when from and to are the same", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const result = reorderSelections([s1, s2], s1.key, s1.key, "before");
		expect(result.map((s) => s.key)).toEqual([s1.key, s2.key]);
	});
});

describe("composeSelections", () => {
	const map = makeMap();

	it("drag onto drop creates intersection", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const result = composeSelections(map, [s1, s2], s2.key, s1.key, "intersection");
		expect(result).toHaveLength(1);
		expect(result[0].props.type).toBe("Intersection");
	});

	it("drag onto drop creates union", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const result = composeSelections(map, [s1, s2], s2.key, s1.key, "union");
		expect(result).toHaveLength(1);
		expect(result[0].props.type).toBe("Union");
	});

	it("drag onto existing composite adds as child", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const composed = composeSelections(map, [s1, s2], s2.key, s1.key, "intersection");
		const s3 = buildSelection(map, { type: "Unpanned" });
		const result = composeSelections(
			map,
			[...composed, s3],
			s3.key,
			composed[0].key,
			"intersection",
		);
		expect(result).toHaveLength(1);
		const children = (result[0].props as { selections: any[] }).selections;
		expect(children).toHaveLength(3);
	});

	it("returns unchanged if drag equals drop", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const result = composeSelections(map, [s1], s1.key, s1.key, "intersection");
		expect(result).toEqual([s1]);
	});

	it("returns unchanged if key not found", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const result = composeSelections(map, [s1], "nonexistent", s1.key, "intersection");
		expect(result).toEqual([s1]);
	});
});

describe("decomposeChild", () => {
	const map = makeMap();

	it("extracts a child from a composite", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const s3 = buildSelection(map, { type: "Unpanned" });
		const composed = composeSelections(
			map,
			composeSelections(map, [s1, s2], s2.key, s1.key, "intersection").concat(s3),
			s3.key,
			composeSelections(map, [s1, s2], s2.key, s1.key, "intersection")[0].key,
			"intersection",
		);
		const parentKey = composed[0].key;
		const result = decomposeChild(map, composed, parentKey, s2.key);
		expect(result.length).toBeGreaterThan(composed.length);
	});
});

describe("removeFromComposite", () => {
	const map = makeMap();

	it("removes a child and reduces composite", () => {
		const s1 = buildSelection(map, { type: "PanoIds" });
		const s2 = buildSelection(map, { type: "Untagged" });
		const s3 = buildSelection(map, { type: "Unpanned" });
		let sels = [s1, s2, s3];
		sels = composeSelections(map, sels, s2.key, s1.key, "intersection");
		sels = composeSelections(map, [...sels, s3], s3.key, sels[0].key, "intersection");
		const parentKey = sels[0].key;
		const result = removeFromComposite(map, sels, parentKey, s2.key);
		expect(result).toHaveLength(sels.length);
		const children = (result[0].props as { selections: any[] }).selections;
		expect(children.every((c: any) => c.key !== s2.key)).toBe(true);
	});
});
