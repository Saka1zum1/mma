import type { Layer } from "@deck.gl/core";
import SDFMarkerLayer from "@/lib/render/sdf-marker-layer/SDFMarkerLayer";
import type { MarkerShape } from "@/lib/render/sdf-marker-layer/markerMesh";
import type { Bounds, MarkerStyle } from "@/types";
import { cellBounds, boundsIntersectCell, type CellManager } from "@/lib/render/CellManager";

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

// Per-style shape + on-screen radius. Mirrored in Rust (location_store.rs pick
// module) and JS (markerMesh.ts) — keep in sync.
// footprintPx = the shape's solid on-screen width (circle diameter, pin head
// diameter, arrow body) — the widest rep spacing at which decimating a neighbor
// is visually a no-op.
export const MARKER_STYLE: Record<
	MarkerStyle,
	{ shape: MarkerShape; radiusPixels: number; angle: boolean; footprintPx: number }
> = {
	circle: { shape: "circle", radiusPixels: 6, angle: false, footprintPx: 12 },
	arrow: { shape: "arrow", radiusPixels: 12, angle: true, footprintPx: 10 },
	pin: { shape: "pin", radiusPixels: 16, angle: false, footprintPx: 22 },
};

/** Rep spacing the LOD should target for this style/size — see lodBandForZoom.
 *  A dropped marker sits at most one bin diagonal (binPx * sqrt(2)) from its rep,
 *  so the diagonal must fit inside the rep's solid radius (footprint / 2) for
 *  decimation to be visually lossless: binPx <= footprint / (2 * sqrt(2)). */
export function lodBinTarget(markerStyle: MarkerStyle, markerSize: number): number {
	return (MARKER_STYLE[markerStyle].footprintPx * markerSize) / (2 * Math.SQRT2);
}

/** Running draw-order allocator for one frame's marker layers. `total` must be
 *  identical across all layers — allocate every count before building (two-pass). */
export interface DrawOrder {
	base: number;
	total: number;
}

export function buildMarkerLayer(
	markerStyle: MarkerStyle,
	idBase: string,
	count: number,
	buf: MarkerBuf,
	colorVer: number | string,
	posVer: number | string,
	order: DrawOrder,
	opacity?: number,
	sizeScale = 1,
): Layer {
	const flatten = opacity != null && opacity > 0 && opacity < 1;
	const s = MARKER_STYLE[markerStyle];
	const attributes: Record<string, { value: Float32Array | Uint8Array; size: number }> = {
		getPosition: { value: buf.positions, size: 2 },
		getFillColor: { value: buf.colors, size: 4 },
	};
	if (s.angle) attributes.getAngle = { value: buf.angles, size: 1 };
	// Same gamma deck applies to its own opacity prop, so the slider feels identical.
	const flatOpacity = flatten ? Math.pow(opacity, 1 / 2.2) : 0;
	return new SDFMarkerLayer({
		id: `${idBase}:m`,
		data: { length: count, attributes },
		shape: s.shape,
		radiusPixels: s.radiusPixels * sizeScale,
		orderBase: order.base,
		orderTotal: order.total,
		opaque: opacity == null || opacity >= 1,
		pickable: false,
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

/** One marker layer per non-empty cell — full detail, or the band's decimated
 *  representatives (same style, same size) when `lodBand` is set. `viewBounds`
 *  culls whole cells outside the (padded) viewport: offscreen cells emit no
 *  layer, no instances, and — critically — never rebuild a stale LOD band in the
 *  draw path. Must match `baseMarkerCount`'s bounds for order-slot consistency. */
export function baseMarkerLayers(
	cm: CellManager,
	markerStyle: MarkerStyle,
	markerOpacity: number,
	order: DrawOrder,
	markerSize = 1,
	lodBand: number | null = null,
	viewBounds: Bounds | null = null,
): Layer[] {
	if (markerOpacity <= 0 || cm.totalCount === 0) return [];
	const out: Layer[] = [];
	for (const [cellKey, cell] of cm.cells) {
		if (cell.count === 0) continue;
		if (viewBounds && !boundsIntersectCell(viewBounds, cellBounds(cellKey))) continue;
		// Same layer id in both modes: a band crossing (or the full-detail boundary)
		// swaps attribute buffers on the live layer instead of rebuilding its models,
		// so no async-shader-compile gap. Trigger strings are namespaced because the
		// lod version counter and the cell version counters can collide numerically.
		if (lodBand != null) {
			const lod = cell.getLod(lodBand);
			if (lod.count === 0) continue;
			out.push(
				buildMarkerLayer(
					markerStyle,
					`cell:${cellKey}`,
					lod.count,
					lod,
					`lod:${lod.version}`,
					`lod:${lod.version}`,
					order,
					markerOpacity,
					markerSize,
				),
			);
			order.base += lod.count;
		} else {
			out.push(
				buildMarkerLayer(
					markerStyle,
					`cell:${cellKey}`,
					cell.count,
					cell,
					`full:${cell.colorVersion}`,
					`full:${cell.positionVersion}`,
					order,
					markerOpacity,
					markerSize,
				),
			);
			order.base += cell.count;
		}
	}
	return out;
}

/** Sum of instances `baseMarkerLayers` will emit — for pre-allocating draw order.
 *  Same `viewBounds` as the layer build, or the order slots drift. */
export function baseMarkerCount(
	cm: CellManager,
	markerOpacity: number,
	lodBand: number | null,
	viewBounds: Bounds | null = null,
): number {
	if (markerOpacity <= 0 || cm.totalCount === 0) return 0;
	let n = 0;
	for (const [cellKey, cell] of cm.cells) {
		if (cell.count === 0) continue;
		if (viewBounds && !boundsIntersectCell(viewBounds, cellBounds(cellKey))) continue;
		n += lodBand == null ? cell.count : cell.getLod(lodBand).count;
	}
	return n;
}
