/**
 * Tencent Street View service helpers for the official opensv pipeline:
 * expanded thumb, tile URL rewrite (per-zoom scale/crop), timeline adapters.
 *
 * Tile zoom workflow (altproviders):
 *   Google z0 → expanded level-0 thumb (512×256 → 512×512)
 *   Google z1 → getScaledThumbUrl (thumb level 1 quadrant upscale)
 *   Google z2 → downscaledTiles (composite 4× level-0 tiles, virtual level −1)
 *   Google z3 → native Tencent level 0
 *   Google z4 → upscale quadrant from Tencent level 1 (skip y=7)
 *   Google z5 → upscale quadrant from Tencent level 2 (skip floor(y/2)=7)
 */
import type { TencentLink, TencentPanoMeta } from "./api";
import { TENCENT_THUMB_BASE, tencentPanoTileUrl, tencentThumbUrl } from "./endpoints";
import { prefixTencent, stripTencent } from "./prefix";
import type { PanoDateEntry } from "@/lib/sv/panoProvider";

const TILE = 512;
/** 1×1 transparent GIF — cancel in-flight Image.decode on abort. */
const ABORT_IMG =
	"data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAI=";

const locationByPano = new Map<string, { lat: number; lng: number }>();
const zoom0Cache = new Map<string, string>();
const zoom0Inflight = new Map<string, Promise<string>>();
/** Decoded images keyed by tile/thumb URL. */
const imageUrlCache = new Map<string, Promise<HTMLImageElement>>();
/** Upscaled quadrant blob URLs keyed by source URL (cachedScaledTiles). */
const scaledUrlCache = new Map<string, Promise<string>>();
/** Downscaled composite blob URLs keyed by svid/x/y (cachedDownscaledTiles). */
const downscaledCache = new Map<string, Promise<string>>();

let blackTileUrl: string | null = null;

function abortError(): Error {
	return Object.assign(new Error("aborted"), { name: "AbortError" });
}

/**
 * Race a shared promise against `signal` (lru-cache `fetch(key, { signal })` semantics):
 * abort rejects this waiter immediately without cancelling siblings.
 */
function awaitAbortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return promise;
	if (signal.aborted) return Promise.reject(abortError());
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(abortError());
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener("abort", onAbort);
				if (signal.aborted) reject(abortError());
				else resolve(value);
			},
			(err: unknown) => {
				signal.removeEventListener("abort", onAbort);
				reject(err);
			},
		);
	});
}

function thumbSubdomain(svid: string): number {
	const seed = Number(svid.slice(16, 18));
	return Number.isFinite(seed) ? seed : 0;
}

/** getThumbUrl(pano, level, x, y) */
function tencentThumbAt(
	svid: string,
	level: number,
	x: number,
	y: number,
): string {
	const url = new URL(
		TENCENT_THUMB_BASE.replace("{s}", String(thumbSubdomain(svid) % 4)),
	);
	url.searchParams.set("x", String(x));
	url.searchParams.set("y", String(y));
	url.searchParams.set("level", String(level));
	url.searchParams.set("svid", svid);
	return url.href;
}

/** Decode an image URL; aborts by swapping src when `signal` fires. */
function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(abortError());
			return;
		}
		const img = new Image();
		img.crossOrigin = "anonymous";
		const onAbort = () => {
			img.src = ABORT_IMG;
		};
		signal?.addEventListener("abort", onAbort);
		img.src = url;
		img
			.decode()
			.then(() => {
				signal?.removeEventListener("abort", onAbort);
				if (signal?.aborted) {
					reject(abortError());
					return;
				}
				resolve(img);
			})
			.catch((err: unknown) => {
				signal?.removeEventListener("abort", onAbort);
				if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
					reject(abortError());
					return;
				}
				reject(err instanceof Error ? err : new Error(String(err)));
			});
	});
}

/** cachedTiles.fetch(url) */
async function fetchTencentImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
	signal?.throwIfAborted();
	let work = imageUrlCache.get(url);
	if (!work) {
		work = loadImage(url).catch((err) => {
			imageUrlCache.delete(url);
			throw err;
		});
		imageUrlCache.set(url, work);
	}
	return awaitAbortable(work, signal);
}

export function blackTencentTileUrl(): string {
	if (blackTileUrl) return blackTileUrl;
	const canvas = document.createElement("canvas");
	canvas.width = TILE;
	canvas.height = TILE;
	blackTileUrl = canvas.toDataURL("image/jpeg");
	return blackTileUrl;
}

