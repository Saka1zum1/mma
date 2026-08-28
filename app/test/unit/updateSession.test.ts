// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Pin the #89 fix: updating/relaunching must snapshot the open-map session before
// the process can die, otherwise restore reopens the stale list from the last normal quit.

const h = vi.hoisted(() => ({
	openIds: ["map-a", "map-b"] as string[],
	restoreSession: true,
	savedAtDownload: null as string[] | null,
	savedAtRelaunch: null as string[] | null,
	saved: [] as string[][],
	relaunch: vi.fn(),
}));

vi.mock("@/lib/window", () => ({
	openMapWindowIds: async () => h.openIds,
}));
vi.mock("@/store/settings", () => ({
	getSettings: () => ({ restoreSession: h.restoreSession, prereleaseUpdates: false }),
}));
vi.mock("@/store/session", () => ({
	saveSession: (ids: string[]) => h.saved.push(ids),
}));
vi.mock("@/lib/util/log", () => ({
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/version", () => ({
	appVersion: () => "0.9.1",
}));
vi.mock("@/lib/commands", () => ({
	cmd: {
		updateCheck: async () => ({ version: "9.9.9", currentVersion: "0.9.1", notes: "" }),
		updateInstall: async () => {
			h.savedAtDownload = h.saved.at(-1) ?? null;
		},
	},
}));
vi.mock("@/bindings.gen", () => ({
	events: {
		updateProgress: { listen: async () => () => {} },
	},
}));
vi.mock("@tauri-apps/plugin-process", () => ({
	relaunch: async () => {
		h.savedAtRelaunch = h.saved.at(-1) ?? null;
		h.relaunch();
	},
}));

import { checkForUpdate, installUpdate, relaunchApp } from "@/lib/util/updateCheck";

beforeEach(() => {
	h.saved = [];
	h.savedAtDownload = null;
	h.savedAtRelaunch = null;
	h.restoreSession = true;
	localStorage.clear();
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({
			ok: true,
			json: async () => [
				{
					tag_name: "v9.9.9",
					body: "",
					draft: false,
					prerelease: false,
					published_at: "2026-01-01T00:00:00Z",
					assets: [
						{ name: "latest.json", browser_download_url: "https://example.test/latest.json" },
					],
				},
			],
		})),
	);
});

describe("update restarts snapshot the session", () => {
	it("installUpdate saves open maps before downloadAndInstall runs", async () => {
		await checkForUpdate(true);
		await installUpdate();
		expect(h.savedAtDownload).toEqual(["map-a", "map-b"]);
	});

	it("relaunchApp saves open maps before relaunching", async () => {
		await relaunchApp();
		expect(h.savedAtRelaunch).toEqual(["map-a", "map-b"]);
		expect(h.relaunch).toHaveBeenCalled();
	});

	it("respects the restoreSession setting being off", async () => {
		h.restoreSession = false;
		await relaunchApp();
		expect(h.saved).toEqual([]);
	});
});
