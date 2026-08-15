import { google } from "@/lib/sv/opensv";
import {
	buildTileUrl,
	buildStyledTileUrl,
	createRoadmapTileConfig,
	createLegacyTileConfig,
	createLegacyTerrainTileConfig,
	createLabelsTileConfig,
	createSatelliteLabelsTileConfig,
	createSatelliteTileConfig,
	createSvTileConfig,
	createSvBlobbyTileConfig,
	createTerrainBasemapTileConfig,
	createTerrainOverlayTileConfig,
	LEGACY_STYLE_MAP_ID,
	type MapStyle,
} from "@/lib/geo/tiles";
import { BUILTIN_STYLE_MAP } from "@/lib/geo/mapStyles";
import { BLOBBY_ZOOM_THRESHOLD } from "@/lib/sv/constants";
import { createCompositeMapType } from "@/lib/geo/stackedMapType";
import { createpetalBasemapLayer, type petalBasemapLanguage } from "@/lib/geo/petalTiles";
import { createYandexBasemapLayer } from "@/lib/sv/yandex/basemap";
import type { YandexBasemapLanguage } from "@/lib/sv/yandex/endpoints";
import { normalizeYandexBasemapLanguage } from "@/lib/sv/yandex/endpoints";
import { getAltBasemapSettings } from "@/lib/sv/providers/settings";
import { getProviderLineLayers } from "@/lib/sv/providers/coverageLayers";
import type { MapEmbedPrefs } from "@/store/mapEmbedPrefs";

export interface MapStackResult {
	mapType: google.maps.ImageMapType;
	svLayer: google.maps.ImageMapType;
}

export interface CustomStyle {
	name: string;
	style: MapStyle[];
}

export const CUSTOM_STYLES_KEY = "mma_custom_styles";

interface BuildOpts {
	useBlobby?: boolean;
	customStyles?: MapStyle[];
	/** Omit SV + provider coverage raster layers (e.g. GeoGuessr guess map). */
	skipCoverage?: boolean;
}

/** SV coverage tile config for the current prefs; shared by the Google raster stack
 *  and the MapLibre raster overlay. */
export function createSvConfigForPrefs(prefs: MapEmbedPrefs, useBlobby: boolean) {
	const showOfficial = prefs.svCoverageType === "official" || prefs.svCoverageType === "default";
	const showUnofficial =
		prefs.svCoverageType === "unofficial" || prefs.svCoverageType === "default";
	return useBlobby
		? createSvBlobbyTileConfig({
				showOfficial,
				showUnofficial,
				color: prefs.svColor,
			})
		: createSvTileConfig({
				showOfficial,
				showUnofficial,
				color: prefs.svColor,
				thickness: prefs.svThickness,
			});
}

export interface SvTileSource {
	url(x: number, y: number, z: number): string;
	/** Effective opacity of a tile at z. */
	opacity(z: number): number;
	/** Change-detection identity. */
	key: string;
}

/** SV coverage as a per-tile source (MapLibre + upstream tests). */
export function createSvTileSource(prefs: MapEmbedPrefs): SvTileSource {
	const showOfficial = prefs.svCoverageType === "official" || prefs.svCoverageType === "default";
	const showUnofficial =
		prefs.svCoverageType === "unofficial" || prefs.svCoverageType === "default";
	const line = createSvTileConfig({
		showOfficial,
		showUnofficial,
		color: prefs.svColor,
		thickness: prefs.svThickness,
	});
	const blobby = prefs.svBlobby
		? createSvBlobbyTileConfig({ showOfficial, showUnofficial, color: prefs.svColor })
		: null;
	const blobbyAt = (z: number) => blobby !== null && z <= BLOBBY_ZOOM_THRESHOLD;
	const url = (x: number, y: number, z: number) =>
		buildTileUrl(blobbyAt(z) ? blobby! : line, x, y, z);
	const dimmed = prefs.svCoverageType !== "default" ? prefs.svOpacity * 0.6 : prefs.svOpacity;
	return {
		url,
		opacity: (z) => (blobbyAt(z) ? dimmed : prefs.svOpacity),
		key: url(0, 0, 0) + url(0, 0, BLOBBY_ZOOM_THRESHOLD + 1),
	};
}

