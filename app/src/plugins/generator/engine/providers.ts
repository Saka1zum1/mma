import { cameraTypeFromHeight } from "@/lib/sv/getMetadata";
import { cmd } from "@/lib/commands";
import { chunk } from "@/lib/util/util";
import { log } from "@/lib/util/log";
import {
	baiduMetaFromSdata,
	resolveBaiduNear,
	fetchBaiduMeta,
	type BaiduPanoMeta,
} from "@/lib/sv/baidu/api";
import { getClosestPano } from "@/lib/sv/lookaround/tile";
import type { LookaroundPano } from "@/lib/sv/lookaround/api";
import { panosAt, svMetadata } from "@/lib/sv/query";
import { fetchTencentMeta, parseTencentDateFromSvid, resolveTencentNear, type TencentPanoMeta } from "@/lib/sv/tencent/api";
import { fetchYandexMeta, resolveYandexNear, type YandexPanoMeta } from "@/lib/sv/yandex/api";
import { PanoType, type LatLng } from "@/types";
import { adaptPano, type Pano } from "./panoModel";
import { baiduCoverageKind } from "./traverseRange";
import { isGoogleProvider, type StreetViewProvider } from "./types";

const NEAR_CONCURRENCY = 16;
const META_BATCH = 100;

function pad(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

function monthStamp(year: number, month: number): string {
	if (!year || month < 1 || month > 12) return "";
	return `${year}-${pad(month)}`;
}

/** `utc` for epoch timestamps; local components for a civil date built with `new Date(y, m, d)`. */
function monthFromDate(d: Date, utc: boolean): string {
	if (Number.isNaN(d.getTime()) || d.getTime() <= 0) return "";
	const year = utc ? d.getUTCFullYear() : d.getFullYear();
	const month = (utc ? d.getUTCMonth() : d.getMonth()) + 1;
	return monthStamp(year, month);
}

function minuteFromDate(d: Date, utc: boolean): number | null {
	if (Number.isNaN(d.getTime()) || d.getTime() <= 0) return null;
	const hour = utc ? d.getUTCHours() : d.getHours();
	const minute = utc ? d.getUTCMinutes() : d.getMinutes();
	return hour * 60 + minute;
}

function pov(heading: number): Pano["pov"] {
	return { heading, tilt: 0, roll: 0 };
}

/** Minute-of-day encoded in a 27-character Baidu id (YYMMDDHHmmssSSS). */
function baiduMinute(id: string): number | null {
	if (id.length !== 27) return null;
	const time = id.slice(10, 25);
	if (!/^\d{15}$/.test(time)) return null;
	const hour = Number(time.slice(6, 8));
	const minute = Number(time.slice(8, 10));
	if (hour > 23 || minute > 59) return null;
	return hour * 60 + minute;
}

function baiduMonth(date: string): string {
	if (!/^\d{6,8}$/.test(date)) return "";
	return monthStamp(Number(date.slice(0, 4)), Number(date.slice(4, 6)));
}

/** sdata rows from a traverse slice, in generator pano shape. */
export function panosFromBaiduSdata(rows: unknown[]): Pano[] {
	const out: Pano[] = [];
	for (const row of rows) {
		const meta = baiduMetaFromSdata(row);
		if (!meta) continue;
		out.push({ ...fromBaidu(meta), baiduCoverage: baiduCoverageKind(row) });
	}
	return out;
}

function fromBaidu(meta: BaiduPanoMeta): Pano {
	return {
		id: meta.id,
		lat: meta.lat,
		lng: meta.lng,
		description: meta.roadName ?? "",
		shortDescription: meta.roadName ?? "",
		copyright: "© Baidu Maps",
		links: meta.links.map((link) => ({ panoId: link.pid, heading: link.heading })),
		time: meta.timeline.map((entry) => ({
			panoId: entry.id,
			date: monthStamp(entry.year, entry.month),
		})),
		imageDate: baiduMonth(meta.date),
		pov: pov(meta.heading),
		cameraType: null,
		altitude: meta.altitude,
		country: "CN",
		road: meta.roadName,
		procdate: meta.procdate,
		author: null,
		coverage: null,
		worldHeight: null,
		minuteOfDay: baiduMinute(meta.id),
	};
}

function fromYandex(meta: YandexPanoMeta): Pano {
	const imageDate = monthFromDate(meta.captureDate, true);
	return {
		id: meta.id,
		lat: meta.lat,
		lng: meta.lng,
		description: meta.name ?? "",
		shortDescription: meta.name ?? "",
		copyright: meta.author ? meta.author : "© Yandex Maps",
		links: meta.links.map((link) => ({ panoId: link.oid, heading: link.heading })),
		time: meta.timeline.map((entry) => ({
			panoId: entry.oid,
			date: monthStamp(entry.year, entry.month + 1),
		})),
		imageDate,
		pov: pov(meta.heading),
		cameraType: null,
		altitude: null,
		country: null,
		road: null,
		procdate: null,
		author: meta.author,
		coverage: null,
		worldHeight: meta.worldHeight,
		minuteOfDay: minuteFromDate(meta.captureDate, true),
	};
}

function fromTencent(meta: TencentPanoMeta): Pano {
	const imageDate = monthFromDate(meta.captureDate, false);
	const time = meta.timeline.map((entry) => {
		const d = parseTencentDateFromSvid(entry.svid);
		return { panoId: entry.svid, date: monthFromDate(d, false) };
	});
	if (!time.some((entry) => entry.panoId === meta.id) && imageDate) {
		time.push({ panoId: meta.id, date: imageDate });
	}
	return {
		id: meta.id,
		lat: meta.lat,
		lng: meta.lng,
		description: meta.description ?? "",
		shortDescription: meta.mode === "night" ? meta.id : "",
		copyright: "© Tencent Maps",
		links: meta.links.map((link) => ({ panoId: link.svid, heading: link.heading })),
		time,
		imageDate,
		pov: pov(meta.heading),
		cameraType: null,
		altitude: null,
		country: "CN",
		road: meta.roadName,
		procdate: null,
		author: null,
		coverage: meta.mode === "night" ? "night" : null,
		worldHeight: null,
		minuteOfDay: minuteFromDate(meta.captureDate, false),
	};
}

function fromApple(pano: LookaroundPano): Pano {
	const when = pano.timestamp ? new Date(pano.timestamp) : new Date(0);
	const heading = pano.heading != null ? (pano.heading * 180) / Math.PI : 0;
	const altitude = pano.elevation ?? pano.altitude ?? null;
	return {
		id: String(pano.panoid),
		lat: pano.lat,
		lng: pano.lon,
		description: "",
		shortDescription: "",
		copyright: "© Apple Look Around",
		links: [],
		time: [],
		imageDate: monthFromDate(when, true),
		pov: pov(heading),
		cameraType: null,
		altitude: Number.isFinite(altitude) ? altitude : null,
		country: null,
		road: null,
		procdate: null,
		author: null,
		coverage: null,
		worldHeight: null,
		minuteOfDay: minuteFromDate(when, true),
	};
}

function wgs84Tile(lat: number, lng: number, zoom: number): [number, number] {
	const scale = 1 << zoom;
	const x = Math.floor(((lng + 180) / 360) * scale);
	const latRad = (lat * Math.PI) / 180;
	const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * scale);
	return [x, y];
}

