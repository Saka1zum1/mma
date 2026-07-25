import { describe, it, expect } from "vitest";
import { toggledOpacity } from "@/store/mapEmbedPrefs";

describe("toggledOpacity", () => {
	it("hides a visible layer", () => {
		expect(toggledOpacity(0.5, 0.5, "previous")).toBe(0);
		expect(toggledOpacity(1, 1, "full")).toBe(0);
	});

	it("restores the last non-zero value", () => {
		expect(toggledOpacity(0, 0.35, "previous")).toBe(0.35);
	});

	it("restores full opacity when the setting says so", () => {
		expect(toggledOpacity(0, 0.35, "full")).toBe(1);
	});

	it("falls back to full opacity with no remembered value", () => {
		expect(toggledOpacity(0, 0, "previous")).toBe(1);
	});
});
