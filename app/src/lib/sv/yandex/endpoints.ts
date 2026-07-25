/** Yandex Street View public endpoints (no API key). */

export const YANDEX_SEARCH_URL =
	"https://api-maps.yandex.com/services/panoramas/1.x/?l={endpoint}&lang=en_US&origin=userAction&provider=streetview";
export const YANDEX_META_URL =
	"https://api-maps.yandex.com/services/panoramas/1.x/?l=stv&lang=en_US&origin=userAction&provider=streetview";
export const YANDEX_TILE_BASE = "https://pano.maps.yandex.net";
export const YANDEX_SHARE_BASE = "https://yandex.com/maps/";

export const YANDEX_MAPS_VERSION =
	"26.07.20";

/** scale=1 → 256px tiles matching ImageMapType.tileSize (scale=2 was 512px / 4× decode cost). */
export const YANDEX_COVERAGE_TILE =
	`https://core-stv-renderer.maps.yandex.net/2.x/tiles?l=stv&x={x}&y={y}&z={z}&scale=1&v=${YANDEX_MAPS_VERSION}&projection=web_mercator`;


export const YANDEX_BASEMAP_LANGUAGES = [
	"ru_RU",
	"en_RU",
	"en_US",
	"uk_UA",
	"ru_UA",
	"tr_TR",
] as const;

export type YandexBasemapLanguage = (typeof YANDEX_BASEMAP_LANGUAGES)[number];

export function normalizeYandexBasemapLanguage(lang: string): YandexBasemapLanguage {
	return (YANDEX_BASEMAP_LANGUAGES as readonly string[]).includes(lang)
		? (lang as YandexBasemapLanguage)
		: "ru_RU";
}

export function yandexMetaUrl(oid: string): string {
	const url = new URL(YANDEX_META_URL);
	url.searchParams.set("oid", oid);
	return url.href;
}

export function yandexSearchUrl(endpoint: "stv" | "sta", lng: number, lat: number): string {
	const url = new URL(YANDEX_SEARCH_URL.replace("{endpoint}", endpoint));
	url.searchParams.set("ll", `${lng},${lat}`);
	return url.href;
}

/** Native Yandex pano tile: `{imageId}/{level}.{x}.{y}` (256×256; level 0 = full res). */
export function yandexPanoTileUrl(imageId: string, level: number, x: number, y: number): string {
	return `${YANDEX_TILE_BASE}/${imageId}/${level}.${x}.${y}`;
}

export function yandexCoverageTileUrl(x: number, y: number, z: number): string {
	return YANDEX_COVERAGE_TILE.replace("{x}", String(x))
		.replace("{y}", String(y))
		.replace("{z}", String(z));
}

export function yandexBasemapTileUrl(
	x: number,
	y: number,
	z: number,
	lang: YandexBasemapLanguage = "ru_RU",
): string {
	return (
		`https://core-renderer-tiles.maps.yandex.net/tiles?l=map` +
		`&v=${YANDEX_MAPS_VERSION}&x=${x}&y=${y}&z=${z}&scale=2.0&lang=${lang}` +
		`&projection=web_mercator&maptype=map`
	);
}

export function yandexShareUrl(
	panoId: string,
	lat: number,
	lng: number,
	heading = 0,
): string {
	const url = new URL(YANDEX_SHARE_BASE);
	url.searchParams.set("l", "stv,sta");
	url.searchParams.set("ll", `${lat},${lng}`);
	url.searchParams.set("panorama[point]", `${lat},${lng}`);
	url.searchParams.set("panorama[direction]", `${Math.round(heading)},0`);
	url.searchParams.set("panorama[full]", "true");
	url.searchParams.set("panorama[id]", panoId);
	return url.href;
}
