// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
	parsePanoDate,
	svSearchRadius,
	normalizeHeading,
	nearestLinkHeading,
	panoTileLayout,
	calcHeading,
	samePano,
	isUnofficial,
	svThumbnailUrl,
} from "@/lib/sv/lookup";

describe("parsePanoDate", () => {
	it("passes through a valid Date", () => {
		const d = new Date("2024-06-15");
		expect(parsePanoDate(d).getTime()).toBe(d.getTime());
	});

	it("parses {year, month} object", () => {
		const d = parsePanoDate({ year: 2024, month: 6 });
		expect(d.getFullYear()).toBe(2024);
		expect(d.getMonth()).toBe(5); // 0-indexed
	});

	it("parses YYYY-MM string", () => {
		const d = parsePanoDate("2024-06");
		expect(d.getFullYear()).toBe(2024);
		expect(d.getMonth()).toBe(5);
	});

	it("returns epoch for null", () => {
		expect(parsePanoDate(null).getTime()).toBe(0);
	});

	it("returns epoch for invalid Date", () => {
		expect(parsePanoDate(new Date("invalid")).getTime()).toBe(0);
	});

	it("handles missing month in {year} object", () => {
		const d = parsePanoDate({ year: 2020 });
		expect(d.getFullYear()).toBe(2020);
		expect(d.getMonth()).toBe(0);
	});
});

describe("svSearchRadius", () => {
	it("is unclamped at high zoom (the 25m floor now lives in the caller)", () => {
		expect(svSearchRadius(0, 20)).toBeLessThan(1);
	});

	it("larger at low zoom", () => {
		const lowZoom = svSearchRadius(0, 5);
		const highZoom = svSearchRadius(0, 15);
		expect(lowZoom).toBeGreaterThan(highZoom);
	});

	it("accounts for latitude (smaller radius at high latitudes)", () => {
		const equator = svSearchRadius(0, 10);
		const polar = svSearchRadius(80, 10);
		expect(equator).toBeGreaterThan(polar);
	});

	it("zoom 0 produces an absurdly large radius (the jump bug)", () => {
		const r = svSearchRadius(0, 0);
		expect(r).toBeGreaterThan(600_000);
	});

	it("zoom 15+ produces a radius suitable for local navigation", () => {
		const r = svSearchRadius(0, 15);
		expect(r).toBeLessThan(200);
	});
});

describe("normalizeHeading", () => {
	it("passes through values in [-180, 180]", () => {
		expect(normalizeHeading(0)).toBe(0);
		expect(normalizeHeading(90)).toBe(90);
		expect(normalizeHeading(-90)).toBe(-90);
		expect(normalizeHeading(180)).toBe(180);
		expect(normalizeHeading(-180)).toBe(-180);
	});

	it("wraps values > 180", () => {
		expect(normalizeHeading(270)).toBe(-90);
		expect(normalizeHeading(360)).toBe(0);
	});

	it("wraps values < -180", () => {
		expect(normalizeHeading(-270)).toBe(90);
		expect(normalizeHeading(-360)).toBe(0);
	});
});

describe("nearestLinkHeading", () => {
	it("returns null for empty input", () => {
		expect(nearestLinkHeading([], 90)).toBeNull();
	});

	it("picks the heading with smallest angular distance", () => {
		expect(nearestLinkHeading([0, 90, 180, 270], 80)).toBe(90);
		expect(nearestLinkHeading([0, 90, 180, 270], 100)).toBe(90);
	});

	it("crosses the 0/360 wrap boundary", () => {
		expect(nearestLinkHeading([10, 200], 350)).toBe(10);
		expect(nearestLinkHeading([350, 170], 10)).toBe(350);
	});

	it("does not bias clockwise vs counterclockwise", () => {
		// 70 and 110 are both 20deg from 90; first-seen wins on a tie
		expect(nearestLinkHeading([70, 110], 90)).toBe(70);
		expect(nearestLinkHeading([110, 70], 90)).toBe(110);
	});
});