async function pool(
	count: number,
	limit: number,
	signal: AbortSignal,
	job: (index: number) => Promise<void>,
): Promise<void> {
	if (count === 0) return;
	let cursor = 0;
	const workers = Math.min(limit, count);
	await Promise.all(
		Array.from({ length: workers }, async () => {
			while (cursor < count) {
				if (signal.aborted) return;
				const index = cursor++;
				await job(index);
			}
		}),
	);
	if (signal.aborted) {
		throw new DOMException("The operation was aborted", "AbortError");
	}
}

async function nearOne(
	provider: StreetViewProvider,
	lat: number,
	lng: number,
	radius: number,
): Promise<Pano | null> {
	switch (provider) {
		case "apple": {
			const pano = await getClosestPano(lat, lng, undefined, radius);
			return pano ? fromApple(pano) : null;
		}
		case "yandex": {
			const meta = await resolveYandexNear(lat, lng, radius);
			return meta ? fromYandex(meta) : null;
		}
		case "baidu": {
			const meta = await resolveBaiduNear(lat, lng, radius);
			return meta ? fromBaidu(meta) : null;
		}
		case "tencent": {
			const meta = await resolveTencentNear(lat, lng, radius);
			return meta ? fromTencent(meta) : null;
		}
		default:
			return null;
	}
}

async function byId(provider: StreetViewProvider, id: string): Promise<Pano | null> {
	switch (provider) {
		case "apple":
			return null;
		case "yandex": {
			const meta = await fetchYandexMeta(id);
			return meta ? fromYandex(meta) : null;
		}
		case "baidu": {
			const meta = await fetchBaiduMeta(id);
			return meta ? fromBaidu(meta) : null;
		}
		case "tencent": {
			const meta = await fetchTencentMeta(id);
			return meta ? fromTencent(meta) : null;
		}
		default:
			return null;
	}
}

type GoogleBatchPano = NonNullable<Awaited<ReturnType<typeof cmd.googleBatchMetadata>>[number]>;

