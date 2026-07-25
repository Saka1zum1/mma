/**
 * Yandex roadmap basemap — native Web Mercator tiles (`projection=web_mercator`).
 */
import { google } from "@/lib/sv/opensv";
import {
	type YandexBasemapLanguage,
	yandexBasemapTileUrl,
} from "./endpoints";

export function createYandexBasemapLayer(
	language: YandexBasemapLanguage,
): google.maps.ImageMapType {
	return new google.maps.ImageMapType({
		name: "Yandex basemap",
		alt: "Yandex map",
		minZoom: 0,
		maxZoom: 21,
		tileSize: new google.maps.Size(256, 256),
		getTileUrl: (coord, zoom) => {
			if (!coord) return "";
			const numTiles = 1 << zoom;
			const x = ((coord.x % numTiles) + numTiles) % numTiles;
			if (coord.y < 0 || coord.y >= numTiles) return "";
			return yandexBasemapTileUrl(x, coord.y, zoom, language);
		},
	});
}
