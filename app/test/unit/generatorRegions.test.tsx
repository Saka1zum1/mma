// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Selection } from "@/bindings.gen";
import type { GeneratorRegionMeta } from "@/plugins/generator/engine/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const h = vi.hoisted(() => ({ selections: [] as Selection[] }));

vi.mock("@/lib/util/log", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/store/useMapStore", () => ({
	getActiveSelections: () => h.selections,
	useMapState: (sel: (s: unknown) => unknown) => sel(undefined),
}));

const { RegionSelector } = await import("@/plugins/generator/ui/RegionSelector");

function polygon(key: string, name: string, code?: string): Selection {
	return {
		key,
		color: "#fff",
		selector: {
			type: "Polygon",
			polygon: { properties: { name, code }, coordinates: [] },
		},
	} as unknown as Selection;
}

function region(target: number, found: number, isProcessing = false): GeneratorRegionMeta {
	return {
		target,
		found: Array.from({ length: found }, () => ({}) as never),
		checkedPanos: new Set<string>(),
		isProcessing,
	};
}

let unmount: (() => void) | null = null;

function render(selections: Selection[], meta: Map<string, GeneratorRegionMeta>) {
	h.selections = selections;
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() =>
		root.render(
			<RegionSelector
				defaultTarget={10}
				onDefaultTargetChange={() => {}}
				meta={meta}
				onMetaChange={() => {}}
			/>,
		),
	);
	unmount = () => {
		act(() => root.unmount());
		container.remove();
	};
	return container;
}

afterEach(() => {
	unmount?.();
	unmount = null;
});

describe("the generator region list", () => {
	it("shows a flag for a two-letter country code and none for a subdivision code", () => {
		const container = render(
			[polygon("a", "France", "FR"), polygon("b", "Kabul", "AFG")],
			new Map([
				["a", region(10, 0)],
				["b", region(10, 0)],
			]),
		);

		const rows = [...container.querySelectorAll(".generator-regions__item-name")];
		expect(rows).toHaveLength(2);
		expect(rows[0].querySelector("img")?.getAttribute("src")).toBe("/flags/FR.svg");
		expect(rows[1].querySelector("img")).toBeNull();
	});

	it("totals found and target across every region", () => {
		const container = render(
			[polygon("a", "France", "FR"), polygon("b", "Spain", "ES")],
			new Map([
				["a", region(10, 3)],
				["b", region(25, 7)],
			]),
		);

		expect(container.querySelector(".generator-regions__total")?.textContent).toBe("Total: 10 / 35");
	});

	it("spins only on the region being processed", () => {
		const container = render(
			[polygon("a", "France", "FR"), polygon("b", "Spain", "ES")],
			new Map([
				["a", region(10, 3, true)],
				["b", region(25, 7, false)],
			]),
		);

		const rows = [...container.querySelectorAll(".generator-regions__item-name")];
		expect(rows[0].querySelector(".generator-regions__spinner")).not.toBeNull();
		expect(rows[1].querySelector(".generator-regions__spinner")).toBeNull();
	});
});
