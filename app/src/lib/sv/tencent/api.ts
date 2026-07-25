import { TENCENT_META_URL, TENCENT_SEARCH_URL } from "./endpoints";
import { tencentToGcj02 } from "./crs";
import { supportsBaiduAt } from "@/lib/sv/baidu/chinaPolygon";
import { bearingDeg } from "@/lib/sv/baidu/api";
import { stripTencent } from "./prefix";

export { supportsBaiduAt as supportsTencentAt };

/** Nearby capture used for clickToGo target overlays (all_scenes). */
export interface TencentNeighbor {
	svid: string;
	lng: number;
	lat: number;
	/** Bearing from the current pano toward this neighbor (degrees). */
	heading: number;
}

/**
 * Navigable arrow links (Google Street View `links` / locationEntry[6]).
 * Parsed from roads: same-road neighbors at order±1.
 */
export interface TencentLink {
	svid: string;
	lng: number;
	lat: number;
	heading: number;
}

export interface TencentTimeEntry {
	svid: string;
	year: number;
	month: number;
	day: number;
}

export interface TencentPanoMeta {
	id: string;
	lng: number;
	lat: number;
	heading: number;
	captureDate: Date;
	/** All nearby captures for clickToGo overlays. */
	neighbors: TencentNeighbor[];
	/** Arrow links: nearest pano + nearest pano ~180° from the first. */
	links: TencentLink[];
	timeline: TencentTimeEntry[];
}

interface TencentScene {
	svid: string;
	x: number;
	y: number;
}

interface TencentRoadPoint {
	svid: string;
	x: number;
	y: number;
	order?: number;
}

interface TencentRoad {
	id: string;
	valid?: number;
	name?: string;
	width?: number;
	points?: TencentRoadPoint[];
}

interface TencentMetaDetail {
	basic: { svid: string; dir?: string | number; trans_svid?: string };
	addr: { x_lng: number; y_lat: number };
	all_scenes?: TencentScene[];
	roads?: TencentRoad[];
	vpoints?: TencentVPoint[];
	history?: { nodes?: { svid: string }[] };
}

interface TencentVPointLink {
	svid: string;
	x: number;
	y: number;
}

interface TencentVPoint {
	svid: string;
	x: number;
	y: number;
	rdid?: string;
	id?: number;
	link?: TencentVPointLink[];
}

const metaCache = new Map<string, TencentPanoMeta>();
const metaInflight = new Map<string, Promise<TencentPanoMeta | null>>();
/** Fallback when caller omits radius (SIS always passes Google's radius). */
const DEFAULT_SEARCH_RADIUS_M = 50;

function roadPointOrder(point: TencentRoadPoint, fallbackIndex: number): number {
	return typeof point.order === "number" && Number.isFinite(point.order)
		? point.order
		: fallbackIndex;
}

function findRoadPoint(
	roads: TencentRoad[] | undefined,
	selfId: string,
): { road: TencentRoad; point: TencentRoadPoint; pointIndex: number } | null {
	for (const road of roads ?? []) {
		if (!road?.points?.length) continue;
		for (let i = 0; i < road.points.length; i += 1) {
			const point = road.points[i];
			if (point?.svid === selfId) return { road, point, pointIndex: i };
		}
	}
	return null;
}

function roadPointByOrder(road: TencentRoad, order: number): TencentRoadPoint | null {
	if (!road.points?.length) return null;
	const byOrder = road.points.find((p) => typeof p?.order === "number" && p.order === order);
	if (byOrder) return byOrder;
	if (order >= 0 && order < road.points.length) return road.points[order] ?? null;
	return null;
}

function roadPointToLink(fromLng: number, fromLat: number, point: TencentRoadPoint): TencentLink {
	const pos = tencentToGcj02(point.x, point.y);
	return {
		svid: point.svid,
		lng: pos.lng,
		lat: pos.lat,
		heading: bearingDeg(fromLng, fromLat, pos.lng, pos.lat),
	};
}

function linksFromVpoints(
	vpoints: TencentVPoint[] | undefined,
	selfId: string,
	fromLng: number,
	fromLat: number,
): TencentLink[] {
	const vp = vpoints?.find((v) => v?.svid === selfId);
	if (!vp?.link?.length) return [];

	const out: TencentLink[] = [];
	const seen = new Set<string>();
	for (const l of vp.link) {
		if (!l?.svid || l.svid === selfId || seen.has(l.svid)) continue;
		const pos = tencentToGcj02(l.x, l.y);
		seen.add(l.svid);
		out.push({
			svid: l.svid,
			lng: pos.lng,
			lat: pos.lat,
			heading: bearingDeg(fromLng, fromLat, pos.lng, pos.lat),
		});
	}
	return out;
}

function linksFromRoads(
	roads: TencentRoad[] | undefined,
	vpoints: TencentVPoint[] | undefined,
	selfId: string,
	fromLng: number,
	fromLat: number,
): TencentLink[] {
	const roadEntry = findRoadPoint(roads, selfId);
	if (!roadEntry) return linksFromVpoints(vpoints, selfId, fromLng, fromLat);

	const { road, point, pointIndex } = roadEntry;
	const order = roadPointOrder(point, pointIndex);
	const prev = roadPointByOrder(road, order - 1);
	const next = roadPointByOrder(road, order + 1);
	const out: TencentLink[] = [];
	const seen = new Set<string>();

	const isMiddleNode = pointIndex > 0 && pointIndex < (road.points?.length ?? 0) - 1;
	if (isMiddleNode && prev && next) {
		for (const neighbor of [prev, next]) {
			if (!neighbor?.svid || neighbor.svid === selfId || seen.has(neighbor.svid)) continue;
			seen.add(neighbor.svid);
			out.push(roadPointToLink(fromLng, fromLat, neighbor));
		}
		return out;
	}

	if ((prev && prev.svid !== selfId )) {
		seen.add(prev.svid);
		out.push(roadPointToLink(fromLng, fromLat, prev));
	}

	if ((next && next.svid !== selfId )) {
		seen.add(next.svid);
		out.push(roadPointToLink(fromLng, fromLat, next));
	}

	for (const link of linksFromVpoints(vpoints, selfId, fromLng, fromLat)) {
		if (!link.svid || seen.has(link.svid)) continue;
		seen.add(link.svid);
		out.push(link);
	}

	return out;
}

