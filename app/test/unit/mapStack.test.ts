// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("@/lib/sv/opensv", () => {
	class Size {
		constructor(
			public w: number,
			public h: number,
		) {}
	}
	class ImageMapType {
		opacity = 1;
		constructor(public opts: { getTileUrl(c: { x: number; y: number }, z: number): string }) {}
		setOpacity(opacity: number) {
			this.opacity = opacity;
		}
		getOpacity() {
			return this.opacity;
		}
		getTile(_coord: unknown, _zoom: number, doc: Document) {
			const el = doc.createElement("div");
			el.style.opacity = String(this.opacity);
			return el;
		}
	}
	return { google: { maps: { Size, ImageMapType } } };
});

vi.mock("@/lib/geo/stackedMapType", () => ({
	createCompositeMapType: (layers: unknown[]) => ({ layers }),
}));

import { buildMapStack } from "@/lib/geo/mapStack";
import { BLOBBY_ZOOM_THRESHOLD } from "@/lib/sv/constants";
import { DEFAULT_PREFS } from "@/store/mapEmbedPrefs";

const base = DEFAULT_PREFS;

const layersOf = (r: ReturnType<typeof buildMapStack>) =>
	(r.mapType as unknown as { layers: unknown[] }).layers;

const svUrlAt = (r: ReturnType<typeof buildMapStack>, zoom: number) =>
	(
		r.svLayer as unknown as { opts: { getTileUrl(c: { x: number; y: number }, z: number): string } }
	).opts.getTileUrl({ x: 0, y: 0 }, zoom);

const svLayerOpacity = (r: ReturnType<typeof buildMapStack>) =>
	(r.svLayer as unknown as { getOpacity(): number }).getOpacity();

beforeAll(() => {
	(globalThis as Record<string, unknown>).devicePixelRatio = 1;
});

describe("buildMapStack layer composition", () => {
	it("roadmap + labels => basemap + SV coverage + labels, SV layer included", () => {
		const r = buildMapStack(base, {});
		expect(layersOf(r)).toHaveLength(3);
		expect(layersOf(r)).toContain(r.svLayer);
	});

	it("drops the labels layer when labels are off", () => {
		expect(layersOf(buildMapStack({ ...base, showLabels: false }, {}))).toHaveLength(2);
	});

	it("satellite + terrain + labels => basemap + terrain overlay + SV + labels", () => {
		expect(
			layersOf(buildMapStack({ ...base, mapType: "satellite", showTerrain: true }, {})),
		).toHaveLength(4);
	});

	it("osm has no labels layer (labels baked into base tiles)", () => {
		expect(layersOf(buildMapStack({ ...base, mapType: "osm" }, {}))).toHaveLength(2);
	});

	it("legacy base map stacks a separate labels layer above SV coverage", () => {
		expect(layersOf(buildMapStack({ ...base, mapStyleName: "legacy" }, {}))).toHaveLength(3);
	});

	it("legacy with labels off drops the labels layer", () => {
		expect(
			layersOf(buildMapStack({ ...base, mapStyleName: "legacy", showLabels: false }, {})),
		).toHaveLength(2);
	});
});

describe("SV coverage layer opacity and tile style", () => {
	it("carries svOpacity onto the SV ImageMapType", () => {
		const r = buildMapStack({ ...base, svOpacity: 0.8 }, {});
		expect(svLayerOpacity(r)).toBeCloseTo(0.8);
	});

	it("dims single-coverage blobby SV layer when useBlobby is set", () => {
		const r = buildMapStack(
			{ ...base, svCoverageType: "official", svOpacity: 0.5 },
			{ useBlobby: true },
		);
		expect(svLayerOpacity(r)).toBeCloseTo(0.3);
	});

	it("uses blobby tile URLs when useBlobby is set (zoom threshold is MapEmbed's job)", () => {
		const on = buildMapStack(base, { useBlobby: true });
		const off = buildMapStack(base, {});
		expect(svUrlAt(on, BLOBBY_ZOOM_THRESHOLD)).not.toBe(svUrlAt(off, BLOBBY_ZOOM_THRESHOLD));
		expect(svUrlAt(on, BLOBBY_ZOOM_THRESHOLD + 1)).not.toBe(svUrlAt(off, BLOBBY_ZOOM_THRESHOLD + 1));
	});
});
