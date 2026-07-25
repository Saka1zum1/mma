/**
 * Equirectangular MultiTiles config for Yandex panoramas.
 *
 * PSV's EquirectangularTilesAdapter requires power-of-2 cols/rows and a full
 * 2:1 sphere grid, while Yandex publishes arbitrary Zooms sizes (e.g. 69×25
 * tiles at 256px). We keep each level's `width` exactly from Zooms, pick the
 * nearest valid power-of-2 grid, and composite native tiles into each virtual
 * cell on demand (only visible tiles are fetched).
 */
import type { YandexPanoMeta } from "../api";
import { yandexPanoTileUrl } from "../endpoints";
import { buildYandexPanoData, coarsestLevel, levelSize } from "./panoData";
import { releaseStitchUrl, stitchYandexLevel } from "./stitch";

const SPHERE_RESOLUTION = 128;

export type YandexTileLevel = {
	/** Exact Zooms[level].width — full 360° texture width at this resolution. */
	width: number;
	cols: number;
	rows: number;
	/** Native Yandex zoom index (0 = full res). */
	yandexLevel: number;
	/** Exact Zooms[level].height — content strip height. */
	contentHeight: number;
};

export type YandexTilesPanorama = {
	baseUrl: string;
	basePanoData: ReturnType<typeof buildYandexPanoData>;
	levels: Array<{ width: number; cols: number; rows: number }>;
	tileUrl: (col: number, row: number, level: number) => string | null;
	/** Drop blob URLs / in-flight work for this panorama. */
	dispose: () => void;
	/** Kick adapter refresh after a deferred composite finishes. */
	setRefresh: (fn: (col: number, row: number, level: number) => void) => void;
};

function nextPow2(n: number): number {
	let p = 1;
	while (p < n) p *= 2;
	return p;
}

/** Largest power-of-2 cols ≤ resolution that can represent nativeCols well. */
function pickCols(nativeCols: number, resolution: number): number {
	const target = Math.max(2, nativeCols);
	let cols = nextPow2(target);
	if (cols > resolution) cols = resolution;
	// Prefer fewer, slightly larger tiles when native is just above a pow2
	// (e.g. 69 → 64 instead of 128) for fewer composites per view.
	const lower = cols >= 4 ? cols / 2 : cols;
	if (lower >= 2 && target - lower <= cols - target && lower <= resolution) {
		return lower;
	}
	return Math.max(2, cols);
}

/**
 * Pick a base stitch level: sharp enough to avoid the thumbnail (z4≈512) blur,
 * but small enough to stitch quickly. Never use the tiniest zoom as the only
 * visible texture during navigation.
 */
function pickBaseLevel(meta: YandexPanoMeta): number {
	const maxIdx = coarsestLevel(meta);
	// Prefer ~1k–4k wide levels (typically yandex z2/z3), fall back to coarsest.
	for (let i = maxIdx; i >= 0; i -= 1) {
		const w = levelSize(meta, i).width;
		if (w >= 1024 && w <= 4096) return i;
	}
	return Math.max(0, maxIdx - 1);
}

async function fetchTileBitmap(url: string): Promise<ImageBitmap | null> {
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
			if (!resp.ok) continue;
			return await createImageBitmap(await resp.blob());
		} catch {
			/* retry */
		}
	}
	return null;
}

function buildLevelConfigs(meta: YandexPanoMeta): YandexTileLevel[] {
	const tw = meta.tileWidth || 256;
	const baseLevel = pickBaseLevel(meta);
	// Coarse thumbnail levels (yandex z3/z4) are stitch-only for baseUrl —
	// putting them in MultiTiles yields rows=1 / tiny grids that PSV projects
	// incorrectly during load and transitions.
	return meta.zooms
		.map((z, yandexLevel) => {
			const nativeCols = Math.ceil(z.width / tw);
			const cols = pickCols(nativeCols, SPHERE_RESOLUTION);
			// PSV tile grids need rows ≥ 2 (full-sphere vertical split).
			const rows = Math.max(2, cols / 2);
			return {
				width: z.width,
				cols,
				rows,
				yandexLevel,
				contentHeight: z.height,
			};
		})
		.filter(
			(l) =>
				l.yandexLevel < baseLevel &&
				l.width >= 2048 &&
				l.cols >= 4 &&
				l.rows >= 2,
		);
}

/**
 * Build MultiTiles panorama. Levels are sorted ascending by width for PSV.
 * `tileUrl` returns a CDN/blob URL synchronously once ready; on first request
 * it returns null (PSV falls back to a coarser level) and composites in the
 * background, then calls `refresh` so the adapter re-requests the tile.
 */
