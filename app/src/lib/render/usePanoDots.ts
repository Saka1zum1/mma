import { useEffect, useState } from "react";
import { google } from "@/lib/sv/opensv";
import { boundsToTiles, fetchPanoDots, type PanoDot } from "@/lib/geo/photometa";

// Fetches discrete Street View pano dots for a map's current bounds, refetching on every idle.
// Gated on a minimum zoom, then capped at MAX_TILES: a zoomed-out viewport spans an exploding
// number of zoom-17 tiles, so we bail rather than fire a fetch storm.
const MAX_TILES = 96;

export function usePanoDots(
	map: google.maps.Map | null,
	enabled: boolean,
	minZoom = 13,
): PanoDot[] {
	const [dots, setDots] = useState<PanoDot[]>([]);

	useEffect(() => {
		if (!map || !enabled) {
			setDots([]);
			return;
		}
		let cancelled = false;
		const load = async () => {
			if ((map.getZoom() ?? 0) < minZoom) {
				setDots([]);
				return;
			}
			const bounds = map.getBounds();
			if (!bounds) return;
			const ne = bounds.getNorthEast();
			const sw = bounds.getSouthWest();
			const tiles = boundsToTiles(sw.lng(), sw.lat(), ne.lng(), ne.lat());
			if (tiles.length > MAX_TILES) {
				setDots([]);
				return;
			}
			const results = await Promise.all(tiles.map(fetchPanoDots));
			if (!cancelled) setDots(results.flat());
		};
		load();
		const listener = map.addListener("idle", load);
		return () => {
			cancelled = true;
			if (google?.maps) google.maps.event.removeListener(listener);
		};
	}, [map, enabled, minZoom]);

	return dots;
}