export function rememberTencentMeta(meta: TencentPanoMeta): void {
	locationByPano.set(meta.id, { lat: meta.lat, lng: meta.lng });
	for (const n of meta.neighbors) {
		if (!locationByPano.has(n.svid)) {
			locationByPano.set(n.svid, { lat: n.lat, lng: n.lng });
		}
	}
	for (const l of meta.links) {
		if (!locationByPano.has(l.svid)) {
			locationByPano.set(l.svid, { lat: l.lat, lng: l.lng });
		}
	}
}

export function getCachedTencentLocation(
	svid: string,
): { lat: number; lng: number } | null {
	return locationByPano.get(stripTencent(svid)) ?? null;
}

export function streetViewLinksFromMeta(links: TencentLink[]): google.maps.StreetViewLink[] {
	return links
		.filter((l) => l.svid)
		.map((l) => ({
			pano: prefixTencent(l.svid),
			heading: Number.isFinite(l.heading) ? l.heading : 0,
			description: "",
		}));
}

function createTileCanvas(): OffscreenCanvas | HTMLCanvasElement {
	if (typeof OffscreenCanvas !== "undefined") {
		return new OffscreenCanvas(TILE, TILE);
	}
	const c = document.createElement("canvas");
	c.width = TILE;
	c.height = TILE;
	return c;
}

async function canvasToObjectUrl(
	canvas: OffscreenCanvas | HTMLCanvasElement,
): Promise<string> {
	if (canvas instanceof OffscreenCanvas) {
		const blob = await canvas.convertToBlob({ type: "image/jpeg" });
		return URL.createObjectURL(blob);
	}
	return new Promise<string>((resolve, reject) => {
		canvas.toBlob(
			(b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error("toBlob failed"))),
			"image/jpeg",
			0.92,
		);
	});
}

/**
 * expandedThumbnails / getLevelZero: level-0 thumb (512×256) → 512×512 JPEG.
 */
export async function buildExpandedZoom0(
	svid: string,
	signal?: AbortSignal,
): Promise<string> {
	signal?.throwIfAborted();
	const raw = stripTencent(svid);
	const hit = zoom0Cache.get(raw);
	if (hit) {
		signal?.throwIfAborted();
		return hit;
	}
	let pending = zoom0Inflight.get(raw);
	if (!pending) {
		pending = (async () => {
			const img = await fetchTencentImage(tencentThumbUrl(raw));
			const canvas = createTileCanvas();
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("2d unavailable");
			const w = TILE;
			const h = TILE / 2;
			ctx.drawImage(img, 0, 0, w, h);
			const url = await canvasToObjectUrl(canvas);
			zoom0Cache.set(raw, url);
			return url;
		})().finally(() => {
			zoom0Inflight.delete(raw);
		});
		zoom0Inflight.set(raw, pending);
	}
	return awaitAbortable(pending, signal);
}

/** getLevelZero(pano, signal) */
export function getLevelZero(svid: string, signal?: AbortSignal): Promise<string> {
	return buildExpandedZoom0(svid, signal);
}

/**
 * cachedScaledTiles: upscale one quadrant from parent at (level−1, floor(x/2), floor(y/2)).
 * Works for both tile and thumb URLs.
 */
async function getScaledFromUrl(url: string, signal?: AbortSignal): Promise<string> {
	signal?.throwIfAborted();
	let work = scaledUrlCache.get(url);
	if (!work) {
		work = (async () => {
			const { searchParams } = new URL(url);
			const x = Number(searchParams.get("x"));
			const y = Number(searchParams.get("y"));
			const level = Number(searchParams.get("level"));
			const parent = new URL(url);
			parent.searchParams.set("level", String(level - 1));
			parent.searchParams.set("x", String(Math.floor(x / 2)));
			parent.searchParams.set("y", String(Math.floor(y / 2)));
			const image = await fetchTencentImage(parent.href);
			const canvas = createTileCanvas();
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("2d unavailable");
			const sx = ((x % 2) * TILE) / 2;
			const sy = ((y % 2) * TILE) / 2;
			const sw = TILE / 2;
			const sh = TILE / 2;
			ctx.drawImage(image, sx, sy, sw, sh, 0, 0, TILE, TILE);
			return canvasToObjectUrl(canvas);
		})().catch((err) => {
			scaledUrlCache.delete(url);
			throw err;
		});
		scaledUrlCache.set(url, work);
	}
	return awaitAbortable(work, signal);
}

/** getScaledThumbUrl(pano, x, signal) — parent thumb at level−1. */
function getScaledThumbUrl(
	svid: string,
	x: number,
	signal?: AbortSignal,
): Promise<string> {
	return getScaledFromUrl(tencentThumbAt(svid, 1, x, 0), signal);
}