describe("panoTileLayout", () => {
	it("uses a fixed 512px tile pitch", () => {
		expect(panoTileLayout(3, { width: 6656, height: 3328 }).tile).toBe(512);
	});

	it("Gen 4 (16384x8192) fills the grid with no black padding", () => {
		const l = panoTileLayout(3, { width: 16384, height: 8192 });
		expect(l).toMatchObject({ zoom: 3, cols: 8, rows: 4, width: 4096, height: 2048 });
	});

	it("Gen 3 (6656x3328) crops the black padding instead of a full 8x4 grid", () => {
		const l = panoTileLayout(3, { width: 6656, height: 3328 });
		expect(l).toMatchObject({ zoom: 3, cols: 7, rows: 4, width: 3328, height: 1664 });
	});

	it("Gen 3 at native zoom keeps the half-row crop (13 cols, 6.5 rows)", () => {
		const l = panoTileLayout(4, { width: 6656, height: 3328 });
		expect(l).toMatchObject({ zoom: 4, cols: 13, rows: 7, width: 6656, height: 3328 });
	});

	it("clamps requested zoom to the pano's native max zoom", () => {
		const l = panoTileLayout(5, { width: 6656, height: 3328 });
		expect(l.zoom).toBe(4);
		expect(l.width).toBe(6656);
	});

	it("falls back to the full power-of-two grid without metadata", () => {
		const l = panoTileLayout(3);
		expect(l).toMatchObject({ zoom: 3, cols: 8, rows: 4, width: 4096, height: 2048 });
	});
});

describe("calcHeading", () => {
	function makeData(opts: {
		centerHeading?: number;
		links?: { heading: number }[];
	}): google.maps.StreetViewResolvedPanoramaData {
		return {
			tiles: { centerHeading: opts.centerHeading ?? 0, originHeading: 0 },
			links: opts.links ?? [],
		} as any;
	}

	it("returns 0 when pointAlongRoad is false", () => {
		expect(calcHeading(makeData({ centerHeading: 90, links: [{ heading: 45 }] }))).toBe(0);
		expect(calcHeading(makeData({ centerHeading: 90 }), { pointAlongRoad: false })).toBe(0);
	});

	it("returns first link heading when no preferDirection", () => {
		const data = makeData({ links: [{ heading: 45 }, { heading: 135 }] });
		expect(calcHeading(data, { pointAlongRoad: true })).toBe(45);
	});

	it("returns center heading for forwards", () => {
		const data = makeData({ centerHeading: 90 });
		expect(calcHeading(data, { pointAlongRoad: true, preferDirection: "forwards" })).toBe(90);
	});

	it("returns center - 180 for backwards", () => {
		const data = makeData({ centerHeading: 90 });
		expect(calcHeading(data, { pointAlongRoad: true, preferDirection: "backwards" })).toBe(-90);
	});

	it("picks closest link to cardinal direction", () => {
		const data = makeData({ links: [{ heading: 10 }, { heading: 170 }, { heading: 260 }] });
		expect(calcHeading(data, { pointAlongRoad: true, preferDirection: "south" })).toBe(170);
		expect(calcHeading(data, { pointAlongRoad: true, preferDirection: "west" })).toBe(260);
		expect(calcHeading(data, { pointAlongRoad: true, preferDirection: "north" })).toBe(10);
	});
});

describe("samePano", () => {
	const makeP = (pano: string) => ({ location: { pano } }) as any;

	it("true for same pano ID", () => {
		expect(samePano(makeP("ABC"), makeP("ABC"))).toBe(true);
	});

	it("false for different pano ID", () => {
		expect(samePano(makeP("ABC"), makeP("XYZ"))).toBe(false);
	});

	it("false for null", () => {
		expect(samePano(null, makeP("ABC"))).toBe(false);
		expect(samePano(makeP("ABC"), null)).toBe(false);
		expect(samePano(null, null)).toBe(false);
	});
});

describe("isUnofficial", () => {
	it("long pano ID is unofficial", () => {
		expect(isUnofficial({ location: { pano: "A".repeat(30) } } as any)).toBe(true);
	});

	it("22-char pano ID is official", () => {
		expect(isUnofficial({ location: { pano: "A".repeat(22) } } as any)).toBe(false);
	});

	it("null is not unofficial", () => {
		expect(isUnofficial(null)).toBe(false);
	});

	it("copyright with 'user-uploaded' is unofficial", () => {
		expect(
			isUnofficial({
				location: { pano: "A".repeat(22) },
				copyright: "Photo by John",
			} as any),
		).toBe(true);
	});
});

describe("svThumbnailUrl", () => {
	it("includes pano ID and heading", () => {
		const url = svThumbnailUrl("ABC123", 90);
		expect(url).toContain("panoid=ABC123");
		expect(url).toContain("yaw=90");
	});

	it("uses default dimensions", () => {
		const url = svThumbnailUrl("ABC123", 0);
		expect(url).toContain("w=320");
		expect(url).toContain("h=180");
	});

	it("respects custom dimensions", () => {
		const url = svThumbnailUrl("ABC123", 0, 640, 360);
		expect(url).toContain("w=640");
		expect(url).toContain("h=360");
	});
});