/** Resolve Petal basemap from shared altBasemapSettings. */
export function resolvepetalBasemap(): {
	enabled: boolean;
	language: petalBasemapLanguage;
} {
	const s = getAltBasemapSettings().petal;
	return {
		enabled: s.enabled,
		language: s.language === "zh" ? "zh" : "en",
	};
}

/** Resolve Yandex basemap from shared altBasemapSettings. */
export function resolveYandexBasemap(): {
	enabled: boolean;
	language: YandexBasemapLanguage;
} {
	const s = getAltBasemapSettings().yandex;
	return {
		enabled: s.enabled,
		language: normalizeYandexBasemapLanguage(s.language),
	};
}

export function buildMapStack(prefs: MapEmbedPrefs, opts: BuildOpts): MapStackResult {
	const petal = resolvepetalBasemap();
	const yandexBm = resolveYandexBasemap();
	const tileSize = new google.maps.Size(256, 256);
	const layers: google.maps.ImageMapType[] = [];
	const legacyMap = prefs.mapStyleName === "legacy" && prefs.mapType === "map";
	const altBasemap = petal.enabled || yandexBm.enabled;

	const extraStyles: MapStyle[] = [];
	const builtinStyles = BUILTIN_STYLE_MAP[prefs.mapStyleName as keyof typeof BUILTIN_STYLE_MAP];
	if (builtinStyles) {
		extraStyles.push(...builtinStyles);
	} else if (opts.customStyles) {
		extraStyles.push(...opts.customStyles);
	}
	if (prefs.boldCountryBorders) {
		const s: Record<string, string | number> = { weight: 2 };
		if (prefs.mapStyleName === "default") s.color = "#000000";
		extraStyles.push({
			featureType: "administrative.country",
			elementType: "geometry.stroke",
			stylers: [s],
		});
	}
	if (prefs.boldSubdivisionBorders) {
		extraStyles.push({
			featureType: "administrative.province",
			elementType: "geometry.stroke",
			stylers: [{ weight: 3 }],
		});
	}
	if (prefs.hideRoadLabels) {
		extraStyles.push({
			featureType: "road",
			elementType: "labels",
			stylers: [{ visibility: "off" }],
		});
	}
	if (prefs.hidePoi) {
		extraStyles.push({ featureType: "poi", stylers: [{ visibility: "off" }] });
	}
	if (prefs.hideTransit) {
		extraStyles.push({ featureType: "transit", stylers: [{ visibility: "off" }] });
	}
	if (prefs.hideHighways) {
		extraStyles.push({
			featureType: "road.highway",
			elementType: "geometry",
			stylers: [{ visibility: "off" }],
		});
	}

	if (petal.enabled && prefs.mapType === "map") {
		layers.push(createpetalBasemapLayer(petal.language));
	} else if (yandexBm.enabled && prefs.mapType === "map") {
		layers.push(createYandexBasemapLayer(yandexBm.language));
	} else if (prefs.mapType === "satellite") {
		const cfg = createSatelliteTileConfig();
		layers.push(
			new google.maps.ImageMapType({
				getTileUrl: (coord: TileCoord, zoom: number) => buildTileUrl(cfg, coord.x, coord.y, zoom),
				tileSize,
				minZoom: 0,
				maxZoom: 20,
			}),
		);
		if (prefs.showTerrain) {
			const tcfg = createTerrainOverlayTileConfig();
			layers.push(
				new google.maps.ImageMapType({
					getTileUrl: (coord: TileCoord, zoom: number) =>
						buildTileUrl(tcfg, coord.x, coord.y, zoom),
					tileSize,
					minZoom: 0,
					maxZoom: 20,
				}),
			);
		}
	} else if (prefs.mapType === "osm") {
		layers.push(
			new google.maps.ImageMapType({
				getTileUrl: (coord: TileCoord, zoom: number) =>
					`https://tile.openstreetmap.org/${zoom}/${coord.x}/${coord.y}.png`,
				tileSize,
				minZoom: 0,
				maxZoom: 19,
			}),
		);
	} else {
		if (prefs.showTerrain) {
			if (legacyMap) {
				const cfg = createLegacyTerrainTileConfig();
				layers.push(
					new google.maps.ImageMapType({
						getTileUrl: (coord: TileCoord, zoom: number) =>
							buildStyledTileUrl(cfg, LEGACY_STYLE_MAP_ID, coord.x, coord.y, zoom),
						tileSize,
						minZoom: 0,
						maxZoom: 20,
					}),
				);
			} else {
				const cfg = createTerrainBasemapTileConfig([
					{ elementType: "labels", stylers: [{ visibility: "off" }] },
					{
						elementType: "geometry.stroke",
						featureType: "administrative",
						stylers: [{ visibility: "off" }],
					},
					...extraStyles,
				]);
				layers.push(
					new google.maps.ImageMapType({
						getTileUrl: (coord: TileCoord, zoom: number) =>
							buildTileUrl(cfg, coord.x, coord.y, zoom),
						tileSize,
						minZoom: 0,
						maxZoom: 20,
					}),
				);
			}
		} else if (legacyMap) {
			const cfg = createLegacyTileConfig(extraStyles);
			layers.push(
				new google.maps.ImageMapType({
					getTileUrl: (coord: TileCoord, zoom: number) =>
						buildStyledTileUrl(cfg, LEGACY_STYLE_MAP_ID, coord.x, coord.y, zoom),
					tileSize,
					minZoom: 0,
					maxZoom: 20,
				}),
			);
		} else {
			const cfg = createRoadmapTileConfig(extraStyles);
			layers.push(
				new google.maps.ImageMapType({
					getTileUrl: (coord: TileCoord, zoom: number) => buildTileUrl(cfg, coord.x, coord.y, zoom),
					tileSize,
					minZoom: 0,
					maxZoom: 20,
				}),
			);
		}
	}

	// Google stack: one ImageMapType + setOpacity (MapEmbed drives blobby via useBlobby).
	// Per-tile createSvTileSource stays for MapLibre/tests — do not mix with setOpacity.
	const showOfficial = prefs.svCoverageType === "official" || prefs.svCoverageType === "default";
	const showUnofficial =
		prefs.svCoverageType === "unofficial" || prefs.svCoverageType === "default";
	const svCfg = createSvConfigForPrefs(prefs, opts.useBlobby ?? false);
	const svLayer = new google.maps.ImageMapType({
		getTileUrl: (coord: TileCoord, zoom: number) => buildTileUrl(svCfg, coord.x, coord.y, zoom),
		tileSize,
		minZoom: 0,
		maxZoom: 20,
	});
	const blobbySingleType = (opts.useBlobby ?? false) && !(showOfficial && showUnofficial);
	svLayer.setOpacity(blobbySingleType ? prefs.svOpacity * 0.6 : prefs.svOpacity);
	if (!opts.skipCoverage) {
		if (prefs.showSvCoverage !== false) layers.push(svLayer);
		layers.push(...getProviderLineLayers());
	}

	if (prefs.showLabels && prefs.mapType !== "osm" && !altBasemap) {
		const labelCfg =
			prefs.mapType === "satellite"
				? createSatelliteLabelsTileConfig(extraStyles)
				: createLabelsTileConfig(extraStyles);
		layers.push(
			new google.maps.ImageMapType({
				getTileUrl: (coord: TileCoord, zoom: number) =>
					buildTileUrl(labelCfg, coord.x, coord.y, zoom),
				tileSize,
				minZoom: 0,
				maxZoom: 20,
			}),
		);
	}

	return { mapType: createCompositeMapType(layers), svLayer };
}

export function resolveStackForPrefs(
	prefs: MapEmbedPrefs,
	opts: { useBlobby: boolean; customStyles: CustomStyle[]; skipCoverage?: boolean },
): MapStackResult {
	const custom = opts.customStyles.find((s) => s.name === prefs.mapStyleName);
	return buildMapStack(prefs, {
		useBlobby: opts.useBlobby,
		customStyles: custom?.style,
		skipCoverage: opts.skipCoverage,
	});
}
