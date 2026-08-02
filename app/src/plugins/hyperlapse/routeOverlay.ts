import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { DeckOverlayHandle } from "@/lib/map/host";
import type { LatLng } from "@/types";
import type { HyperlapseFrameMeta } from "./types";

let overlay: DeckOverlayHandle | null = null;

/** Cap markers so huge sequences don't choke the map deck overlay. */
const MAX_MARKERS = 200;

export interface RouteOverlayData {
	path: LatLng[];
	frames: HyperlapseFrameMeta[];
	activeIndex?: number;
}

function downsamplePath(path: LatLng[], max = 500): LatLng[] {
	if (path.length <= max) return path;
	const out: LatLng[] = [];
	const step = (path.length - 1) / (max - 1);
	for (let i = 0; i < max; i++) {
		out.push(path[Math.round(i * step)]);
	}
	return out;
}

/** Draw the sequence path + a capped set of frame markers. */
export function setRouteOverlay(data: RouteOverlayData | null) {
	if (!data || (!data.path.length && !data.frames.length)) {
		clearRouteOverlay();
		return;
	}

	const host = window.MMA.getMapHost();
	if (!host) return;

	if (!overlay) overlay = host.createDeckOverlay();

	const path = downsamplePath(data.path);
	const pathPositions = path.map((p) => [p.lng, p.lat] as [number, number]);

	let frames = data.frames;
	if (frames.length > MAX_MARKERS) {
		const step = (frames.length - 1) / (MAX_MARKERS - 1);
		frames = Array.from({ length: MAX_MARKERS }, (_, i) => frames[Math.round(i * step)]);
	}
	const framePositions = frames.map((f) => [f.lng, f.lat] as [number, number]);
	const active = data.activeIndex ?? -1;

	overlay.setProps({
		layers: [
			new PathLayer({
				id: "hyperlapse-route-path",
				data: pathPositions.length ? [pathPositions] : [],
				getPath: (d: [number, number][]) => d,
				getColor: [66, 133, 244, 220],
				getWidth: 4,
				widthUnits: "pixels",
				pickable: false,
			}),
			new ScatterplotLayer({
				id: "hyperlapse-route-frames",
				data: frames.map((_, i) => ({ i, position: framePositions[i] })),
				getPosition: (d: { position: [number, number] }) => d.position,
				getFillColor: (d: { i: number }) =>
					d.i === active ? [234, 67, 53, 255] : [66, 133, 244, 200],
				getRadius: (d: { i: number }) => (d.i === active ? 7 : 4),
				radiusUnits: "pixels",
				pickable: false,
			}),
		],
	});
}

export function clearRouteOverlay() {
	if (overlay) {
		overlay.finalize();
		overlay = null;
	}
}

/** Mount teardown for plugin activate(). */
export function mountRouteOverlay(): () => void {
	return () => clearRouteOverlay();
}
