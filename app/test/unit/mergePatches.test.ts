// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mergePatches } from "@/lib/sv/svRunner";
import { createLocation } from "@/types";
import type { Location } from "@/types";

function loc(over: Partial<Location> = {}): Location {
	return { ...createLocation({ lat: 0, lng: 0 }), ...over };
}

describe("mergePatches", () => {
	it("returns null for empty patches", () => {
		expect(mergePatches(loc(), [])).toBeNull();
	});

	it("returns null when all patches are empty objects", () => {
		expect(mergePatches(loc(), [{} as Partial<Location>])).toBeNull();
	});

	it("patches a top-level field", () => {
		expect(mergePatches(loc(), [{ heading: 90 }])).toEqual({ heading: 90 });
	});

	it("last top-level patch wins", () => {
		expect(mergePatches(loc(), [{ heading: 90 }, { heading: 180 }])).toEqual({ heading: 180 });
	});

	it("deep-merges extra into existing loc.extra", () => {
		const l = loc({ extra: { countryCode: "FR", altitude: 100 } });
		const result = mergePatches(l, [{ extra: { timezone: "Europe/Paris" } } as Partial<Location>]);
		expect(result).toEqual({
			extra: { countryCode: "FR", altitude: 100, timezone: "Europe/Paris" },
		});
	});

	it("merges extra from multiple patches", () => {
		const l = loc();
		const result = mergePatches(l, [
			{ extra: { a: 1 } } as Partial<Location>,
			{ extra: { b: 2 } } as Partial<Location>,
		]);
		expect(result).toEqual({ extra: { a: 1, b: 2 } });
	});

	it("later extra keys override earlier ones", () => {
		const l = loc({ extra: { a: "old" } });
		const result = mergePatches(l, [
			{ extra: { a: "mid" } } as Partial<Location>,
			{ extra: { a: "new" } } as Partial<Location>,
		]);
		expect(result).toEqual({ extra: { a: "new" } });
	});

	it("mixes top-level and extra in one result", () => {
		const l = loc({ extra: { keep: true } });
		const result = mergePatches(l, [
			{ heading: 45 },
			{ extra: { added: "yes" } } as Partial<Location>,
		]);
		expect(result).toEqual({ heading: 45, extra: { keep: true, added: "yes" } });
	});

	it("handles loc with no existing extra", () => {
		const l = loc({ extra: undefined });
		const result = mergePatches(l, [{ extra: { a: 1 } } as Partial<Location>]);
		expect(result).toEqual({ extra: { a: 1 } });
	});
});
