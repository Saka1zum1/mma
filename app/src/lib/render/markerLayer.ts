import type { Layer } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import SDFMarkerLayer from "@/lib/render/sdf-marker-layer/SDFMarkerLayer";
import type { MarkerStyle } from "@/components/editor/map/mapSettingsTypes";
import type { CellManager } from "@/lib/render/CellManager";
import type { PanoDot } from "@/lib/geo/photometa";

export type MarkerBuf = { positions: Float32Array; colors: Uint8Array; angles: Float32Array };

// Per-style layer class + shape constants. `idSuffix` keeps deck.gl layer ids stable across styles.
export const MARKER_STYLE = {
	circle: { Layer: ScatterplotLayer, idSuffix: "s", angle: false, base: { getRadius: 6, radiusUnits: "pixels", radiusMinPixels: 3 } },
	arrow: { Layer: SDFMarkerLayer, idSuffix: "d", angle: true, base: { shape: "arrow", radiusPixels: 12 } },
	pin: { Layer: SDFMarkerLayer, idSuffix: "d", angle: false, base: { shape: "pin", radiusPixels: 16 } },
} as const;

export function buildMarkerLayer(
	markerStyle: MarkerStyle,
	idBase: string,
	count: number,
	buf: MarkerBuf,
	colorVer: number,
	posVer: number,
	opacity?: number,
): Layer {
	const s = MARKER_STYLE[markerStyle];
	const attributes: Record<string, unknown> = {
		getPosition: { value: buf.positions, size: 2 },
		getFillColor: { value: buf.colors, size: 4 },
	};
	if (s.angle) attributes.getAngle = { value: buf.angles, size: 1 };
	const LayerClass = s.Layer as new (props: Record<string, unknown>) => Layer;
	return new LayerClass({
		id: `${idBase}:${s.idSuffix}`,
		data: { length: count, attributes },
		...s.base,
		pickable: true,
		...(opacity != null ? { opacity } : {}),
		updateTriggers: {
			...(opacity != null ? { opacity: [opacity] } : {}),
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
			),
		);
	}
	return out;
}

export function panoDotsLayer(
	dots: PanoDot[],
	color: [number, number, number],
	scaled: boolean,
): Layer {
	// scaled: radius in meters (grows when zoomed in). otherwise a constant on-screen pixel size.
	return new ScatterplotLayer<PanoDot>({
		id: "panorama-dots",
		data: dots,
		getPosition: (d) => [d.lng, d.lat],
		getFillColor: color,
		radiusUnits: scaled ? "meters" : "pixels",
		getRadius: scaled ? 2 : 4,
		radiusMaxPixels: scaled ? 24 : 4,
		stroked: false,
		filled: true,
		opacity: 0.7,
		pickable: false,
		updateTriggers: { getFillColor: color },
	});
}
