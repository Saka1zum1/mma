// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { initLocale } from "@/lib/i18n";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@/lib/util/log", () => ({
	log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// cmdk observes its list's size and scrolls the selection into view; jsdom has neither.
vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);
Element.prototype.scrollIntoView = () => {};

const { registerPlugin, unregisterPlugin, setPluginEnabled } = await import("@/plugins/registry");
const { openDialog, useDialog } = await import("@/store/dialogBus");
const { getMapState } = await import("@/store/useMapStore");
const { CommandPalette } = await import("@/components/editor/CommandPalette");

function ModalProbe({ spy }: { spy: (id: string) => void }) {
	useDialog("plugin-modal", spy);
	return null;
}

const paletteItems = () => [...document.querySelectorAll(".command-palette__item")];

const itemFor = (label: string) =>
	paletteItems().find((el) => el.textContent?.includes(label)) as HTMLElement | undefined;

let unmount: (() => void) | null = null;

async function mount(node: ReactNode = <CommandPalette />) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => root.render(node));
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

describe("command palette plugin entries", () => {
	beforeAll(async () => {
		await initLocale("en");
		registerPlugin({
			id: "test-sidebar",
			name: "Sidebar Plugin",
			description: "",
			icon: "M0 0",
			activate: () => {},
			sidebar: () => null,
		});
		registerPlugin({
			id: "test-modal",
			name: "Modal Plugin",
			description: "",
			icon: "M0 0",
			activate: () => {},
			modal: () => null,
		});
		registerPlugin({
			id: "test-background",
			name: "Background Plugin",
			description: "",
			icon: "M0 0",
			activate: () => {},
		});
		for (const id of ["test-sidebar", "test-modal", "test-background"])
			setPluginEnabled(id, true);
	});

	afterAll(() => {
		for (const id of ["test-sidebar", "test-modal", "test-background"]) {
			setPluginEnabled(id, false);
			unregisterPlugin(id);
		}
	});

	it("lists every openable enabled plugin, and only those", async () => {
		await mount();
		act(() => openDialog("command-palette"));
		expect(itemFor("Sidebar Plugin")).toBeTruthy();
		expect(itemFor("Modal Plugin")).toBeTruthy();
		expect(itemFor("Background Plugin")).toBeUndefined();
	});

	it("a sidebar plugin entry enters plugin mode, exactly like its toolbar button", async () => {
		await mount();
		act(() => openDialog("command-palette"));
		act(() => itemFor("Sidebar Plugin")!.click());
		expect(getMapState().activePluginId).toBe("test-sidebar");
		expect(getMapState().workArea).toBe("plugin");
	});

	it("a modal plugin entry opens its modal through the dialog bus", async () => {
		const spy = vi.fn();
		await mount(
			<>
				<CommandPalette />
				<ModalProbe spy={spy} />
			</>,
		);
		act(() => openDialog("command-palette"));
		act(() => itemFor("Modal Plugin")!.click());
		expect(spy).toHaveBeenCalledWith("test-modal");
	});
});
