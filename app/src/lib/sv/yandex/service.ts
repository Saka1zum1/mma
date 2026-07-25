/**
 * Yandex Street View service helpers shared by PSV session / download / UI.
 * Tile compositing for opensv inject has been removed — rendering is PSV-owned.
 */
import type { YandexLink, YandexPanoMeta } from "./api";
import { prefixYandex, stripYandex } from "./prefix";
import type { PanoDateEntry } from "@/lib/sv/panoProvider";
import { clearYandexStitchCache } from "./psv/stitch";

const locationByPano = new Map<string, { lat: number; lng: number }>();

export function rememberYandexMeta(meta: YandexPanoMeta): void {
	locationByPano.set(meta.id, { lat: meta.lat, lng: meta.lng });
	for (const n of meta.neighbors) {
		if (!locationByPano.has(n.oid)) {
			locationByPano.set(n.oid, { lat: n.lat, lng: n.lng });
		}
	}
}

export function getCachedYandexLocation(
	oid: string,
): { lat: number; lng: number } | null {
	return locationByPano.get(stripYandex(oid)) ?? null;
}

export function streetViewLinksFromMeta(links: YandexLink[]): google.maps.StreetViewLink[] {
	return links
		.filter((l) => l.oid)
		.map((l) => ({
			pano: prefixYandex(l.oid),
			heading: Number.isFinite(l.heading) ? l.heading : 0,
			description: l.description ?? "",
		}));
}

export function yandexTimelineEntries(anchor: YandexPanoMeta): PanoDateEntry[] {
	const byPano = new Map<string, PanoDateEntry>();
	const add = (oid: string, ts: number) => {
		if (!byPano.has(oid)) {
			byPano.set(oid, {
				pano: oid,
				timestamp: ts,
				cameraType: "yandex",
			});
		}
	};
	add(anchor.id, anchor.captureDate.getTime());
	for (const t of anchor.timeline) {
		add(t.oid, t.timestamp * 1000);
	}
	return [...byPano.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function clearYandexServiceCaches(): void {
	locationByPano.clear();
	clearYandexStitchCache();
}
