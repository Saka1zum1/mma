// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
	activeId: null as number | null,
	selected: new Set<number>(),
	storeListeners: [] as Array<() => void>,
}));

vi.mock("@/store/useMapStore", () => ({
	getActiveLocation: () => (h.activeId == null ? null : { id: h.activeId }),
	getSelectedLocationIds: () => h.selected,
	mapOpenMark: () => {},
	renderDeltaBus: { on: () => () => {} },
	selBitmaskBus: { on: () => () => {} },
	subscribeStore: (fn: () => void) => {
		h.storeListeners.push(fn);
		return () => {
			h.storeListeners = h.storeListeners.filter((l) => l !== fn);
		};
	},
}));

import { getScene, subscribeScene, startSceneEngine } from "@/lib/render/sceneStore";

const notifyStore = () => h.storeListeners.forEach((fn) => fn());

beforeEach(() => {
	h.activeId = null;
	h.selected = new Set();
	h.storeListeners = [];
});

describe("sceneStore (single scene source)", () => {
	it("exposes one stable CellManager", () => {
		expect(getScene()).toBe(getScene());
	});

	it("active-location change bumps the scene version (fast path, no reload)", () => {
		let bumps = 0;
		const unsub = subscribeScene(() => bumps++);
		const stop = startSceneEngine();

		h.activeId = 5;
		notifyStore();
		expect(bumps).toBeGreaterThan(0);

		const after = bumps;
		notifyStore(); // same active id -> no work, no bump
		expect(bumps).toBe(after);

		stop();
		unsub();
	});

	it("stops reacting to active changes after the engine stops", () => {
		const stop = startSceneEngine();
		stop();
		let bumps = 0;
		const unsub = subscribeScene(() => bumps++);
		h.activeId = 9;
		notifyStore();
		expect(bumps).toBe(0);
		unsub();
	});
});
