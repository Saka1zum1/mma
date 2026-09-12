import { describe, it, expect } from "vitest";
import {
	textColorFor,
	hexToHsl,
	hslToHex,
	hslToRgb,
	rgbCss,
	asRgb,
	rgbToHex,
	labelColor,
	colorForName,
} from "@/lib/util/color";

describe("textColorFor", () => {
	it("returns black for light backgrounds", () => {
		expect(textColorFor("#ffffff")).toBe("#000");
		expect(textColorFor("#ffff00")).toBe("#000");
	});

	it("returns white for dark backgrounds", () => {
		expect(textColorFor("#000000")).toBe("#fff");
		expect(textColorFor("#000080")).toBe("#fff");
	});

	it("handles without hash", () => {
		expect(textColorFor("ffffff")).toBe("#000");
	});
});

describe("hexToHsl", () => {
	it("pure red", () => {
		const { h, s, l } = hexToHsl("#ff0000");
		expect(h).toBe(0);
		expect(s).toBe(100);
		expect(l).toBe(50);
	});

	it("pure green", () => {
		const { h } = hexToHsl("#00ff00");
		expect(h).toBe(120);
	});

	it("pure blue", () => {
		const { h } = hexToHsl("#0000ff");
		expect(h).toBe(240);
	});

	it("white", () => {
		const { s, l } = hexToHsl("#ffffff");
		expect(s).toBe(0);
		expect(l).toBe(100);
	});

	it("black", () => {
		const { s, l } = hexToHsl("#000000");
		expect(s).toBe(0);
		expect(l).toBe(0);
	});

	it("gray", () => {
		const { s } = hexToHsl("#808080");
		expect(s).toBe(0);
	});
});

describe("hslToHex", () => {
	it("pure red", () => {
		expect(hslToHex(0, 100, 50)).toBe("#ff0000");
	});

	it("pure green", () => {
		expect(hslToHex(120, 100, 50)).toBe("#00ff00");
	});

	it("pure blue", () => {
		expect(hslToHex(240, 100, 50)).toBe("#0000ff");
	});

	it("white", () => {
		expect(hslToHex(0, 0, 100)).toBe("#ffffff");
	});

	it("black", () => {
		expect(hslToHex(0, 0, 0)).toBe("#000000");
	});
});

describe("hexToHsl -> hslToHex round-trip", () => {
	// Only exact-representable colors round-trip (HSL uses integer degrees/percent)
	const colors = ["#ff0000", "#00ff00", "#0000ff", "#ffffff", "#000000", "#ff8800"];
	for (const hex of colors) {
		it(`round-trips ${hex}`, () => {
			const { h, s, l } = hexToHsl(hex);
			const result = hslToHex(h, s, l);
			expect(result).toBe(hex);
		});
	}
});

describe("hslToRgb", () => {
	it("pure red", () => {
		expect(hslToRgb(0, 1, 0.5)).toEqual([255, 0, 0]);
	});

	it("white", () => {
		expect(hslToRgb(0, 0, 1)).toEqual([255, 255, 255]);
	});
});

describe("rgbCss", () => {
	it("formats RGB tuple as CSS string", () => {
		expect(rgbCss([255, 128, 0])).toBe("rgb(255, 128, 0)");
	});
});

describe("asRgb", () => {
	it("passes through a valid RGB object", () => {
		expect(asRgb({ r: 42, g: 42, b: 42 })).toEqual({ r: 42, g: 42, b: 42 });
	});

	it("accepts a leftover [r,g,b] tuple", () => {
		expect(asRgb([255, 0, 128])).toEqual({ r: 255, g: 0, b: 128 });
	});

	it("rejects invalid values", () => {
		expect(asRgb(null)).toBeNull();
		expect(asRgb([1, 2])).toBeNull();
		expect(asRgb({ r: Number.NaN, g: 0, b: 0 })).toBeNull();
	});
});

describe("rgbToHex", () => {
	it("formats an RGB object as a hex string", () => {
		expect(rgbToHex({ r: 255, g: 128, b: 0 })).toBe("#ff8000");
		expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
	});

	it("formats a leftover [r,g,b] tuple", () => {
		expect(rgbToHex([255, 128, 0] as unknown as { r: number; g: number; b: number })).toBe(
			"#ff8000",
		);
	});
});

describe("labelColor", () => {
	it("uses the override when one is set (keyed by lowercased name)", () => {
		expect(labelColor("WIP", { wip: "#ff0000" })).toBe("#ff0000");
	});

	it("falls back to the deterministic name color when unset", () => {
		expect(labelColor("europe", {})).toBe(colorForName("europe"));
	});
});
