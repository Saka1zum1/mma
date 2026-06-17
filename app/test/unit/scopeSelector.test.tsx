// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScopeSelector } from "@/components/primitives/ScopeSelector";
import type { ScopeController } from "@/store/useMapStore";

const ctl = (over: Partial<ScopeController>): ScopeController => ({
	scope: { kind: "all" },
	setScope: () => {},
	allCount: 1234,
	selectionCount: 0,
	...over,
});

describe("ScopeSelector", () => {
	it("checks the radio matching scope.kind", () => {
		const all = renderToStaticMarkup(<ScopeSelector ctl={ctl({ scope: { kind: "all" } })} />);
		// first (all) radio checked, second not
		expect(all.match(/checked=""/g)?.length).toBe(1);
		expect(all).toMatch(/All locations/);

		const sel = renderToStaticMarkup(
			<ScopeSelector ctl={ctl({ scope: { kind: "selected" }, selectionCount: 3 })} />,
		);
		expect(sel.match(/checked=""/g)?.length).toBe(1);
		expect(sel).toMatch(/Current selection/);
	});

	it("disables and dims the selection option when nothing is selected", () => {
		const html = renderToStaticMarkup(<ScopeSelector ctl={ctl({ selectionCount: 0 })} />);
		expect(html).toMatch(/disabled=""/);
		expect(html).toMatch(/opacity:0\.5/);
	});

	it("renders formatted counts", () => {
		const html = renderToStaticMarkup(
			<ScopeSelector ctl={ctl({ allCount: 1234, selectionCount: 56 })} />,
		);
		expect(html).toMatch(/1,234/);
		expect(html).toMatch(/56/);
	});
});
