/**
 * Stitch a Yandex native zoom level into one equirectangular blob URL.
 * Used as the MultiTiles `baseUrl` (coarsest level only — typically a handful
 * of tiles). Higher detail is loaded on demand by `tiles.ts`.
 *
 * Tile fetches are concurrency-limited + retried to avoid
 * `net::ERR_INSUFFICIENT_RESOURCES` when a high-res level has hundreds of tiles.
 */
import type { YandexPanoMeta } from "../api";
import { yandexPanoTileUrl } from "../endpoints";
import { runConcurrent } from "@/lib/util/concurrent";
import { levelSize } from "./panoData";

type StitchEntry = { url: string; refs: number };

const stitchCache = new Map<string, StitchEntry>();
const stitchInflight = new Map<string, Promise<string>>();

/** Parallel tile fetches — high enough for speed, low enough for Chromium sockets. */
const TILE_CONCURRENCY = 8;
const TILE_RETRIES = 4;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTileBitmap(url: string): Promise<ImageBitmap | null> {
	for (let attempt = 0; attempt < TILE_RETRIES; attempt += 1) {
		try {
			const resp = await fetch(url, { signal: AbortSignal.timeout(20_000) });
			if (!resp.ok) {
				await delay(150 * (attempt + 1) + Math.random() * 100);
				continue;
			}
			return await createImageBitmap(await resp.blob());
		} catch {
			// ERR_INSUFFICIENT_RESOURCES / abort / network — back off and retry.
			await delay(200 * (attempt + 1) + Math.random() * 150);
		}
	}
	return null;
}

function cacheKey(imageId: string, level: number): string {
	return `${imageId}/${level}`;
}

/** Stitch native level → object URL (cached). Caller must release via releaseStitchUrl. */
export async function stitchYandexLevel(
	meta: YandexPanoMeta,
	level: number,
): Promise<{ url: string; width: number; height: number }> {
	const lvl = Math.min(Math.max(0, level), Math.max(0, meta.zooms.length - 1));
	const { width, height } = levelSize(meta, lvl);
	const tileW = meta.tileWidth || 256;
	const tileH = meta.tileHeight || 256;
	const cols = Math.ceil(width / tileW);
	const rows = Math.ceil(height / tileH);
	if (!meta.imageId || cols <= 0 || rows <= 0) {
		throw new Error("Yandex stitch: invalid level size");
	}

	const key = cacheKey(meta.imageId, lvl);
	const hit = stitchCache.get(key);
	if (hit) {
		hit.refs += 1;
		return { url: hit.url, width, height };
	}

	let pending = stitchInflight.get(key);
	if (!pending) {
		pending = (async () => {
			// Canvas sized to Zooms worldSize — last row/col tiles are often shorter
			// than tileH/tileW; draw at natural bitmap size (no stretch).
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("2d unavailable");

			const coords: Array<{ x: number; y: number }> = [];
			for (let y = 0; y < rows; y += 1) {
				for (let x = 0; x < cols; x += 1) {
					coords.push({ x, y });
				}
			}

			let loaded = 0;
			await runConcurrent(
				coords,
				async ({ x, y }) => {
					const bmp = await fetchTileBitmap(yandexPanoTileUrl(meta.imageId, lvl, x, y));
					if (!bmp) return;
					ctx.drawImage(bmp, x * tileW, y * tileH);
					bmp.close();
					loaded += 1;
				},
				{ concurrency: TILE_CONCURRENCY },
			);
			if (loaded === 0) throw new Error("Yandex stitch: no tiles loaded");

			const blob = await new Promise<Blob>((resolve, reject) => {
				canvas.toBlob(
					(b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
					"image/jpeg",
					0.92,
				);
			});
			return URL.createObjectURL(blob);
		})().finally(() => {
			stitchInflight.delete(key);
		});
		stitchInflight.set(key, pending);
	}

	const url = await pending;
	const existing = stitchCache.get(key);
	if (existing) {
		existing.refs += 1;
		return { url: existing.url, width, height };
	}
	stitchCache.set(key, { url, refs: 1 });
	return { url, width, height };
}

export function releaseStitchUrl(url: string): void {
	for (const [key, entry] of stitchCache) {
		if (entry.url !== url) continue;
		entry.refs -= 1;
		if (entry.refs <= 0) {
			stitchCache.delete(key);
			try {
				URL.revokeObjectURL(url);
			} catch {
				/* ignore */
			}
		}
		return;
	}
}

export function clearYandexStitchCache(): void {
	for (const entry of stitchCache.values()) {
		try {
			URL.revokeObjectURL(entry.url);
		} catch {
			/* ignore */
		}
	}
	stitchCache.clear();
	stitchInflight.clear();
}
