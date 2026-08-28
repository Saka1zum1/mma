import { describe, it, expect, vi, beforeEach } from "vitest";

// Pins per-selection picking (issue #139): a count is a per-bucket cap, buckets are the
// active selections, and their picks union (a location in two selections is picked once).

const h = vi.hoisted(() => ({
	sampledScopes: [] as unknown[],
	spacedScopes: [] as unknown[],
}));

vi.mock("@/lib/commands", () => {
	const map = {
		id: "m1",
		meta: {
			id: "m1",
			name: "test",
			description: "",
			folder: null,
			locationCount: 20,
			tags: {
				1: { id: 1, name: "a", color: "#ff0000", visible: true },
				2: { id: 2, name: "b", color: "#00ff00", visible: true },
			},
			settings: {},
			scoreBounds: null,
			createdAt: "",
			updatedAt: "",
			extra: null,
		},
	};
	// Tag 1 and tag 2 overlap on ids 4 and 5; tag 3 is disjoint from both.
	const byTag: Record<number, number[]> = {
		1: [1, 2, 3, 4, 5],
		2: [4, 5, 6, 7, 8],
		3: [11, 12, 13, 14, 15],
	};
	type TestSelector =
		| { type: "Tag"; tagId: number }
		| { type: "Union"; selections: { selector: TestSelector }[] };
	const poolOf = (selector: TestSelector): number[] => {
		if (selector.type === "Tag") return byTag[selector.tagId] ?? [];
		return [...new Set(selector.selections.flatMap((selection) => poolOf(selection.selector)))];
	};
	const handlers: Record<string, (...args: never[]) => unknown> = {
		storeGetMap: async () => map,
		storeOpenMap: async () => ({
			tagCounts: { 1: 5, 2: 5 },
			canUndo: false,
			canRedo: false,
			knownFieldKeys: [],
		}),
		storeSyncSelections: async () => ({ counts: {}, bitmask: null, selectedCount: 0 }),
		storeSample: async (selector: TestSelector, n: number) => {
			h.sampledScopes.push(selector);
			return poolOf(selector).slice(0, n);
		},
		storeSpaced: async (selector: TestSelector, targetCount: number | null) => {
			h.spacedScopes.push(selector);
			const pool = poolOf(selector);
			return { ids: pool.slice(0, targetCount ?? pool.length), distanceM: 100 };
		},
	};
	return {
		cmd: new Proxy({}, { get: (_t, name: string) => handlers[name] ?? (async () => null) }),
	};
});
vi.mock("@/lib/util/log", () => ({
	log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {} },
	fireAndForget: (p: Promise<unknown>) => void p.catch(() => {}),
}));

import {
	openMap,
	addSelections,
	resetSelections,
	setSelectedLocationIds,
	selectRandomFromSelection,
	selectSpacedFromSelection,
	getMapState,
} from "@/store/useMapStore";

/** The ids of the Manual selection a pick leaves behind. */
function pickedIds(): number[] {
	const sel = getMapState().selections[0];
	return sel?.selector.type === "Manual" ? [...sel.selector.locations] : [];
}

beforeEach(async () => {
	await openMap("m1");
	await resetSelections();
	h.sampledScopes = [];
	h.spacedScopes = [];
});

describe("random pick, per selection", () => {
	it("caps each selection separately instead of the union", async () => {
		await addSelections([
			{ type: "Tag", tagId: 1 },
			{ type: "Tag", tagId: 3 },
		]);

		const picked = await selectRandomFromSelection(2, true);

		expect(picked).toBe(4);
		const ids = pickedIds();
		expect(ids.filter((id) => id <= 5)).toHaveLength(2);
		expect(ids.filter((id) => id >= 11)).toHaveLength(2);
	});

	it("unions overlapping selections without double-picking", async () => {
		await addSelections([
			{ type: "Tag", tagId: 1 },
			{ type: "Tag", tagId: 2 },
		]);

		// 5 from each of two 5-id selections that share 2 ids.
		const picked = await selectRandomFromSelection(5, true);

		expect(picked).toBe(8);
		expect(new Set(pickedIds()).size).toBe(8);
	});

	it("falls back to the whole selection below two selections", async () => {
		await addSelections([{ type: "Tag", tagId: 1 }]);
		setSelectedLocationIds(new Set([90, 91, 92]));

		const picked = await selectRandomFromSelection(2, true);

		expect(picked).toBe(2);
		expect(h.sampledScopes).toEqual([{ type: "Union", selections: [expect.any(Object)] }]);
	});

	it("ignores ghosted selections", async () => {
		await addSelections([
			{ type: "Tag", tagId: 1 },
			{ type: "Tag", tagId: 2 },
		]);
		const { toggleGhostSelection } = await import("@/store/useMapStore");
		await toggleGhostSelection("tag:2");

		await selectRandomFromSelection(2, true);

		// One live selection left, so the pick runs once over the whole selection.
		expect(h.sampledScopes).toEqual([{ type: "Union", selections: [expect.any(Object)] }]);
	});
});

describe("spaced pick, per selection", () => {
	it("runs once per selection, scoped to that selector", async () => {
		await addSelections([
			{ type: "Tag", tagId: 1 },
			{ type: "Tag", tagId: 2 },
		]);

		const { picked, distanceM } = await selectSpacedFromSelection({ count: 2 }, true);

		expect(h.spacedScopes).toEqual([
			{ type: "Tag", tagId: 1 },
			{ type: "Tag", tagId: 2 },
		]);
		expect(picked).toBe(4);
		// Spacing holds only within a bucket, so a multi-bucket pick claims none.
		expect(distanceM).toBe(0);
	});

	it("passes the whole selector tree for a whole-selection pick", async () => {
		await addSelections([
			{ type: "Tag", tagId: 1 },
			{ type: "Tag", tagId: 2 },
		]);
		setSelectedLocationIds(new Set([1, 2, 3]));

		const { distanceM } = await selectSpacedFromSelection({ count: 3 }, false);

		expect(h.spacedScopes).toEqual([
			{ type: "Union", selections: [expect.any(Object), expect.any(Object)] },
		]);
		expect(distanceM).toBe(100);
	});
});
