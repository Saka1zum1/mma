// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
	activeId: null as number | null,
	selected: new Set<number>(),
	listeners: new Map<string, Array<() => void>>(),
}));

vi.mock("@/lib/events", () => ({
	emit: (evt: string) => {
		for (const fn of h.listeners.get(evt) ?? []) fn();
	},
	subscribe: (evt: string, fn: () => void) => {
		let list = h.listeners.get(evt);
		if (!list) {
			list = [];
			h.listeners.set(evt, list);
		}
		list.push(fn);
		return () => {
			const l = h.listeners.get(evt);
			if (l)
				h.listeners.set(
					evt,
					l.filter((f) => f !== fn),
				);
		};
	},
}));

vi.mock("@/store/useMapStore", () => ({
	getMapState: () => ({
		activeLocation: h.activeId == null ? null : { id: h.activeId },
		selectedLocationIds: h.selected,
	}),
	mapOpen: { mark: () => {} },
	setSelectedLocationIds: () => {},
}));

import { getScene, startSceneEngine } from "@/lib/render/sceneStore";
import { subscribe as subscribeEvent } from "@/lib/events";

const notifyStore = () => (h.listeners.get("store:changed") ?? []).forEach((fn) => fn());

beforeEach(() => {
	h.activeId = null;
	h.selected = new Set();
	h.listeners.clear();
});

describe("sceneStore (single scene source)", () => {
	it("exposes one stable CellManager", () => {
		expect(getScene()).toBe(getScene());
	});

	it("active-location change bumps the scene version (fast path, no reload)", () => {
		let bumps = 0;
		const unsub = subscribeEvent("scene:changed", () => bumps++);
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
		const unsub = subscribeEvent("scene:changed", () => bumps++);
		h.activeId = 9;
		notifyStore();
		expect(bumps).toBe(0);
		unsub();
	});
});