/**
 * getScaledTileUrl(pano, level, x, y, signal) — upscale a quadrant from the
 * parent tile at (level−1, floor(x/2), floor(y/2)).
 *
 * Must use level−1 (opensv / cachedScaledTiles parity). Fetching the same
 * `level` parent was projecting z4/z5 tiles wrong at max zoom.
 */
function getScaledTileUrl(
	svid: string,
	level: number,
	x: number,
	y: number,
	signal?: AbortSignal,
): Promise<string> {
	return getScaledFromUrl(tencentPanoTileUrl(svid, level, x, y), signal);
}

/**
 * cachedDownscaledTiles: virtual level −1 tile → composite four level-0 subtiles.
 */
async function getDownscaledTileUrl(
	svid: string,
	x: number,
	y: number,
	signal?: AbortSignal,
): Promise<string> {
	signal?.throwIfAborted();
	const key = `${svid}/${x}/${y}`;
	let work = downscaledCache.get(key);
	if (!work) {
		work = (async () => {
			const virtualLevel = -1;
			const subtiles: Array<[number, number, number]> = [
				[virtualLevel + 1, x * 2, y * 2],
				[virtualLevel + 1, x * 2 + 1, y * 2],
				[virtualLevel + 1, x * 2, y * 2 + 1],
				[virtualLevel + 1, x * 2 + 1, y * 2 + 1],
			];
			const canvas = createTileCanvas();
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("2d unavailable");
			await Promise.all(
				subtiles.map(async ([z, x2, y2]) => {
					const image = await fetchTencentImage(tencentPanoTileUrl(svid, z, x2, y2));
					const dx = ((x2 % 2) * TILE) / 2;
					const dy = ((y2 % 2) * TILE) / 2;
					const dw = TILE / 2;
					const dh = TILE / 2;
					ctx.drawImage(image, dx, dy, dw, dh);
				}),
			);
			return canvasToObjectUrl(canvas);
		})().catch((err) => {
			downscaledCache.delete(key);
			throw err;
		});
		downscaledCache.set(key, work);
	}
	return awaitAbortable(work, signal);
}

/** Google opensv zoom → Tencent tile URL (string or blob URL promise). */
export function tencentTileUrlAtGoogleZoom(
	panoId: string,
	zoom: number,
	x: number,
	y: number,
	signal?: AbortSignal,
): string | Promise<string> {
	const raw = stripTencent(panoId);
	if (zoom === 0) return buildExpandedZoom0(raw, signal);
	if (zoom === 1) return getScaledThumbUrl(raw, x, signal);
	if (zoom === 2) return getDownscaledTileUrl(raw, x, y, signal);
	if (zoom === 3) return tencentPanoTileUrl(raw, 0, x, y);
	if (zoom === 4) {
		if (y === 7) return blackTencentTileUrl();
		return getScaledTileUrl(raw, 1, x, y, signal);
	}
	if (zoom === 5) {
		if (Math.floor(y / 2) === 7) return blackTencentTileUrl();
		return getScaledTileUrl(raw, 2, x, y, signal);
	}
	return blackTencentTileUrl();
}

export function tencentTimelineEntries(anchor: TencentPanoMeta): PanoDateEntry[] {
	const byPano = new Map<string, PanoDateEntry>();
	const add = (svid: string, ts: number) => {
		if (!byPano.has(svid)) {
			byPano.set(svid, {
				pano: prefixTencent(svid),
				timestamp: ts,
				cameraType: "tencent",
			});
		}
	};
	add(anchor.id, anchor.captureDate.getTime());
	for (const t of anchor.timeline) {
		add(t.svid, Date.UTC(t.year, t.month, t.day));
	}
	return [...byPano.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function warmTencentPanoAssets(panoId: string): void {
	const raw = stripTencent(panoId);
	void buildExpandedZoom0(raw).catch(() => {});
	for (let y = 0; y < 4; y += 1) {
		for (let x = 0; x < 8; x += 1) {
			void fetchTencentImage(tencentPanoTileUrl(raw, 0, x, y)).catch(() => {});
		}
	}
}

function revokeBlobUrls(cache: Map<string, Promise<string>>): void {
	for (const p of cache.values()) {
		void p.then(
			(url) => {
				try {
					URL.revokeObjectURL(url);
				} catch {
					/* ignore */
				}
			},
			() => undefined,
		);
	}
}

export function clearTencentServiceCaches(): void {
	for (const url of zoom0Cache.values()) {
		try {
			URL.revokeObjectURL(url);
		} catch {
			/* ignore */
		}
	}
	revokeBlobUrls(scaledUrlCache);
	revokeBlobUrls(downscaledCache);
	locationByPano.clear();
	zoom0Cache.clear();
	zoom0Inflight.clear();
	imageUrlCache.clear();
	scaledUrlCache.clear();
	downscaledCache.clear();
}
