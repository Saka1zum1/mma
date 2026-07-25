import { yandexShareUrl } from "./endpoints";
import { stripYandex } from "./prefix";

export function buildYandexShareUrl(
	oid: string,
	lat: number,
	lng: number,
	heading = 0,
): string {
	return yandexShareUrl(stripYandex(oid), lat, lng, heading);
}

function parseNum(raw: string | null | undefined, fallback = 0): number {
	if (raw == null || raw === "") return fallback;
	const n = parseFloat(raw);
	return Number.isFinite(n) ? n : fallback;
}

export function isYandexShareHost(hostname: string): boolean {
	return (
		hostname === "yandex.com" ||
		hostname === "yandex.ru" ||
		hostname.endsWith(".yandex.com") ||
		hostname.endsWith(".yandex.ru")
	);
}

export type ParsedYandexShareUrl = {
	panoId: string | null;
	lat: number | null;
	lng: number | null;
	heading: number;
	pitch: number;
};

/** Parse yandex.com/maps share URLs with panorama[id] / panorama[point]. */
export function parseYandexShareUrl(url: URL): ParsedYandexShareUrl | null {
	if (!isYandexShareHost(url.hostname)) return null;
	if (!url.pathname.includes("/maps")) return null;

	const pano =
		url.searchParams.get("panorama[id]") ||
		url.searchParams.get("panorama%5Bid%5D") ||
		null;

	// Hash form: #panoid=…&heading=…
	const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
	const hashParams = hash ? new URLSearchParams(hash) : null;
	const hashPano = hashParams?.get("panoid") ?? null;
	const panoId = pano || hashPano;
	if (!panoId) return null;

	const point =
		url.searchParams.get("panorama[point]") ||
		url.searchParams.get("panorama%5Bpoint%5D");
	let lat: number | null = null;
	let lng: number | null = null;
	if (point) {
		const parts = point.split(",");
		lat = parseNum(parts[0], NaN);
		lng = parseNum(parts[1], NaN);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
			lat = null;
			lng = null;
		}
	}
	if (lat == null) {
		const ll = url.searchParams.get("ll");
		if (ll) {
			const parts = ll.split(",");
			// Share URL uses ll=lat,lng (altproviders translatePanoUrl).
			lat = parseNum(parts[0], NaN);
			lng = parseNum(parts[1], NaN);
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
				lat = null;
				lng = null;
			}
		}
	}

	const dir =
		url.searchParams.get("panorama[direction]") ||
		url.searchParams.get("panorama%5Bdirection%5D");
	let heading = 0;
	let pitch = 0;
	if (dir) {
		const parts = dir.split(",");
		heading = parseNum(parts[0]);
		pitch = parseNum(parts[1]);
	} else if (hashParams) {
		heading = parseNum(hashParams.get("heading"));
		pitch = parseNum(hashParams.get("pitch"));
	}

	return {
		panoId: stripYandex(panoId),
		lat,
		lng,
		heading,
		pitch,
	};
}