export async function buildYandexTilesPanorama(
	meta: YandexPanoMeta,
): Promise<YandexTilesPanorama> {
	const levelsRaw = buildLevelConfigs(meta);
	// If filtering removed everything (unusual short pyramid), keep finest level.
	const forTiles =
		levelsRaw.length > 0
			? levelsRaw
			: (() => {
					const tw = meta.tileWidth || 256;
					const z = meta.zooms[0];
					if (!z) return [] as YandexTileLevel[];
					const cols = pickCols(Math.ceil(z.width / tw), SPHERE_RESOLUTION);
					return [
						{
							width: z.width,
							cols,
							rows: Math.max(2, cols / 2),
							yandexLevel: 0,
							contentHeight: z.height,
						},
					];
				})();
	// PSV sorts by width ascending; keep a parallel map for yandex metadata.
	const sorted = [...forTiles].sort((a, b) => a.width - b.width);
	const baseIdx = pickBaseLevel(meta);
	const baseSize = levelSize(meta, baseIdx);
	const base = await stitchYandexLevel(meta, baseIdx);
	const basePanoData = buildYandexPanoData(meta, baseSize.width, baseSize.height);

	const blobCache = new Map<string, string>();
	const inflight = new Map<string, Promise<void>>();
	let refresh: ((col: number, row: number, level: number) => void) | null = null;
	let disposed = false;

	const tileW = meta.tileWidth || 256;
	const tileH = meta.tileHeight || 256;

	async function composite(
		lvl: YandexTileLevel,
		col: number,
		row: number,
	): Promise<string | null> {
		const pano = buildYandexPanoData(meta, lvl.width, lvl.contentHeight);
		const colSize = lvl.width / lvl.cols;
		const rowSize = lvl.width / 2 / lvl.rows;
		const canvasW = Math.max(1, Math.round(colSize));
		const canvasH = Math.max(1, Math.round(rowSize));

		const contentX0 = col * colSize;
		const contentY0 = row * rowSize - pano.croppedY;
		const contentX1 = contentX0 + colSize;
		const contentY1 = contentY0 + rowSize;

		// Reject tiles that miss the content strip entirely.
		if (contentY1 <= 0 || contentY0 >= lvl.contentHeight) return null;
		if (contentX1 <= 0 || contentX0 >= lvl.width) return null;

		const tx0 = Math.floor(Math.max(0, contentX0) / tileW);
		const ty0 = Math.floor(Math.max(0, contentY0) / tileH);
		const tx1 = Math.floor((Math.min(lvl.width, contentX1) - 1e-6) / tileW);
		const ty1 = Math.floor((Math.min(lvl.contentHeight, contentY1) - 1e-6) / tileH);
		const maxTx = Math.ceil(lvl.width / tileW) - 1;
		const maxTy = Math.ceil(lvl.contentHeight / tileH) - 1;

		const canvas = document.createElement("canvas");
		canvas.width = canvasW;
		canvas.height = canvasH;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;

		const jobs: Promise<void>[] = [];
		for (let ty = ty0; ty <= Math.min(maxTy, Math.floor(ty1)); ty += 1) {
			for (let tx = tx0; tx <= Math.min(maxTx, Math.floor(tx1)); tx += 1) {
				jobs.push(
					(async () => {
						const bmp = await fetchTileBitmap(
							yandexPanoTileUrl(meta.imageId, lvl.yandexLevel, tx, ty),
						);
						if (!bmp || disposed) return;
						const destX = tx * tileW - contentX0;
						const destY = ty * tileH - contentY0;
						ctx.drawImage(bmp, destX, destY);
						bmp.close();
					})(),
				);
			}
		}
		await Promise.all(jobs);
		if (disposed) return null;

		const blob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9);
		});
		if (!blob) return null;
		return URL.createObjectURL(blob);
	}

	const tileUrl = (col: number, row: number, level: number): string | null => {
		if (disposed) return null;
		const lvl = sorted[level];
		if (!lvl) return null;
		if (col < 0 || row < 0 || col >= lvl.cols || row >= lvl.rows) return null;

		const pano = buildYandexPanoData(meta, lvl.width, lvl.contentHeight);
		const rowSize = lvl.width / 2 / lvl.rows;
		const py = row * rowSize;
		const croppedY = pano.croppedY ?? 0;
		const croppedH = pano.croppedHeight ?? lvl.contentHeight;
		if (py + rowSize <= croppedY || py >= croppedY + croppedH) {
			return null;
		}

		const key = `${lvl.yandexLevel}:${col}:${row}`;
		const hit = blobCache.get(key);
		if (hit) return hit;

		if (!inflight.has(key)) {
			const work = composite(lvl, col, row)
				.then((url) => {
					if (disposed) {
						if (url) URL.revokeObjectURL(url);
						return;
					}
					if (url) {
						blobCache.set(key, url);
						refresh?.(col, row, level);
					}
				})
				.finally(() => {
					inflight.delete(key);
				});
			inflight.set(key, work);
		}
		return null;
	};

	return {
		baseUrl: base.url,
		basePanoData,
		levels: sorted.map((l) => ({
			width: l.width,
			cols: l.cols,
			rows: l.rows,
		})),
		tileUrl,
		setRefresh(fn) {
			refresh = fn;
		},
		dispose() {
			disposed = true;
			refresh = null;
			for (const url of blobCache.values()) {
				try {
					URL.revokeObjectURL(url);
				} catch {
					/* ignore */
				}
			}
			blobCache.clear();
			inflight.clear();
			releaseStitchUrl(base.url);
		},
	};
}

export { SPHERE_RESOLUTION };
