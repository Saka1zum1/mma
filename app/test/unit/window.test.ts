// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
	minimized: false,
	maximized: true,
	label: "map-1",
}));

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: () => ({
		label: h.label,
		isMinimized: async () => h.minimized,
		isMaximized: async () => h.maximized,
		setTitle: async () => {},
	}),
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
	WebviewWindow: class {},
	getAllWebviewWindows: async () => [],
}));
vi.mock("@/lib/util/log", () => ({
	log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: async () => {} }));

import { saveWindowState } from "@/lib/window";

beforeEach(() => {
	localStorage.clear();
	h.minimized = false;
	h.maximized = true;
});

describe("saveWindowState", () => {
	it("keeps the maximized bit when the window is closed while minimized", async () => {
		h.minimized = false;
		h.maximized = true;
		await saveWindowState();
		h.minimized = true;
		h.maximized = false;
		await saveWindowState();
		expect(localStorage.getItem("win-maximized:map-1")).toBe("true");
	});

	it("records a restore from maximized to a normal window", async () => {
		h.minimized = false;
		h.maximized = false;
		await saveWindowState();
		expect(localStorage.getItem("win-maximized:map-1")).toBe("false");
	});
});
