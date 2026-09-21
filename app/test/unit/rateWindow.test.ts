import { describe, it, expect } from "vitest";
import { RateWindow } from "@/plugins/generator/engine/rateWindow";

describe("RateWindow", () => {
	it("ignores the second still filling, so a partial bucket cannot drag the rate down", () => {
		const w = new RateWindow();
		const t0 = 10_000;
		w.add(10, t0);
		w.add(10, t0 + 1000);
		w.add(1, t0 + 2000);
		expect(w.inWindow(t0 + 2500)).toBe(20);
		expect(w.perSecond(t0 + 2500)).toBe(10);
	});

	it("treats a stall as a falling rate rather than freezing the last good one", () => {
		const w = new RateWindow();
		const t0 = 10_000;
		w.add(10, t0);
		w.add(10, t0 + 1000);
		expect(w.perSecond(t0 + 5500)).toBe(4);
	});

	it("is zero until a whole second has elapsed", () => {
		const w = new RateWindow();
		w.add(5, 1000);
		expect(w.perSecond(1500)).toBe(0);
	});
});
