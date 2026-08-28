import { describe, it, expect } from "vitest";
import { toggledLayer, svLayerOpacity, markerLayerOpacity } from "@/store/mapEmbedPrefs";
import { DEFAULT_PREFS } from "@/store/mapEmbedPrefs";

describe("toggledLayer", () => {
	it("hides a visible layer without changing opacity", () => {
		expect(toggledLayer(0.5, true, "previous")).toEqual({ opacity: 0.5, visible: false });
		expect(toggledLayer(1, true, "full")).toEqual({ opacity: 1, visible: false });
	});

	it("restores the stored opacity", () => {
		expect(toggledLayer(0.35, false, "previous")).toEqual({ opacity: 0.35, visible: true });
	});

	it("restores full opacity when the setting says so", () => {
		expect(toggledLayer(0.35, false, "full")).toEqual({ opacity: 1, visible: true });
	});

	it("falls back to full opacity with no remembered value", () => {
		expect(toggledLayer(0, false, "previous")).toEqual({ opacity: 1, visible: true });
	});
});

describe("layer opacity", () => {
	it("gates the stored opacity by visibility", () => {
		expect(svLayerOpacity({ ...DEFAULT_PREFS, svOpacity: 0.4, svVisible: true })).toBe(0.4);
		expect(svLayerOpacity({ ...DEFAULT_PREFS, svOpacity: 0.4, svVisible: false })).toBe(0);
		expect(markerLayerOpacity({ ...DEFAULT_PREFS, markerOpacity: 0.8, markerVisible: true })).toBe(
			0.8,
		);
		expect(markerLayerOpacity({ ...DEFAULT_PREFS, markerOpacity: 0.8, markerVisible: false })).toBe(
			0,
		);
	});
});
