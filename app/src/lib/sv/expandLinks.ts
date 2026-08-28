/**
 * Expand Street View link graphs (Google / Baidu / Tencent / Yandex) from
 * selected locations into new untagged map locations.
 */
import type { Location } from "@/bindings.gen";
import { createLocation, LocationFlag } from "@/types";
import { getLocationProvider, getLocationPanoId } from "@/lib/sv/providers/types";
import { fetchPanoData } from "@/lib/sv/lookup";
import { fetchBaiduMeta } from "@/lib/sv/baidu/api";
import { buildBaiduExtra } from "@/lib/sv/baidu/panoExtra";
import { stripBaidu } from "@/lib/sv/baidu/prefix";
import { fetchTencentMeta } from "@/lib/sv/tencent/api";
import { buildTencentExtra } from "@/lib/sv/tencent/panoExtra";
import { stripTencent } from "@/lib/sv/tencent/prefix";
import { fetchYandexMeta } from "@/lib/sv/yandex/api";
import { buildYandexExtra } from "@/lib/sv/yandex/panoExtra";
import { stripYandex } from "@/lib/sv/yandex/prefix";
import { addLocations, fetchLocations, getMapState } from "@/store/useMapStore";
import { emit } from "@/lib/events";
import { log } from "@/lib/util/log";

const LINK_PROVIDERS = new Set(["google", "baidu", "tencent", "yandex"]);

export interface ExpandProgress {
	added: number;
	max: number;
	queued: number;
	done: boolean;
}

export type ExpandProgressCb = (p: ExpandProgress) => void;

let running = false;
let abort: AbortController | null = null;

export function isExpandingSvLinks(): boolean {
	return running;
}

export function stopExpandSvLinks() {
	// Only abort; `running` stays true until startExpandSvLinks's finally clears it
	// so the toolbar keeps showing the stop state until the crawl unwinds.
	abort?.abort();
}

export interface StartExpandOptions {
	maxCount: number;
	onProgress?: ExpandProgressCb;
}

/** Start a capped BFS crawl from the current selection. */
export async function startExpandSvLinks(opts: StartExpandOptions): Promise<number> {
	if (running) throw new Error("already-running");
	const maxCount = Math.max(1, Math.floor(opts.maxCount));
	const ids = [...getMapState().selectedLocationIds];
	if (!ids.length) throw new Error("no-selection");

	const seeds = await fetchLocations({ kind: "ids", ids });
	const usable = seeds.filter((l) => LINK_PROVIDERS.has(getLocationProvider(l)));
	if (!usable.length) throw new Error("no-provider");

	running = true;
	abort = new AbortController();
	emit("plugins:changed");

	const signal = abort.signal;
	try {
		const added = await expandLinksCrawl(usable, signal, maxCount, opts.onProgress);
		if (signal.aborted) {
			const err = new Error("aborted");
			err.name = "AbortError";
			throw err;
		}
		opts.onProgress?.({
			added,
			max: maxCount,
			queued: 0,
			done: true,
		});
		return added;
	} finally {
		running = false;
		abort = null;
		emit("plugins:changed");
	}
}

type LinkProvider = "google" | "baidu" | "tencent" | "yandex";

interface LinkTarget {
	provider: LinkProvider;
	panoId: string;
	lat: number;
	lng: number;
	heading: number;
}

async function expandLinksCrawl(
	seeds: Location[],
	signal: AbortSignal,
	maxCount: number,
	onProgress?: ExpandProgressCb,
): Promise<number> {
	const existing = await fetchLocations({ kind: "all" });
	const seen = new Set<string>();
	for (const loc of existing) {
		const id = getLocationPanoId(loc);
		const provider = getLocationProvider(loc);
		if (id && LINK_PROVIDERS.has(provider)) {
			seen.add(panoKey(provider, id));
		}
	}

	const queue: LinkTarget[] = [];
	for (const seed of seeds) {
		const provider = getLocationProvider(seed) as LinkProvider;
		const panoId = getLocationPanoId(seed);
		if (!panoId) continue;
		seen.add(panoKey(provider, panoId));
		queue.push({
			provider,
			panoId,
			lat: seed.lat,
			lng: seed.lng,
			heading: seed.heading,
		});
	}

	let addedTotal = 0;

	while (queue.length && !signal.aborted && addedTotal < maxCount) {
		const current = queue.shift()!;
		let links: LinkTarget[];
		try {
			links = await fetchLinksOf(current);
		} catch (e) {
			log.warn("[expand-sv-links] fetch failed", current.panoId, e);
			continue;
		}
		if (signal.aborted) break;

		const batch: ReturnType<typeof createLocation>[] = [];
		for (const link of links) {
			if (addedTotal + batch.length >= maxCount) break;
			const key = panoKey(link.provider, link.panoId);
			if (seen.has(key)) continue;
			seen.add(key);
			queue.push(link);

			try {
				const loc = await materializeLink(link);
				if (loc) batch.push(loc);
			} catch (e) {
				log.warn("[expand-sv-links] materialize failed", link.panoId, e);
			}
			if (signal.aborted) break;
		}

		if (batch.length) {
			await addLocations(batch);
			addedTotal += batch.length;
		}

		onProgress?.({
			added: addedTotal,
			max: maxCount,
			queued: queue.length,
			done: false,
		});

		await new Promise((r) => setTimeout(r, 0));
	}

	return addedTotal;
}

