// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

// Mock the store — router.ts imports openMap/closeMap/getMapState at module scope
vi.mock("@/store/useMapStore", () => ({
	openMap: vi.fn(),
	closeMap: vi.fn(),
	getMapState: () => ({ mapId: null, map: null }),
}));

import { parse, build } from "@/store/router";

describe("parse", () => {
	it("empty hash → no map, no manual", () => {
		expect(parse("")).toEqual({ mapId: null, manual: null });
		expect(parse("#")).toEqual({ mapId: null, manual: null });
	});

	it("map only", () => {
		expect(parse("#map/abc-123")).toEqual({ mapId: "abc-123", manual: null });
	});

	it("manual only (no map)", () => {
		expect(parse("#manual")).toEqual({ mapId: null, manual: "" });
		expect(parse("#manual/getting-started")).toEqual({ mapId: null, manual: "getting-started" });
	});

	it("map + manual", () => {
		expect(parse("#map/m1/manual")).toEqual({ mapId: "m1", manual: "" });
		expect(parse("#map/m1/manual/ch2")).toEqual({ mapId: "m1", manual: "ch2" });
	});

	it("ignores trailing slashes", () => {
		expect(parse("#map/m1/")).toEqual({ mapId: "m1", manual: null });
	});

	it("bare #map with no id yields null mapId", () => {
		expect(parse("#map")).toEqual({ mapId: null, manual: null });
	});
});

describe("build", () => {
	it("no map, no manual → bare hash", () => {
		expect(build({ mapId: null, manual: null })).toBe("#");
	});

	it("map only", () => {
		expect(build({ mapId: "m1", manual: null })).toBe("#map/m1");
	});

	it("manual only", () => {
		expect(build({ mapId: null, manual: "" })).toBe("#manual");
		expect(build({ mapId: null, manual: "ch" })).toBe("#manual/ch");
	});

	it("map + manual", () => {
		expect(build({ mapId: "m1", manual: "" })).toBe("#map/m1/manual");
		expect(build({ mapId: "m1", manual: "ch" })).toBe("#map/m1/manual/ch");
	});
});

describe("parse ∘ build round-trip", () => {
	const cases: { mapId: string | null; manual: string | null }[] = [
		{ mapId: null, manual: null },
		{ mapId: "abc", manual: null },
		{ mapId: null, manual: "" },
		{ mapId: null, manual: "getting-started" },
		{ mapId: "m1", manual: "" },
		{ mapId: "m1", manual: "ch2" },
	];
	for (const route of cases) {
		it(`round-trips ${JSON.stringify(route)}`, () => {
			expect(parse(build(route))).toEqual(route);
		});
	}
});
