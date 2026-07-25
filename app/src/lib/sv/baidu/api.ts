import { BAIDU_META_URL, BAIDU_SEARCH_URL } from "./endpoints";
import { baiduCmToMap, mapToBaiduMeters } from "./crs";
import { supportsBaiduAt } from "./chinaPolygon";
import { stripBaidu } from "./prefix";

export interface BaiduLink {
	pid: string;
	lng: number;
	lat: number;
	heading: number;
	/** Road name when the link came from Roads[]. */
	description?: string;
}

export interface BaiduTimeEntry {
	id: string;
	year: number;
	month: number;
	/** True when Baidu marks this TimeLine row as the live capture. */
	isCurrent?: boolean;
}

export interface BaiduPanoMeta {
	id: string;
	lng: number;
	lat: number;
	heading: number;
	pitch: number;
	roll: number;
	/** YYYYMMDD */
	date: string;
	/** Camera altitude in metres (from sdata `Z`, already metres). */
	altitude: number | null;
	/** Rname — road name for Street View description only (not uploader). */
	roadName: string | null;
	/** Navigable links for arrows (Links[] via DIR, plus same-road Order±1). */
	links: BaiduLink[];
	/**
	 * All nearby captures for clickToGo target overlays
	 * (altproviders: every Links[] + every Roads[].Panos).
	 */
	neighbors: BaiduLink[];
	timeline: BaiduTimeEntry[];
}

interface SdataPanoLink {
	PID: string;
	X: number;
	Y: number;
	/** Link bearing in degrees (preferred over geometric heading when present). */
	DIR?: number;
}

interface SdataPanoRoadPano {
	PID: string;
	X: number;
	Y: number;
	Order?: number;
	DIR?: number;
}

interface SdataPano {
	ID: string;
	X: number;
	Y: number;
	/** Camera height in metres. */
	Z?: number;
	Heading?: number;
	Pitch?: number;
	Roll?: number;
	Date?: string;
	Rname?: string;
	Links?: SdataPanoLink[];
	Roads: { Name: string; 	IsCurrent: number; Panos?: SdataPanoRoadPano[] }[];
	TimeLine?: { ID: string; Year: string; TimeLine: string; IsCurrent?: number }[];
}

const metaCache = new Map<string, BaiduPanoMeta>();
const metaInflight = new Map<string, Promise<BaiduPanoMeta | null>>();
/** Fallback only when caller omits radius (map-click / SIS always pass one). */
const DEFAULT_SEARCH_RADIUS_M = 50;

