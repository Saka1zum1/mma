import { describe, it, expect } from "vitest";
import { searchManual } from "@/components/manual/search";

describe("searchManual", () => {
	it("returns nothing for an empty query", () => {
		expect(searchManual("")).toEqual([]);
		expect(searchManual("   ")).toEqual([]);
	});

	it("finds a chapter by body text", () => {
		const hits = searchManual("quicktags");
		expect(hits.map((h) => h.id)).toContain("tags");
	});

	it("ranks a title match above a body-only match", () => {
		const hits = searchManual("selection algebra");
		expect(hits[0].id).toBe("selection-algebra");
	});

	it("requires every term to be present (AND)", () => {
		// 'enrichment' exists, but pairing it with a nonsense term yields nothing.
		expect(searchManual("enrichment zzzzznotaword")).toEqual([]);
	});

	it("returns a snippet of surrounding text for a body match", () => {
		const hits = searchManual("perfect-score");
		const measurement = hits.find((h) => h.id === "measurement");
		expect(measurement).toBeDefined();
		expect(measurement!.snippet.toLowerCase()).toContain("perfect");
	});

	it("matches are case-insensitive", () => {
		expect(searchManual("TAGS").length).toBeGreaterThan(0);
	});

	it("respects the result limit", () => {
		// 'the' is extremely common across chapters; cap should hold.
		expect(searchManual("the", 3).length).toBeLessThanOrEqual(3);
	});
});
