import { distMeters } from "@/lib/geo/geo";
import { bearingDeg } from "@/lib/sv/baidu/api";
import { yandexMetaUrl, yandexSearchUrl } from "./endpoints";
import { stripYandex } from "./prefix";

export interface YandexLink {
	oid: string;
	lng: number;
	lat: number;
	heading: number;
	description?: string;
}

export interface YandexTimeEntry {
	oid: string;
	year: number;
	month: number;
	day: number;
	timestamp: number;
	lng: number;
	lat: number;
}

export interface YandexZoomSize {
	width: number;
	height: number;
}

export interface YandexPanoMeta {
	id: string;
	imageId: string;
	lng: number;
	lat: number;
	heading: number;
	/**
	 * EquirectangularProjection.Origin[1] in degrees — vertical angle of the
	 * image centre relative to the horizon (Yandex custom-panorama geometry).
	 * Used by PSV panoData to place the cropped strip on the sphere.
	 */
	originPitch: number | null;
	captureDate: Date;
	name: string | null;
	author: string | null;
	worldWidth: number;
	worldHeight: number;
	zoomLevels: number;
	zooms: YandexZoomSize[];
	/** Images.Tiles — native tile pixel size (typically 256×256). */
	tileWidth: number;
	tileHeight: number;
	/** Thoroughfare links — compass arrows / primary jumps. */
	links: YandexLink[];
	/** Graph nodes for clickToGo overlays (prefer same capture year). */
	neighbors: YandexLink[];
	timeline: YandexTimeEntry[];
}

interface YandexApiPayload {
	Data?: {
		panoramaId?: string;
		Point?: { coordinates?: [number, number]; name?: string };
		Images?: {
			imageId?: string;
			Zooms?: { level?: number; width?: number; height?: number }[];
			Tiles?: { width?: number; height?: number };
		};
		EquirectangularProjection?: { Origin?: number[] };
	};
	Annotation?: {
		Thoroughfares?: {
			Direction?: number[];
			Connection?: { href?: string; name?: string; oid?: string };
		}[];
		Graph?: { Nodes?: { panoid?: string; lon?: number; lat?: number }[] };
		HistoricalPanoramas?: {
			Connection?: {
				oid?: string;
				Point?: { coordinates?: [number, number] };
			};
		}[];
	};
	Author?: { name?: string };
}

const metaCache = new Map<string, YandexPanoMeta>();
const metaInflight = new Map<string, Promise<YandexPanoMeta | null>>();
const imageIdCache = new Map<string, string>();

/** Parse capture Unix seconds from trailing `_timestamp` on Yandex pano ids. */
export function parseYandexDateFromOid(oid: string): Date {
	const raw = stripYandex(oid);
	const ts = Number(raw.split("_").pop());
	if (Number.isFinite(ts) && ts > 1e8) return new Date(ts * 1000);
	return new Date(0);
}

function oidFromHref(href: string | undefined): string | null {
	if (!href) return null;
	try {
		return new URL(href, "https://yandex.com").searchParams.get("oid");
	} catch {
		return null;
	}
}

function parsePayload(yandex: YandexApiPayload): YandexPanoMeta | null {
	const data = yandex.Data;
	if (!data?.panoramaId || !data.Point?.coordinates || !data.Images?.imageId) return null;
	const [lng, lat] = data.Point.coordinates;
	if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

	const id = data.panoramaId;
	const imageId = data.Images.imageId;
	const zooms = (data.Images.Zooms ?? [])
		.map((z) => ({
			width: Number(z.width) || 0,
			height: Number(z.height) || 0,
		}))
		.filter((z) => z.width > 0 && z.height > 0);
	const primary = zooms[0];
	if (!primary) return null;
	const tileWidth = Math.max(1, Number(data.Images.Tiles?.width) || 256);
	const tileHeight = Math.max(1, Number(data.Images.Tiles?.height) || 256);
	const origin0 = Number(data.EquirectangularProjection?.Origin?.[0]) || 0;
	const origin1 = Number(data.EquirectangularProjection?.Origin?.[1]);
	const heading = (((origin0 + 180) % 360) + 360) % 360;
	const originPitch = Number.isFinite(origin1) ? origin1 : null;
	const captureDate = parseYandexDateFromOid(id);

	const graphNodes = yandex.Annotation?.Graph?.Nodes ?? [];
	const links: YandexLink[] = [];

	for (const tf of yandex.Annotation?.Thoroughfares ?? []) {
		// API may expose oid directly and/or only in Connection.href ?oid=.
		const oid = tf.Connection?.oid || oidFromHref(tf.Connection?.href);
		if (!oid || oid === id) continue;
		const node = graphNodes.find((n) => n.panoid === oid);
		let heading: number;
		const nodeLng = node?.lon;
		const nodeLat = node?.lat;
		if (nodeLng != null && nodeLat != null && Number.isFinite(nodeLng) && Number.isFinite(nodeLat)) {
			// Prefer geographic bearing when Graph has coordinates (opensv parity).
			heading = bearingDeg(lng, lat, nodeLng, nodeLat);
		} else {
			const dir = Number(tf.Direction?.[0]);
			if (!Number.isFinite(dir)) continue;
			// Yandex Direction[0] is 180°-offset from compass heading.
			heading = ((dir - 180) % 360 + 360) % 360;
		}
		const hasNode =
			nodeLng != null && nodeLat != null && Number.isFinite(nodeLng) && Number.isFinite(nodeLat);
		links.push({
			oid,
			// Keep real Graph coords when present; otherwise leave at ref so the
			// viewer can project a virtual jump target along `heading`.
			lng: hasNode ? nodeLng! : lng,
			lat: hasNode ? nodeLat! : lat,
			heading,
			description: tf.Connection?.name || undefined,
		});
	}
	const timeline: YandexTimeEntry[] = [];
	for (const hist of yandex.Annotation?.HistoricalPanoramas ?? []) {
		const oid = hist.Connection?.oid;
		if (!oid) continue;
		const coords = hist.Connection?.Point?.coordinates;
		const hLng = coords?.[0] ?? lng;
		const hLat = coords?.[1] ?? lat;
		const d = parseYandexDateFromOid(oid);
		timeline.push({
			oid,
			year: d.getFullYear(),
			month: d.getMonth(),
			day: d.getDate(),
			timestamp: Math.floor(d.getTime() / 1000),
			lng: hLng,
			lat: hLat,
		});
	}

	return {
		id,
		imageId,
		lng,
		lat,
		heading,
		originPitch,
		captureDate,
		name: data.Point.name ?? null,
		author: yandex.Author?.name ?? null,
		worldWidth: primary.width,
		worldHeight: primary.height,
		zoomLevels: zooms.length,
		zooms,
		tileWidth,
		tileHeight,
		links,
		neighbors: (() => {
			const geoNodes = graphNodes.filter(
				(n) => n.panoid && Number.isFinite(n.lon) && Number.isFinite(n.lat),
			);
			const captureYear = captureDate.getFullYear();
			const sameYear = geoNodes.filter(
				(n) => parseYandexDateFromOid(n.panoid!).getFullYear() === captureYear,
			);
			// If no neighbor shares the capture year, keep the full Graph set.
			const nodes = sameYear.length > 0 ? sameYear : geoNodes;
			return nodes.map((n) => ({
				oid: n.panoid!,
				lng: n.lon!,
				lat: n.lat!,
				heading: bearingDeg(lng, lat, n.lon!, n.lat!),
			}));
		})(),
		timeline,
	};
}

