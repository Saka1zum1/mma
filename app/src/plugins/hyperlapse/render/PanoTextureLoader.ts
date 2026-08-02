import type { Location } from "@/bindings.gen";
import { createLocation } from "@/types";
import { stitchPano } from "@/lib/sv/panoDownload";
import { fetchSvMetadata } from "@/lib/sv/svMeta";
import { stitchBaiduPano } from "@/lib/sv/baidu/panoDownload";
import { stitchTencentPano } from "@/lib/sv/tencent/panoDownload";
import { stitchYandexPano } from "@/lib/sv/yandex/panoDownload";
import { stitchLookaroundPano } from "@/lib/sv/lookaround/panoDownload";
import type { HyperlapseFrame, HyperlapseFrameMeta } from "../types";

/**
 * Cap stitch zoom hard — zoom ≥3 produces multi‑10MB canvases that readily
 * exhaust GPU memory alongside the map / Street View WebGL contexts.
 * Hyperlapse.js defaulted to zoom 1.
 */
export const MAX_PANO_ZOOM = 3;

/** Max equirect width after stitch (RGBA ≈ 16MB at 2048×1024). */
export const MAX_EQUIRECT_WIDTH = 2048;

/** Stitch one frame's equirectangular canvas (or null on failure), then downsample. */
export async function stitchFrameImage(
	meta: HyperlapseFrameMeta,
): Promise<HTMLCanvasElement | null> {
	const zoom = Math.min(meta.zoom, MAX_PANO_ZOOM);
	let image: HTMLCanvasElement | null = null;
	switch (meta.provider) {
		case "baidu":
			image = await stitchBaiduPano(meta.panoId, zoom);
			break;
		case "tencent":
			image = await stitchTencentPano(meta.panoId, zoom);
			break;
		case "yandex":
			image = await stitchYandexPano(meta.panoId);
			break;
		case "apple": {
			const loc = createLocation({
				lat: meta.lat,
				lng: meta.lng,
				heading: meta.heading,
				pitch: meta.pitch,
				zoom,
				panoId: meta.panoId,
				provider: "apple",
			}) as Location;
			image = await stitchLookaroundPano(loc, meta.panoId, zoom);
			break;
		}
		default: {
			const [svMeta] = await fetchSvMetadata([meta.panoId]);
			image = await stitchPano(meta.panoId, svMeta, zoom);
			break;
		}
	}
	if (!image) return null;
	return downsampleEquirect(image, MAX_EQUIRECT_WIDTH);
}

/** Shrink oversized equirects so GPU uploads stay cheap. */
export function downsampleEquirect(
	src: HTMLCanvasElement,
	maxWidth: number,
): HTMLCanvasElement {
	if (src.width <= maxWidth) return src;
	const scale = maxWidth / src.width;
	const dst = document.createElement("canvas");
	dst.width = maxWidth;
	dst.height = Math.max(1, Math.round(src.height * scale));
	const ctx = dst.getContext("2d");
	if (!ctx) {
		releaseCanvas(src);
		return dst;
	}
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "medium";
	ctx.drawImage(src, 0, 0, dst.width, dst.height);
	releaseCanvas(src);
	return dst;
}

/** Release a canvas's pixel buffer so the GC / GPU can reclaim memory. */
export function releaseCanvas(canvas: HTMLCanvasElement | null | undefined) {
	if (!canvas) return;
	try {
		canvas.width = 0;
		canvas.height = 0;
	} catch {
		// ignore
	}
}

export interface LoadTexturesOptions {
	signal?: AbortSignal;
	onProgress?: (loaded: number, total: number) => void;
	concurrency?: number;
	maxFrames?: number;
}

export async function loadFrameTextures(
	metas: HyperlapseFrameMeta[],
	opts: LoadTexturesOptions = {},
): Promise<HyperlapseFrame[]> {
	const maxFrames = opts.maxFrames ?? metas.length;
	const slice = metas.slice(0, maxFrames);
	const concurrency = Math.max(1, opts.concurrency ?? 1);
	const frames: (HyperlapseFrame | null)[] = new Array(slice.length).fill(null);
	let next = 0;
	let loaded = 0;

	async function worker() {
		while (next < slice.length) {
			if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
			const i = next++;
			const meta = slice[i];
			try {
				const image = await stitchFrameImage(meta);
				if (image) frames[i] = { ...meta, image };
			} catch {
				// skip
			}
			loaded++;
			opts.onProgress?.(loaded, slice.length);
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, slice.length) }, () => worker()));
	return frames.filter((f): f is HyperlapseFrame => f != null);
}
