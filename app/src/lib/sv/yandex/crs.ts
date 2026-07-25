/**
 * EPSG:3395 (World Mercator) tile math for Yandex coverage — altproviders.js parity.
 * Google map tiles are Web Mercator; we remap via WGS84 ↔ EPSG:3395.
 */

const HALF_EXTENT = 20037508.342789244;
const A = 6378137;
/** WGS84 first eccentricity. */
const E = 0.08181919084262157;

export const YANDEX_RESOLUTIONS = [
	156543.03392804097, 78271.51696402048, 39135.75848201024, 19567.87924100512,
	9783.93962050256, 4891.96981025128, 2445.98490512564, 1222.99245256282, 611.49622628141,
	305.748113140705, 152.8740565703525, 76.43702828517625, 38.21851414258813,
	19.109257071294063, 9.554628535647032, 4.777314267823516, 2.388657133911758,
	1.194328566955879, 0.5971642834779395, 0.29858214173896974,
	0.14929107086948487, 0.07464553543474244,
] as const;

/** WGS84 → EPSG:3395 metres. */
export function lngLatToEpsg3395(lng: number, lat: number): { x: number; y: number } {
	const latRad = (Math.max(-89.5, Math.min(89.5, lat)) * Math.PI) / 180;
	const lngRad = (lng * Math.PI) / 180;
	const x = A * lngRad;
	const sinLat = Math.sin(latRad);
	const y =
		(A / 2) *
		Math.log(
			((1 + sinLat) / (1 - sinLat)) *
				Math.pow((1 - E * sinLat) / (1 + E * sinLat), E),
		);
	return { x, y };
}

/** Google Web Mercator tile → approximate WGS84 (altproviders tileToGeo). */
export function googleTileToLngLat(
	tileX: number,
	tileY: number,
	zoom: number,
): { lng: number; lat: number } {
	const resolution = YANDEX_RESOLUTIONS[zoom] ?? YANDEX_RESOLUTIONS[YANDEX_RESOLUTIONS.length - 1]!;
	const mx = tileX * resolution * 256 - HALF_EXTENT;
	const my = HALF_EXTENT - tileY * resolution * 256;
	const lng = (mx / HALF_EXTENT) * 180;
	const latRad = Math.PI / 2 - 2 * Math.atan(Math.exp(-my / A));
	return { lng, lat: (latRad * 180) / Math.PI };
}

/** WGS84 → Yandex EPSG:3395 tile indices. */
export function lngLatToYandexTile(
	lat: number,
	lng: number,
	zoom: number,
): { tileX: number; tileY: number } {
	const { x: mx, y: my } = lngLatToEpsg3395(lng, lat);
	const resolution = YANDEX_RESOLUTIONS[zoom] ?? YANDEX_RESOLUTIONS[YANDEX_RESOLUTIONS.length - 1]!;
	const tileX = Math.floor((mx + HALF_EXTENT) / (resolution * 256));
	const tileY = Math.floor((HALF_EXTENT - my) / (resolution * 256));
	return { tileX, tileY };
}
