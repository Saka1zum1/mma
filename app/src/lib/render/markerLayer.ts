import type { Layer } from "@deck.gl/core";
import SDFMarkerLayer from "@/lib/render/sdf-marker-layer/SDFMarkerLayer";
import type { MarkerStyle } from "@/types";
import type { CellManager } from "@/lib/render/CellManager";

export type MarkerBuf = { positions: Float32Array; colors: Uint8Array; angles: Float32Array };

// Layer-level translucency: markers composite against each other at full alpha
// (the SDF shader outputs premultiplied color pre-scaled by the target opacity),
// while the constant alpha blend factor caps the canvas alpha at that opacity.
// Overlap then reads uniformly instead of stacking back to opaque. blendColor is
// the legacy-style key luma needs to supply the 'constant' factor's value.
function flattenParameters(op: number) {
	return {
		blend: true,
		blendColorOperation: "add",
		blendColorSrcFactor: "one",
		blendColorDstFactor: "one-minus-src-alpha",
		blendAlphaOperation: "add",
		blendAlphaSrcFactor: "constant",
		blendAlphaDstFactor: "one-minus-src-alpha",
		blendColor: [0, 0, 0, op],
	} as Record<string, unknown>;
}

export const MARKER_STYLE = {
	circle: { shape: "circle", radiusPixels: 6 / 0.7, angle: false },
	arrow: { shape: "arrow", radiusPixels: 12, angle: true },
	pin: { shape: "pin", radiusPixels: 16, angle: false },
} as const;

export function buildMarkerLayer(
	markerStyle: MarkerStyle,
	idBase: string,
	count: number,
	buf: MarkerBuf,
	colorVer: number,
	posVer: number,
	opacity?: number,
	sizeScale = 1,
): Layer {
	const flatten = opacity != null && opacity > 0 && opacity < 1;
	const s = MARKER_STYLE[markerStyle];
	const attributes: Record<string, unknown> = {
		getPosition: { value: buf.positions, size: 2 },
		getFillColor: { value: buf.colors, size: 4 },
	};
	if (s.angle) attributes.getAngle = { value: buf.angles, size: 1 };
	const LayerClass = SDFMarkerLayer as unknown as new (props: Record<string, unknown>) => Layer;
	// Same gamma deck applies to its own opacity prop, so the slider feels identical.
	const flatOpacity = flatten ? Math.pow(opacity, 1 / 2.2) : 0;
	return new LayerClass({
		id: idBase,
		data: { length: count, attributes },
		shape: s.shape,
		radiusPixels: s.radiusPixels * sizeScale,
		pickable: true,
		...(flatten
			? { flattenOpacity: flatOpacity, parameters: flattenParameters(flatOpacity) }
			: opacity != null
				? { opacity }
				: {}),
		updateTriggers: {
			getFillColor: [colorVer],
			getPosition: [posVer],
			...(s.angle ? { getAngle: [posVer] } : {}),
		},
	});
}

// One marker layer per non-empty cell.
export function baseMarkerLayers(
	cm: CellManager,
	markerStyle: MarkerStyle,
	markerOpacity: number,
	markerSize = 1,
): Layer[] {
	if (markerOpacity <= 0 || cm.totalCount === 0) return [];
	const out: Layer[] = [];
	for (const [cellKey, cell] of cm.cells) {
		if (cell.count === 0) continue;
		out.push(
			buildMarkerLayer(
				markerStyle,
				`cell:${cellKey}`,
				cell.count,
				cell,
				cell.colorVersion,
				cell.positionVersion,
				markerOpacity,
				markerSize,
			),
		);
	}
	return out;
}
