import type { LatLng } from "@/types";
import type { SvProvider } from "@/lib/sv/providers/types";
import { fetchPanoData } from "@/lib/sv/lookup";
import { SV_SEARCH_RADIUS } from "@/lib/sv/constants";
import { getClosestPano } from "@/lib/sv/lookaround/tile";
import { META_OPEN } from "@/lib/sv/lookaround/api";
import { resolveBaiduNear } from "@/lib/sv/baidu/api";
import { prefixBaidu } from "@/lib/sv/baidu/prefix";
import { resolveTencentNear } from "@/lib/sv/tencent/api";
import { prefixTencent } from "@/lib/sv/tencent/prefix";
import { resolveYandexNear } from "@/lib/sv/yandex/api";
import { prefixYandex } from "@/lib/sv/yandex/prefix";

export interface ResolvedSvPoint {
	lat: number;
	lng: number;
	panoId: string;
	provider: SvProvider;
	/** Capture / driving heading when known. */
	heading: number;
	pitch: number;
	elevation: number;
	copyright: string;
	imageDate: string;
}

async function resolveGoogle(lat: number, lng: number, radius: number): Promise<ResolvedSvPoint | null> {
	const data = await fetchPanoData({ location: { lat, lng }, radius });
	if (!data?.location?.pano) return null;
	const ll = data.location.latLng;
	return {
		lat: ll.lat(),
		lng: ll.lng(),
		panoId: data.location.pano,
		provider: "google",
		heading: data.tiles?.centerHeading ?? 0,
		pitch: 0,
		elevation: data.extra?.altitude ?? -1,
		copyright: data.copyright ?? "© Google",
		imageDate: formatImageDate(data.imageDate),
	};
}

function formatImageDate(d: unknown): string {
	if (typeof d === "string") return d;
	if (d instanceof Date && !isNaN(d.getTime())) {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
	}
	if (d && typeof d === "object" && "year" in d) {
		const y = Number((d as { year?: number }).year ?? 0);
		const m = Number((d as { month?: number }).month ?? 1);
		if (y > 0) return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
	}
	return "";
}

async function resolveApple(lat: number, lng: number): Promise<ResolvedSvPoint | null> {
	const pano = await getClosestPano(lat, lng, META_OPEN);
	if (!pano) return null;
	return {
		lat: pano.lat,
		lng: pano.lon,
		panoId: pano.panoid,
		provider: "apple",
		heading: pano.heading ?? 0,
		pitch: 0,
		elevation: pano.elevation ?? -1,
		copyright: "© Apple",
		imageDate: "",
	};
}

async function resolveBaidu(lat: number, lng: number): Promise<ResolvedSvPoint | null> {
	const meta = await resolveBaiduNear(lat, lng);
	if (!meta) return null;
	return {
		lat: meta.lat,
		lng: meta.lng,
		panoId: prefixBaidu(meta.id),
		provider: "baidu",
		heading: meta.heading ?? 0,
		pitch: meta.pitch ?? 0,
		elevation: meta.altitude ?? -1,
		copyright: "© Baidu",
		imageDate: meta.date ? `${meta.date.slice(0, 4)}-${meta.date.slice(4, 6)}` : "",
	};
}

async function resolveTencent(lat: number, lng: number): Promise<ResolvedSvPoint | null> {
	const meta = await resolveTencentNear(lat, lng);
	if (!meta) return null;
	const date = meta.captureDate;
	return {
		lat: meta.lat,
		lng: meta.lng,
		panoId: prefixTencent(meta.id),
		provider: "tencent",
		heading: meta.heading ?? 0,
		pitch: 0,
		elevation: -1,
		copyright: "© Tencent",
		imageDate: date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "",
	};
}

async function resolveYandex(lat: number, lng: number): Promise<ResolvedSvPoint | null> {
	const meta = await resolveYandexNear(lat, lng);
	if (!meta) return null;
	const date = meta.captureDate;
	return {
		lat: meta.lat,
		lng: meta.lng,
		panoId: prefixYandex(meta.id),
		provider: "yandex",
		heading: meta.heading ?? 0,
		pitch: 0,
		elevation: -1,
		copyright: "© Yandex",
		imageDate: date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "",
	};
}

const RESOLVERS: Record<
	SvProvider,
	(lat: number, lng: number, radius: number) => Promise<ResolvedSvPoint | null>
> = {
	google: resolveGoogle,
	apple: (lat, lng) => resolveApple(lat, lng),
	baidu: (lat, lng) => resolveBaidu(lat, lng),
	tencent: (lat, lng) => resolveTencent(lat, lng),
	yandex: (lat, lng) => resolveYandex(lat, lng),
};

export interface ResolveSvOptions {
	providers?: SvProvider[];
	radius?: number;
	signal?: AbortSignal;
}

/** Resolve the nearest Street View panorama, trying providers in order. */
export async function resolveSvPoint(
	point: LatLng,
	opts: ResolveSvOptions = {},
): Promise<ResolvedSvPoint | null> {
	const providers = opts.providers ?? (["google"] as SvProvider[]);
	const radius = opts.radius ?? SV_SEARCH_RADIUS;

	for (const provider of providers) {
		if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
		const resolve = RESOLVERS[provider];
		if (!resolve) continue;
		try {
			const hit = await resolve(point.lat, point.lng, radius);
			if (hit) return hit;
		} catch {
			// try next provider
		}
	}
	return null;
}

export interface ResolveManyOptions extends ResolveSvOptions {
	/** Deduplicate consecutive identical pano IDs (Hyperlapse.js behavior). Default true. */
	dedupe?: boolean;
	onProgress?: (resolved: number, total: number) => void;
}

/** Resolve a list of sample points; optionally skip consecutive duplicate panos. */
export async function resolveSvPoints(
	points: LatLng[],
	opts: ResolveManyOptions = {},
): Promise<ResolvedSvPoint[]> {
	const dedupe = opts.dedupe !== false;
	const out: ResolvedSvPoint[] = [];
	let prevPano: string | null = null;

	for (let i = 0; i < points.length; i++) {
		if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
		const hit = await resolveSvPoint(points[i], opts);
		opts.onProgress?.(i + 1, points.length);
		if (!hit) continue;
		if (dedupe && hit.panoId === prevPano) continue;
		prevPano = hit.panoId;
		out.push(hit);
	}
	return out;
}