function fromGoogleBatch(row: GoogleBatchPano): Pano {
	const height = row.worldHeight;
	const coverage =
		row.links.length === 0 ? (height === 2048 || height === 7200 ? "drone" : "photosphere") : null;
	return {
		id: row.id,
		lat: row.lat,
		lng: row.lng,
		description: row.description,
		shortDescription: row.shortDescription,
		copyright: "© Google",
		links: row.links,
		time: row.time,
		imageDate: row.imageDate,
		pov: pov(row.heading),
		cameraType: cameraTypeFromHeight(height),
		altitude: row.altitude,
		country: row.country,
		road: row.shortDescription || null,
		procdate: null,
		author: null,
		coverage,
		worldHeight: height,
		minuteOfDay: null,
	};
}

/** Batch GetMetadata, with the existing metadata procedure as a fallback. */
async function googleBatch(ids: string[], signal: AbortSignal): Promise<(Pano | null)[]> {
	if (ids.length === 0) return [];
	if (signal.aborted) throw new DOMException("The operation was aborted", "AbortError");
	try {
		const rows = await cmd.googleBatchMetadata(ids);
		return rows.map((row) => (row ? fromGoogleBatch(row) : null));
	} catch (e) {
		if (signal.aborted) throw e;
		log.warn("[generator] batch GetMetadata failed, using svMetadata", e);
		return (await svMetadata(ids, signal)).map(adaptPano);
	}
}

/** One answer per sample point. Google streams through `panosAt`; a photometa tile
 *  can hold many panos, and each id is reported on the first sample that listed it. */
export async function probePoints(
	provider: StreetViewProvider,
	coords: LatLng[],
	radius: number,
	officialOnly: boolean,
	signal: AbortSignal,
	onPanos: (index: number, panos: Pano[]) => void,
): Promise<void> {
	if (provider === "google") {
		const panos = (
			await panosAt(
				coords,
				radius,
				officialOnly ? { sources: [PanoType.Official] } : undefined,
				signal,
				(index, pano) => {
					const adapted = adaptPano(pano);
					onPanos(index, adapted ? [adapted] : []);
				},
			)
		).map(adaptPano);
		for (let i = 0; i < panos.length; i++) onPanos(i, panos[i] ? [panos[i]!] : []);
		return;
	}

	if (provider === "googleZoom") {
		const tiles = new Map<string, Promise<string[]>>();
		const lists = await Promise.all(
			coords.map((coord) => {
				const [x, y] = wgs84Tile(coord.lat, coord.lng, 17);
				const key = `${x}/${y}`;
				let pending = tiles.get(key);
				if (!pending) {
					pending = cmd.photometaPanoIds(coord.lat, coord.lng);
					tiles.set(key, pending);
				}
				return pending;
			}),
		);
		const unique = [...new Set(lists.flat())];
		const byPano = new Map<string, Pano>();
		for (const ids of chunk(unique, META_BATCH)) {
			if (signal.aborted) throw new DOMException("The operation was aborted", "AbortError");
			const metas = await googleBatch(ids, signal);
			ids.forEach((id, i) => {
				const pano = metas[i];
				if (pano) byPano.set(id, pano);
			});
		}
		const emitted = new Set<string>();
		lists.forEach((ids, index) => {
			const panos: Pano[] = [];
			for (const id of ids) {
				if (emitted.has(id)) continue;
				const pano = byPano.get(id);
				if (!pano) continue;
				emitted.add(id);
				panos.push(pano);
			}
			onPanos(index, panos);
		});
		return;
	}

	await pool(coords.length, NEAR_CONCURRENCY, signal, async (index) => {
		const coord = coords[index];
		let pano: Pano | null = null;
		try {
			pano = await nearOne(provider, coord.lat, coord.lng, radius);
		} catch (e) {
			if (signal.aborted) throw e;
			log.warn("[generator] probe failed", provider, e);
		}
		onPanos(index, pano ? [pano] : []);
	});
}

/** Metadata for ids a probe or a link walk already holds. Google ids go through
 *  `svMetadata`; the other providers use their own meta endpoints. */
export async function fetchPanos(
	provider: StreetViewProvider,
	ids: string[],
	signal: AbortSignal,
): Promise<(Pano | null)[]> {
	if (ids.length === 0) return [];
	if (provider === "googleZoom") return googleBatch(ids, signal);
	if (isGoogleProvider(provider)) {
		return (await svMetadata(ids, signal)).map(adaptPano);
	}
	const out: (Pano | null)[] = new Array(ids.length).fill(null);
	await pool(ids.length, NEAR_CONCURRENCY, signal, async (index) => {
		try {
			out[index] = await byId(provider, ids[index]);
		} catch (e) {
			if (signal.aborted) throw e;
			log.warn("[generator] metadata failed", provider, ids[index], e);
		}
	});
	return out;
}