/** Parse capture timestamp embedded in a Tencent svid. */
export function parseTencentDateFromSvid(svid: string): Date {
	const raw = stripTencent(svid);
	const year = 2000 + Number(raw.slice(8, 10));
	const month = Number(raw.slice(10, 12)) - 1;
	const day = Number(raw.slice(12, 14));
	const hour = Number(raw.slice(14, 16));
	const minute = Number(raw.slice(16, 18));
	return new Date(year, month, day, hour, minute, 0);
}

function sceneToNeighbor(
	fromLng: number,
	fromLat: number,
	scene: TencentScene,
): TencentNeighbor | null {
	if (!scene?.svid) return null;
	const pos = tencentToGcj02(scene.x, scene.y);
	return {
		svid: scene.svid,
		lng: pos.lng,
		lat: pos.lat,
		heading: bearingDeg(fromLng, fromLat, pos.lng, pos.lat),
	};
}

function parseDetail(qq: TencentMetaDetail): TencentPanoMeta {
	const lng = qq.addr.x_lng;
	const lat = qq.addr.y_lat;
	const id = qq.basic.svid;
	const captureDate = parseTencentDateFromSvid(id);

	const neighbors: TencentNeighbor[] = [];
	const seen = new Set<string>();
	for (const other of qq.all_scenes ?? []) {
		if (!other?.svid || seen.has(other.svid) || other.svid === id) continue;
		const n = sceneToNeighbor(lng, lat, other);
		if (!n) continue;
		seen.add(other.svid);
		neighbors.push(n);
	}

	const links = linksFromRoads(qq.roads, qq.vpoints, id, lng, lat);

	const timeline: TencentTimeEntry[] = [];
	for (const node of qq.history?.nodes ?? []) {
		if (!node?.svid) continue;
		const d = parseTencentDateFromSvid(node.svid);
		timeline.push({
			svid: node.svid,
			year: d.getFullYear(),
			month: d.getMonth(),
			day: d.getDate(),
		});
	}
	if(qq.basic?.trans_svid){
		const d = parseTencentDateFromSvid(qq.basic.trans_svid);
		timeline.push({
			svid: qq.basic.trans_svid,
			year: d.getFullYear(),
			month: d.getMonth(),
			day: d.getDate(),
		});
	}
	return {
		id,
		lng,
		lat,
		heading: Number(qq.basic.dir) || 0,
		captureDate,
		neighbors,
		links,
		timeline,
	};
}

export async function fetchTencentMeta(svid: string): Promise<TencentPanoMeta | null> {
	const id = stripTencent(svid);
	if (!id) return null;
	const hit = metaCache.get(id);
	if (hit) return hit;
	const pending = metaInflight.get(id);
	if (pending) return pending;

	const work = (async (): Promise<TencentPanoMeta | null> => {
		const url = new URL(TENCENT_META_URL);
		url.searchParams.set("svid", id);
		const res = await fetch(url.href, { signal: AbortSignal.timeout(15_000) });
		if (!res.ok) return null;
		const data = (await res.json()) as { detail?: TencentMetaDetail };
		if (!data.detail?.basic?.svid) return null;
		const meta = parseDetail(data.detail);
		metaCache.set(id, meta);
		return meta;
	})().finally(() => {
		metaInflight.delete(id);
	});

	metaInflight.set(id, work);
	return work;
}

export async function searchTencentPano(
	lat: number,
	lng: number,
	radiusM: number = DEFAULT_SEARCH_RADIUS_M,
): Promise<string | null> {
	if (!supportsBaiduAt(lng, lat)) return null;
	const r = Number.isFinite(radiusM) && radiusM > 0 ? radiusM : DEFAULT_SEARCH_RADIUS_M;
	const url = new URL(TENCENT_SEARCH_URL);
	url.searchParams.set("lat", lat.toFixed(6));
	url.searchParams.set("lng", lng.toFixed(6));
	url.searchParams.set("r", String(r));
	const res = await fetch(url.href, { signal: AbortSignal.timeout(15_000) });
	if (!res.ok) return null;
	const data = (await res.json()) as { detail?: { svid?: string } };
	return data.detail?.svid ?? null;
}

export async function resolveTencentNear(
	lat: number,
	lng: number,
	radiusM: number = DEFAULT_SEARCH_RADIUS_M,
): Promise<TencentPanoMeta | null> {
	const id = await searchTencentPano(lat, lng, radiusM);
	if (!id) return null;
	return fetchTencentMeta(id);
}

export function getCachedTencentMeta(svid: string): TencentPanoMeta | null {
	return metaCache.get(stripTencent(svid)) ?? null;
}

export function clearTencentMetaCache(): void {
	metaCache.clear();
	metaInflight.clear();
}
