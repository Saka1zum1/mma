import { describe, it, expect } from "vitest";
import { capturedAfter, isOfficialPano, newestOfficialPano } from "@/lib/sv/panoId";
import type { Pano } from "@/types";

describe("isOfficialPano", () => {
	it("recognizes F: prefix as unofficial", () => {
		expect(isOfficialPano("F:CAoSLEFGMVFpcE")).toBe(false);
		expect(isOfficialPano("F:abc")).toBe(false);
	});

	it("recognizes 22-char base64 ending in A as official", () => {
		expect(isOfficialPano("KQ2dSFpRKZZMxJEBc4FhcA")).toBe(true);
	});

	it("recognizes 22-char base64 ending in Q as official", () => {
		expect(isOfficialPano("KQ2dSFpRKZZMxJEBc4FhcQ")).toBe(true);
	});

	it("recognizes 22-char base64 ending in g as official", () => {
		expect(isOfficialPano("KQ2dSFpRKZZMxJEBc4Fhcg")).toBe(true);
	});

	it("recognizes 22-char base64 ending in w as official", () => {
		expect(isOfficialPano("KQ2dSFpRKZZMxJEBc4Fhcw")).toBe(true);
	});

	it("treats unknown format as unofficial", () => {
		expect(isOfficialPano("some-random-pano-id")).toBe(false);
	});

	it("handles empty string as unofficial", () => {
		expect(isOfficialPano("")).toBe(false);
	});

	it("a bare CIHM contributor key is not official, even at 22 chars ending in a key bit", () => {
		expect(isOfficialPano("CIHM0ogKEICAgICTzu7WYg")).toBe(false);
	});
});

describe("capturedAfter", () => {
	const dated = (imageDate: string) => ({ imageDate }) as Pano;

	it("a later month is after", () => {
		expect(capturedAfter(dated("2026-02"), dated("2023-05"))).toBe(true);
	});

	it("an earlier or equal month is not", () => {
		expect(capturedAfter(dated("2023-05"), dated("2026-02"))).toBe(false);
		expect(capturedAfter(dated("2023-05"), dated("2023-05"))).toBe(false);
	});

	it("undated coverage never counts as newer, but always loses to a date", () => {
		expect(capturedAfter(dated(""), dated("2023-05"))).toBe(false);
		expect(capturedAfter(dated("2023-05"), dated(""))).toBe(true);
	});
});

describe("newestOfficialPano", () => {
	const off1 = "KQ2dSFpRKZZMxJEBc4FhcA";
	const off2 = "KQ2dSFpRKZZMxJEBc4Fhcw";
	const ugc = "F:CAoSLEFGMVFpcE";

	it("returns null for an empty or all-unofficial timeline", () => {
		expect(newestOfficialPano([])).toBeNull();
		expect(newestOfficialPano([{ pano: ugc }, { pano: "junk" }])).toBeNull();
	});

	// Timelines arrive sorted ascending, so the newest official entry is the LAST one —
	// not the first match, and not the last entry when that entry is unofficial.
	it("takes the last official entry, skipping trailing unofficial ones", () => {
		expect(newestOfficialPano([{ pano: off1 }, { pano: off2 }])?.pano).toBe(off2);
		expect(newestOfficialPano([{ pano: off1 }, { pano: off2 }, { pano: ugc }])?.pano).toBe(off2);
		expect(newestOfficialPano([{ pano: ugc }, { pano: off1 }])?.pano).toBe(off1);
	});

	it("preserves the entry object, not just the id", () => {
		const entry = { pano: off1, date: new Date(2019, 5) };
		expect(newestOfficialPano([entry])).toBe(entry);
	});
});
