import { useEffect, useState } from "react";
import { google } from "@/lib/sv/opensv";
import { boundsToTiles, fetchPanoDots, type PanoDot } from "@/lib/geo/photometa";

// Fetches discrete Street View pano dots for a map's current bounds, refetching on every idle.
// Gated on a minimum zoom (dots are too dense to be useful zoomed out).
export function usePanoDots(
	map: google.maps.Map | null,
	enabled: boolean,
	minZoom = 15,
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
