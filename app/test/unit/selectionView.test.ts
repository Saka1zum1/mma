import { describe, expect, it } from "vitest";
import { selectionViewPatch } from "@/lib/data/selectionView";

const blank = { heading: "", pitch: "", zoom: "" };

describe("selection view patch", () => {
	it("leaves a blank form unset", () => {
		expect(selectionViewPatch(blank)).toEqual({ ok: false, reason: "empty" });
	});

	it("writes only the fields that were filled", () => {
		expect(selectionViewPatch({ ...blank, heading: "90" })).toEqual({
			ok: true,
			patch: { heading: 90 },
		});
		expect(selectionViewPatch({ ...blank, zoom: "0" })).toEqual({
			ok: true,
			patch: { zoom: 0 },
		});
	});

	it("wraps heading onto 0–360", () => {
		expect(selectionViewPatch({ ...blank, heading: "450" })).toEqual({
			ok: true,
			patch: { heading: 90 },
		});
		expect(selectionViewPatch({ ...blank, heading: "-90" })).toEqual({
			ok: true,
			patch: { heading: 270 },
		});
		expect(selectionViewPatch({ ...blank, heading: "360" })).toEqual({
			ok: true,
			patch: { heading: 0 },
		});
	});

	it("rejects pitch and zoom outside the panorama range", () => {
		expect(selectionViewPatch({ ...blank, pitch: "91" })).toEqual({ ok: false, reason: "pitch" });
		expect(selectionViewPatch({ ...blank, pitch: "-90" })).toEqual({
			ok: true,
			patch: { pitch: -90 },
		});
		expect(selectionViewPatch({ ...blank, zoom: "5" })).toEqual({ ok: false, reason: "zoom" });
		expect(selectionViewPatch({ ...blank, zoom: "-3" })).toEqual({
			ok: true,
			patch: { zoom: -3 },
		});
	});

	it("waits out a half-typed minus", () => {
		expect(selectionViewPatch({ ...blank, heading: "-" })).toEqual({
			ok: false,
			reason: "incomplete",
		});
	});
});
