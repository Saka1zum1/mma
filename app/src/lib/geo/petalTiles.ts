import { google } from "@/lib/sv/opensv";

const PETAL_TILE_VERSION = "26.02.03.16";
/** Pre-encoded key from Petal tile service. */
const PETAL_TILE_KEY =
	"DAEDANitav6P7Q0lWzCzKkLErbrJG4kS1u%2FCpEe5ZyxW5u0nSkb40bJ%2BYAugRN03fhf0BszLS1rCrzAogRHDZkxaMrloaHPQGO6LNg==";

export type petalBasemapLanguage = "en" | "zh";

export function petalTileUrl(
	x: number,
	y: number,
	z: number,
	language: petalBasemapLanguage = "en",
): string {
	return `https://maprastertile-drcn.dbankcdn.cn/display-service/v1/online-render/getTile/${PETAL_TILE_VERSION}/${z}/${x}/${y}/?language=${language}&p=46&scale=2&mapType=ROADMAP&presetStyleId=standard&pattern=JPG&key=${PETAL_TILE_KEY}`;
}

export function createpetalBasemapLayer(
	language: petalBasemapLanguage,
): google.maps.ImageMapType {
	return new google.maps.ImageMapType({
		name: "Petal basemap",
		alt: "Petal map",
		getTileUrl: (coord, zoom) => petalTileUrl(coord.x, coord.y, zoom, language),
		tileSize: new google.maps.Size(256, 256),
		minZoom: 0,
		maxZoom: 20,
	});
}
