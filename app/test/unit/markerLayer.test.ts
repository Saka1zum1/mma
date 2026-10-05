import { describe, it, expect } from "vitest";
import { buildMarkerLayer, MARKER_STYLE, type MarkerBuf } from "@/lib/render/markerLayer";
import SDFMarkerLayer from "@/lib/render/sdf-marker-layer/SDFMarkerLayer";
import type { MarkerStyle } from "@/types";

const buf: MarkerBuf = {
	positions: new Float32Array([0, 0]),
	angles: new Float32Array([0]),
	color: { kind: "perMarker", colors: new Uint8Array([255, 0, 0, 255]) },
};

function build(style: MarkerStyle, group: string | null) {
	return buildMarkerLayer(style, "t", 1, buf, 0, 0, group) as unknown as {
		constructor: unknown;
		props: Record<string, unknown>;
	};
}

describe("marker layer translucency", () => {
	it("a named group draws the marker offscreen", () => {
		const layer = build("pin", "cells");
		expect(layer.props.translucentGroup).toBe("cells");
	});

	it("a null group draws the marker directly", () => {
		const layer = build("pin", null);
		expect(layer.props.translucentGroup).toBeNull();
	});

	it("every marker style uses the SDF layer with its style shape", () => {
		for (const style of Object.keys(MARKER_STYLE) as MarkerStyle[]) {
			for (const group of ["cells", null]) {
				const layer = build(style, group);
				expect(layer).toBeInstanceOf(SDFMarkerLayer);
				expect(layer.props.shape).toBe(MARKER_STYLE[style].shape);
				expect(layer.props.radiusPixels).toBeCloseTo(MARKER_STYLE[style].radiusPixels);
			}
		}
	});
});