function bearingDeg(
	fromLng: number,
	fromLat: number,
	toLng: number,
	toLat: number,
): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const φ1 = toRad(fromLat);
	const φ2 = toRad(toLat);
	const Δλ = toRad(toLng - fromLng);
	const y = Math.sin(Δλ) * Math.cos(φ2);
	const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
	return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function haversineM(lng1: number, lat1: number, lng2: number, lat2: number): number {
	const R = 6371000;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function headingDelta(a: number, b: number): number {
	let d = Math.abs(a - b) % 360;
	if (d > 180) d = 360 - d;
	return d;
}

export { headingDelta, haversineM, bearingDeg };

/**
 * Pick the navigable link whose bearing best matches `heading`, within
 * `maxDelta` degrees. Used when a 100m jump still snaps to the current pano.
 */
export function pickBaiduLinkToward(
	links: BaiduLink[],
	heading: number,
	maxDelta = 70,
): BaiduLink | null {
	let best: BaiduLink | null = null;
	let bestDelta = maxDelta;
	for (const link of links) {
		if (!link.pid) continue;
		const d = headingDelta(link.heading, heading);
		if (d < bestDelta) {
			bestDelta = d;
			best = link;
		}
	}
	return best;
}

/** Destination point ~`distM` metres from (lat,lng) along `headingDeg` (GCJ-02 / short hops). */
export function offsetLatLng(
	lat: number,
	lng: number,
	headingDeg: number,
	distM: number,
): { lat: number; lng: number } {
	const R = 6371000;
	const δ = distM / R;
	const θ = (headingDeg * Math.PI) / 180;
	const φ1 = (lat * Math.PI) / 180;
	const λ1 = (lng * Math.PI) / 180;
	const φ2 = Math.asin(
		Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
	);
	const λ2 =
		λ1 +
		Math.atan2(
			Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
			Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
		);
	return {
		lat: (φ2 * 180) / Math.PI,
		lng: ((((λ2 * 180) / Math.PI + 540) % 360) - 180),
	};
}

function linkFromPano(
	fromLng: number,
	fromLat: number,
	p: SdataPanoRoadPano | SdataPanoLink,
	description?: string,
	headingOverride?: number,
): BaiduLink {
	const pos = baiduCmToMap(p.X, p.Y);
	const heading =
		headingOverride != null && Number.isFinite(headingOverride)
			? ((headingOverride % 360) + 360) % 360
			: bearingDeg(fromLng, fromLat, pos.lng, pos.lat);
	return {
		pid: p.PID,
		lng: pos.lng,
		lat: pos.lat,
		heading,
		...(description ? { description } : {}),
	};
}

function selectNavigableLinks(baidu: SdataPano, lng: number, lat: number): BaiduLink[] {
	const links: BaiduLink[] = [];
	const seen = new Set<string>();

	for (const raw of baidu.Links ?? []) {
		if (!raw?.PID || seen.has(raw.PID)) continue;
		seen.add(raw.PID);
		const dir = typeof raw.DIR === "number" ? raw.DIR : undefined;
		links.push(linkFromPano(lng, lat, raw, baidu.Rname, dir));
	}

	const road = (baidu.Roads ?? []).find((r) => r.IsCurrent === 1);
	const panos = road?.Panos;
	if (panos?.length) {
		const self = panos.find((p) => p?.PID === baidu.ID);
		const selfOrder = self?.Order;
		if (typeof selfOrder === "number" && Number.isFinite(selfOrder)) {
			for (const targetOrder of [selfOrder - 1, selfOrder + 1]) {
				const neighbor = panos.find(
					(p) => p?.PID && p.PID !== baidu.ID && p.Order === targetOrder,
				);
				if (!neighbor?.PID || seen.has(neighbor.PID)) continue;
				const pos = baiduCmToMap(neighbor.X, neighbor.Y);
				if (pos.lat === lat && pos.lng === lng) continue;
				seen.add(neighbor.PID);
				const heading = bearingDeg(lng, lat, pos.lng, pos.lat);
				links.push(linkFromPano(lng, lat, neighbor, road?.Name, heading));
			}
		}

	}

	return links;
}

/** Every Links[] + Roads[].Panos — clickToGo targets (not just arrow links). */
function collectNeighbors(baidu: SdataPano, lng: number, lat: number): BaiduLink[] {
	const out: BaiduLink[] = [];
	const seen = new Set<string>();

	for (const raw of baidu.Links ?? []) {
		if (!raw?.PID || seen.has(raw.PID)) continue;
		seen.add(raw.PID);
		out.push(linkFromPano(lng, lat, raw));
	}

	for (const road of baidu.Roads ?? []) {
		if (!road.Panos?.length) continue;
		const roadName = road.Name || undefined;
		for (const p of road.Panos) {
			if (!p?.PID || p.PID === baidu.ID || seen.has(p.PID)) continue;
			const pos = baiduCmToMap(p.X, p.Y);
			if (pos.lat === lat && pos.lng === lng) continue;
			seen.add(p.PID);
			out.push(linkFromPano(lng, lat, p, roadName));
		}
	}

	return out;
}

/**
 * Parse Baidu sdata: all neighbors (clickToGo) + navigable links + TimeLine.
 */
function parseSdata(baidu: SdataPano): BaiduPanoMeta {
	const { lng, lat } = baiduCmToMap(baidu.X, baidu.Y);
	const neighbors = collectNeighbors(baidu, lng, lat);
	const links = selectNavigableLinks(baidu, lng, lat);

	const timeline: BaiduTimeEntry[] = (baidu.TimeLine ?? [])
		.filter((t) => t?.ID)
		.map((t) => ({
			id: String(t.ID),
			year: Number(t.Year) || Number(String(t.TimeLine).slice(0, 4)) || 0,
			month: Number(String(t.TimeLine).slice(4)) || 1,
			isCurrent: t.IsCurrent === 1,
		}))
		.filter((t) => t.year > 0);

	return {
		id: baidu.ID,
		lng,
		lat,
		heading: baidu.Heading ?? 0,
		pitch: baidu.Pitch ?? 0,
		roll: baidu.Roll ?? 0,
		date: baidu.Date ?? "",
		altitude: Number.isFinite(baidu.Z) ? (baidu.Z as number) : null,
		roadName: baidu.Rname ?? null,
		links,
		neighbors,
		timeline,
	};
}

export async function fetchBaiduMeta(sid: string): Promise<BaiduPanoMeta | null> {
	const id = stripBaidu(sid);
	if (!id) return null;
	const hit = metaCache.get(id);
	if (hit) return hit;
	const pending = metaInflight.get(id);
	if (pending) return pending;

	const work = (async (): Promise<BaiduPanoMeta | null> => {
		const url = new URL(BAIDU_META_URL);
		url.searchParams.set("sid", id);
		const res = await fetch(url.href, { signal: AbortSignal.timeout(15_000) });
		if (!res.ok) return null;
		const data = (await res.json()) as { content?: SdataPano[] };
		const raw = data.content?.[0];
		if (!raw?.ID) return null;
		const meta = parseSdata(raw);
		metaCache.set(id, meta);
		return meta;
	})().finally(() => {
		metaInflight.delete(id);
	});

	metaInflight.set(id, work);
	return work;
}

/** Nearest pano id near map lat/lng, or null. */
export async function searchBaiduPano(
	lat: number,
	lng: number,
	radiusM: number = DEFAULT_SEARCH_RADIUS_M,
): Promise<string | null> {
	if (!supportsBaiduAt(lng, lat)) return null;
	const r =
		Number.isFinite(radiusM) && radiusM > 0 ? radiusM : DEFAULT_SEARCH_RADIUS_M;
	const { x, y } = mapToBaiduMeters(lng, lat);
	const url = new URL(BAIDU_SEARCH_URL);
	url.searchParams.set("x", String(x));
	url.searchParams.set("y", String(y));
	url.searchParams.set("r", String(r));
	const res = await fetch(url.href, { signal: AbortSignal.timeout(15_000) });
	if (!res.ok) return null;
	const data = (await res.json()) as { content?: { id?: string } };
	return data.content?.id ?? null;
}

export async function resolveBaiduNear(
	lat: number,
	lng: number,
	radiusM: number = DEFAULT_SEARCH_RADIUS_M,
): Promise<BaiduPanoMeta | null> {
	const id = await searchBaiduPano(lat, lng, radiusM);
	if (!id) return null;
	return fetchBaiduMeta(id);
}

export function getCachedBaiduMeta(sid: string): BaiduPanoMeta | null {
	return metaCache.get(stripBaidu(sid)) ?? null;
}

export function clearBaiduMetaCache(): void {
	metaCache.clear();
	metaInflight.clear();
}