function panoKey(provider: string, panoId: string): string {
	const raw =
		provider === "baidu"
			? stripBaidu(panoId)
			: provider === "tencent"
				? stripTencent(panoId)
				: provider === "yandex"
					? stripYandex(panoId)
					: panoId;
	return `${provider}:${raw}`;
}

async function fetchLinksOf(node: LinkTarget): Promise<LinkTarget[]> {
	if (node.provider === "google") {
		const data = await fetchPanoData({ pano: node.panoId });
		if (!data?.links?.length) return [];
		const out: LinkTarget[] = [];
		for (const link of data.links) {
			const pid = link.pano;
			if (!pid) continue;
			// Resolve lat/lng for the linked pano.
			const linked = await fetchPanoData({ pano: pid });
			const ll = linked?.location?.latLng;
			if (!ll) continue;
			out.push({
				provider: "google",
				panoId: pid,
				lat: ll.lat(),
				lng: ll.lng(),
				heading: link.heading ?? linked?.tiles?.centerHeading ?? 0,
			});
		}
		return out;
	}
	if (node.provider === "baidu") {
		const meta = await fetchBaiduMeta(node.panoId);
		if (!meta) return [];
		return meta.links.map((l) => ({
			provider: "baidu" as const,
			panoId: l.pid,
			lat: l.lat,
			lng: l.lng,
			heading: l.heading,
		}));
	}
	if (node.provider === "tencent") {
		const meta = await fetchTencentMeta(node.panoId);
		if (!meta) return [];
		return meta.links.map((l) => ({
			provider: "tencent" as const,
			panoId: l.svid,
			lat: l.lat,
			lng: l.lng,
			heading: l.heading,
		}));
	}
	const meta = await fetchYandexMeta(node.panoId);
	if (!meta) return [];
	return meta.links.map((l) => ({
		provider: "yandex" as const,
		panoId: l.oid,
		lat: l.lat,
		lng: l.lng,
		heading: l.heading,
	}));
}

async function materializeLink(link: LinkTarget) {
	if (link.provider === "google") {
		const data = await fetchPanoData({ pano: link.panoId });
		const ll = data?.location?.latLng;
		const heading = data?.tiles?.centerHeading ?? link.heading;
		return createLocation({
			lat: ll?.lat() ?? link.lat,
			lng: ll?.lng() ?? link.lng,
			heading,
			panoId: link.panoId,
			provider: "google",
			flags: LocationFlag.LoadAsPanoId,
			tags: [],
			extra: {
				drivingDirection: heading,
				imageDate: typeof data?.imageDate === "string" ? data.imageDate : undefined,
			},
		});
	}
	if (link.provider === "baidu") {
		const meta = await fetchBaiduMeta(link.panoId);
		if (!meta) {
			return createLocation({
				lat: link.lat,
				lng: link.lng,
				heading: link.heading,
				panoId: link.panoId,
				provider: "baidu",
				flags: LocationFlag.LoadAsPanoId,
				tags: [],
			});
		}
		return createLocation({
			lat: meta.lat,
			lng: meta.lng,
			heading: meta.heading,
			pitch: meta.pitch,
			panoId: meta.id,
			provider: "baidu",
			flags: LocationFlag.LoadAsPanoId,
			tags: [],
			extra: buildBaiduExtra(meta),
		});
	}
	if (link.provider === "tencent") {
		const meta = await fetchTencentMeta(link.panoId);
		if (!meta) {
			return createLocation({
				lat: link.lat,
				lng: link.lng,
				heading: link.heading,
				panoId: link.panoId,
				provider: "tencent",
				flags: LocationFlag.LoadAsPanoId,
				tags: [],
			});
		}
		return createLocation({
			lat: meta.lat,
			lng: meta.lng,
			heading: meta.heading,
			panoId: meta.id,
			provider: "tencent",
			flags: LocationFlag.LoadAsPanoId,
			tags: [],
			extra: buildTencentExtra(meta),
		});
	}
	const meta = await fetchYandexMeta(link.panoId);
	if (!meta) {
		return createLocation({
			lat: link.lat,
			lng: link.lng,
			heading: link.heading,
			panoId: link.panoId,
			provider: "yandex",
			flags: LocationFlag.LoadAsPanoId,
			tags: [],
		});
	}
	return createLocation({
		lat: meta.lat,
		lng: meta.lng,
		heading: meta.heading,
		panoId: meta.id,
		provider: "yandex",
		flags: LocationFlag.LoadAsPanoId,
		tags: [],
		extra: buildYandexExtra(meta),
	});
}
