// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
	panoDisplayOptions,
	navHiddenWithUI,
	getSettings,
	type AppSettings,
} from "@/store/settings";

const s = (over: Partial<AppSettings> = {}): AppSettings => ({ ...getSettings(), ...over });

describe("panoDisplayOptions", () => {
	it("shows navigation with default settings", () => {
		const o = panoDisplayOptions(s());
		expect(o.linksControl).toBe(true);
		expect(o.clickToGo).toBe(true);
	});

	it("hides link arrows when the pano UI is hidden (default on)", () => {
		const o = panoDisplayOptions(s({ hidePanoUI: true }));
		expect(o.linksControl).toBe(false);
		expect(o.clickToGo).toBe(true); // click navigation still works, only visuals hide
	});

	it("leaves navigation alone when hideNavWithUI is off", () => {
		const o = panoDisplayOptions(s({ hidePanoUI: true, hideNavWithUI: false }));
		expect(o.linksControl).toBe(true);
	});

	it("still respects the individual link-arrow toggle", () => {
		expect(panoDisplayOptions(s({ showLinksControl: false })).linksControl).toBe(false);
	});

	it("forces navigation off outside moving mode", () => {
		for (const defaultMovementMode of ["no-move", "nmpz"] as const) {
			const o = panoDisplayOptions(s({ defaultMovementMode, hideNavWithUI: false }));
			expect(o.linksControl).toBe(false);
			expect(o.clickToGo).toBe(false);
		}
	});

	it("disables scrollwheel only in nmpz", () => {
		expect(panoDisplayOptions(s()).scrollwheel).toBe(true);
		expect(panoDisplayOptions(s({ defaultMovementMode: "nmpz" })).scrollwheel).toBe(false);
	});
});

describe("navHiddenWithUI", () => {
	it("requires both the hidden UI and the setting", () => {
		expect(navHiddenWithUI(s())).toBe(false);
		expect(navHiddenWithUI(s({ hidePanoUI: true }))).toBe(true);
		expect(navHiddenWithUI(s({ hidePanoUI: true, hideNavWithUI: false }))).toBe(false);
	});
});