export async function fetchYandexMeta(oid: string): Promise<YandexPanoMeta | null> {
	const id = stripYandex(oid);
	if (!id) return null;
	const hit = metaCache.get(id);
	if (hit) return hit;
	const pending = metaInflight.get(id);
	if (pending) return pending;

	const work = (async (): Promise<YandexPanoMeta | null> => {
		const res = await fetch(yandexMetaUrl(id), { signal: AbortSignal.timeout(15_000) });
		if (!res.ok) return null;
		const json = (await res.json()) as { data?: YandexApiPayload };
		if (!json.data) return null;
		const meta = parsePayload(json.data);
		if (!meta) return null;
		metaCache.set(id, meta);
		imageIdCache.set(id, meta.imageId);
		return meta;
	})().finally(() => {
		metaInflight.delete(id);
	});

	metaInflight.set(id, work);
	return work;
}

function withinRadius(
	lat: number,
	lng: number,
	meta: YandexPanoMeta,
	radiusM?: number,
): boolean {
	if (radiusM == null || !(radiusM > 0)) return true;
	return distMeters({ lat, lng }, { lat: meta.lat, lng: meta.lng }) <= radiusM;
}

export async function resolveYandexNear(
	lat: number,
	lng: number,
	radiusM?: number,
): Promise<YandexPanoMeta | null> {
	const stvUrl = yandexSearchUrl("stv", lng, lat);
	const staUrl = yandexSearchUrl("sta", lng, lat);
	try {
		const [stvRes, staRes] = await Promise.all([
			fetch(stvUrl, { signal: AbortSignal.timeout(15_000) }),
			fetch(staUrl, { signal: AbortSignal.timeout(15_000) }),
		]);
		const stvJson = stvRes.ok ? ((await stvRes.json()) as { data?: YandexApiPayload }) : null;
		const staJson = staRes.ok ? ((await staRes.json()) as { data?: YandexApiPayload }) : null;
		const payload = staJson?.data?.Data ? staJson.data : stvJson?.data;
		if (!payload?.Data?.panoramaId) return null;
		const parsed = parsePayload(payload);
		if (parsed) {
			if (!withinRadius(lat, lng, parsed, radiusM)) return null;
			metaCache.set(parsed.id, parsed);
			imageIdCache.set(parsed.id, parsed.imageId);
			return parsed;
		}
		const meta = await fetchYandexMeta(payload.Data.panoramaId);
		if (!meta || !withinRadius(lat, lng, meta, radiusM)) return null;
		return meta;
	} catch {
		return null;
	}
}

export async function getImageIdForPano(oid: string): Promise<string | null> {
	const id = stripYandex(oid);
	const cached = imageIdCache.get(id);
	if (cached) return cached;
	const meta = await fetchYandexMeta(id);
	return meta?.imageId ?? null;
}

export function getCachedYandexMeta(oid: string): YandexPanoMeta | null {
	return metaCache.get(stripYandex(oid)) ?? null;
}

export function clearYandexMetaCache(): void {
	metaCache.clear();
	metaInflight.clear();
	imageIdCache.clear();
}

/** Geographic gate — Yandex coverage is global enough that we always allow SIS. */
export function supportsYandexAt(_lng: number, _lat: number): boolean {
	return true;
}
