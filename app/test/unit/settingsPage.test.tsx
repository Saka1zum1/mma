// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { initLocale } from "@/lib/i18n";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
vi.stubGlobal("__APP_VERSION__", "0.0.0-test");

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@/lib/util/updateCheck", () => ({
	useUpdateState: () => ({ phase: "idle" }),
	checkForUpdate: vi.fn(),
	installUpdate: vi.fn(),
	relaunchApp: vi.fn(),
}));
vi.mock("@/lib/commands", () => ({
	cmd: {
		checkBorderFile: vi.fn().mockResolvedValue(true),
		downloadBorderFile: vi.fn(),
		getDataLocation: vi.fn().mockResolvedValue({ path: "/data", default_path: "/data" }),
		openDataFolder: vi.fn(),
		openLogFile: vi.fn(),
	},
}));

const { SettingsPage } = await import("@/components/dialogs/SettingsPage");

let unmount: (() => void) | null = null;

/** Queries run against the whole document, so a leaked dialog would be read as the next
 *  test's DOM. Unmount from afterEach rather than at the end of each test body. */
async function mount() {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => root.render(<SettingsPage open onOpenChange={() => {}} />));
	// Border/data-location effects resolve their mocked IPC on the microtask queue.
	await act(async () => {});
	unmount = () => {
		act(() => root.unmount());
		container.remove();
	};
}

afterEach(() => {
	unmount?.();
	unmount = null;
});

/** Radix portals the dialog to document.body, so queries run against the whole document. */
const q = (sel: string) => document.querySelector(sel);
const qa = (sel: string) => [...document.querySelectorAll(sel)];

function search(text: string) {
	const input = q(".settings-rail__search") as HTMLInputElement;
	act(() => {
		const setter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)!.set!.bind(input);
		setter(text);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

describe("settings rail", () => {
	beforeAll(async () => {
		await initLocale("fr");
	});

	it("translates section labels", async () => {
		await mount();
		expect(q('[data-qa="settings-nav-keyboard"]')?.textContent).toContain("Clavier");
		expect(q('[data-qa="settings-nav-editing"]')?.textContent).toContain("Édition");
		expect(q('[data-qa="settings-nav-advanced"]')?.textContent).toContain("Avancé");
	});

	it("opens on Street View, not the hotkey table", async () => {
		await mount();
		expect(q(".settings-nav-item--active")?.getAttribute("data-qa")).toBe(
			"settings-nav-streetview",
		);
	});
});

// Search matches the labels as rendered, so it is locale-sensitive by design.
describe("settings search", () => {
	beforeAll(async () => {
		await initLocale("en");
	});

	// "spawn" is a static binding; Command-backed ones (Undo, etc.) only register with a map open.
	it("reaches hotkeys from the dialog-wide search box", async () => {
		await mount();
		search("spawn");
		const rows = qa(".settings-hotkey-table tr[id^='hotkey-row-']");
		expect(rows.length).toBeGreaterThan(0);
		for (const r of rows) expect(r.textContent?.toLowerCase()).toContain("spawn");
	});

	it("shows the whole hotkey table when the section title itself matches", async () => {
		await mount();
		search("keyboard");
		const visible = qa('[data-qa="settings-section-keyboard"] tr[id^="hotkey-row-"]');
		expect(visible.length).toBeGreaterThan(20);
	});

	it("still filters ordinary setting rows", async () => {
		await mount();
		search("crosshair");
		const titles = qa(".setting-row__title").map((n) => n.textContent?.toLowerCase() ?? "");
		expect(titles.length).toBeGreaterThan(0);
		for (const title of titles) expect(title).toContain("crosshair");
	});
});
