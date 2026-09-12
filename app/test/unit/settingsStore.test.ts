// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { APP_SETTINGS, DEFAULTS, getSettings, resetSettings, setSetting } from "@/store/settings";
import { getLocal, reloadLocal } from "@/lib/hooks/useLocalStorage";

describe("resetSettings", () => {
	it("returns every setting to its default and persists that", () => {
		setSetting("units", "imperial");
		resetSettings();
		expect(getSettings()).toEqual({ ...DEFAULTS, globalCopyBindings: [] });
		expect(getLocal(APP_SETTINGS)).toEqual(DEFAULTS);
	});
});

describe("the welcome flag", () => {
	it("migrates out of app settings into its own key", () => {
		localStorage.setItem("appSettings", JSON.stringify({ ...DEFAULTS, hasSeenWelcome: true }));
		expect(reloadLocal(APP_SETTINGS)).not.toHaveProperty("hasSeenWelcome");
		expect(reloadLocal("welcomeSeen", false)).toBe(true);
		expect(JSON.parse(localStorage.getItem("appSettings")!)).not.toHaveProperty("hasSeenWelcome");
	});
});
