/**
 * Yandex Street View render path for single / bulk panorama download.
 * Stitches using Zooms[level] worldSize + Images.Tiles tileSize; bottom-row
 * tiles are often shorter than tileHeight — never stretch them to a full cell.
 *
 * Zoom is reverse vs Google UI: level 0 = sharpest, higher index = coarser.
 */
import type { Location } from "@/bindings.gen";
import { generatePerspectiveFromEquirect } from "@/lib/sv/panoDownloadShared";
import type { PanoDownloadConfig, RenderedPanoImage } from "@/lib/sv/panoDownloadTypes";
import { fetchYandexMeta } from "./api";
import { yandexPanoTileUrl } from "./endpoints";
import { stripYandex } from "./prefix";
import { releaseStitchUrl, stitchYandexLevel } from "./psv/stitch";

async function canvasToBlob(
	canvas: HTMLCanvasElement,
	type: string,
	quality?: number,
): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Map Google UI zoom 1 (coarse) … 5 (sharp) → Yandex Zooms index
 * (0 = sharpest / full res).
 */
export function uiZoomToYandexLevel(uiZoom: number, levelCount: number): number {
	if (levelCount <= 1) return 0;
	const z = Math.min(5, Math.max(1, Math.round(uiZoom)));
	const t = (5 - z) / 4;
	return Math.min(levelCount - 1, Math.max(0, Math.round(t * (levelCount - 1))));
}

async function fetchYandexTileBlob(
	imageId: string,
	level: number,
	x: number,
	y: number,
): Promise<Blob | null> {
	for (let attempt = 0; attempt < 4; attempt += 1) {
		try {
			const resp = await fetch(yandexPanoTileUrl(imageId, level, x, y), {
				signal: AbortSignal.timeout(20_000),
			});
			if (!resp.ok) {
				await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
				continue;
			}
			return new Blob([await resp.arrayBuffer()], { type: "image/jpeg" });
		} catch {
			await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
		}
	}
	return null;
}

/** Stitch Yandex tiles into a full equirect at the highest-res Zooms level. */
export async function stitchYandexPano(panoId: string): Promise<HTMLCanvasElement | null> {
	const oid = stripYandex(panoId);
	if (!oid) return null;
	const meta = await fetchYandexMeta(oid);
	if (!meta?.imageId) return null;

	// Level 0 = full resolution; cols/rows derived from tileWidth/tileHeight inside stitch.
	const { url, width, height } = await stitchYandexLevel(meta, 0);
	try {
		const resp = await fetch(url);
		if (!resp.ok) return null;
		const bmp = await createImageBitmap(await resp.blob());
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			bmp.close();
			return null;
		}
		ctx.drawImage(bmp, 0, 0, width, height);
		bmp.close();
		return canvas;
	} finally {
		releaseStitchUrl(url);
	}
}

export async function renderYandexLocationImage(
	loc: Location,
	panoId: string,
	config: PanoDownloadConfig,
): Promise<RenderedPanoImage | null> {
	const oid = stripYandex(panoId);
	if (!oid) return null;
	const name = oid;

	if (config.mode === "thumbnail") return null;

	if (config.mode === "tile") {
		const meta = await fetchYandexMeta(oid);
		if (!meta?.imageId) return null;
		const level = uiZoomToYandexLevel(config.zoom, meta.zooms.length);
		const blob = await fetchYandexTileBlob(
			meta.imageId,
			level,
			config.tileX,
			config.tileY,
		);
		return blob
			? { blob, fileName: `${name}_z${level}_x${config.tileX}_y${config.tileY}.jpg` }
			: null;
	}

	const canvas = await stitchYandexPano(panoId);
	if (!canvas) return null;

	if (config.mode === "perspective") {
		const perspective = generatePerspectiveFromEquirect(
			canvas,
			125,
			loc.heading,
			loc.pitch,
			1920,
			1080,
		);
		const blob = await canvasToBlob(perspective, "image/png");
		return blob ? { blob, fileName: `${name}.png` } : null;
	}

	const blob = await canvasToBlob(canvas, "image/jpeg", 0.95);
	return blob ? { blob, fileName: `${name}.jpg` } : null;
}
