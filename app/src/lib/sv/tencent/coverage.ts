/**
 * Tencent Street View blue-line coverage from PMTiles vector layers (`sv`, `ccf`).
 *
 * Perf (no tile/canvas caches — those clone/retain work fights zoom):
 * - Single ImageMapType paints both layers in one pass (shared fetch + parse)
 * - Bounded paint concurrency + time-budget yields (not rAF-per-chunk)
 * - Inflight decode sharing for concurrent overzoom children of one source tile
 * - Zoom-aware feature stride (low-z samples evenly instead of truncating)
 * - Sub-tile bbox cull + sub-pixel vertex simplify before Path2D
 * - Fire "load" immediately so the composite stack is not blocked
 */
import type { VectorTile } from "@mapbox/vector-tile";
import { PMTiles } from "pmtiles";
import { google } from "@/lib/sv/opensv";
import {
	getProviderSettings,
	isProviderEnabled,
	subscribeProvidersSettings,
} from "@/lib/sv/providers/settings";
import {
	bumpProviderCoverageLayers,
	registerProviderLineLayers,
} from "@/lib/sv/providers/coverageLayers";
import { vectorTileFromBytes } from "@/lib/sv/providers/pbfCompat";
import { TENCENT_COVERAGE_PMTILES } from "./endpoints";

const TILE = 256;
/** Below this zoom, skip PMTiles entirely — too many line features per tile. */
const MIN_COVERAGE_Z = 5;
const MAX_COVERAGE_Z = 20;
/** Cap overzoom parent fetches so we never paint a z≤7 archive tile into a viewport. */
const MIN_SOURCE_Z = 5;
const LAYER_NAMES = ["sv", "ccf"] as const;
/** Safety cap after stride sampling (avoids pathological tiles). */
const MAX_VERTICES = 48_000;
/** Work this many ms on the main thread before yielding. */
const PAINT_SLICE_MS = 8;
/** Parallel tile paints — high enough for viewport fill, low enough to keep zoom fluid. */
const PAINT_CONCURRENCY = 4;

/** Evenly sample features so low-z tiles stay dense across the whole tile. */
function featureStride(featureCount: number, zoom: number): number {
	const target =
		zoom <= 5 ? 10_000 : zoom <= 6 ? 12_000 : zoom <= 7 ? 14_000 : zoom <= 8 ? 16_000 : zoom <= 10 ? 20_000 : zoom <= 12 ? 24_000 : featureCount;
	return Math.max(1, Math.ceil(featureCount / Math.max(1, target)));
}

function simplifyPx(zoom: number, dz: number): number {
	// Stronger simplify at low zoom — fewer verts, more features kept via stride.
	const screenPx = zoom <= 6 ? 2.5 : zoom <= 8 ? 1.5 : zoom <= 10 ? 1 : zoom <= 12 ? 0.75 : 0.5;
	return screenPx / Math.max(1, 2 ** Math.min(dz, 3));
}

type DecodedMvt = { tile: VectorTile };

const mvtInflight = new Map<string, Promise<DecodedMvt | null>>();

let pmtiles: PMTiles | null = null;
let headerReady: Promise<{ maxZoom: number; minZoom: number }> | null = null;

function getPmtiles(): PMTiles {
	if (!pmtiles) pmtiles = new PMTiles(TENCENT_COVERAGE_PMTILES);
	return pmtiles;
}

function getHeader(): Promise<{ maxZoom: number; minZoom: number }> {
	if (!headerReady) {
		headerReady = getPmtiles()
			.getHeader()
			.then((h) => ({ maxZoom: h.maxZoom, minZoom: h.minZoom }));
	}
	// Mutable `let` is not narrowed after assignment; non-null is guaranteed above.
	return headerReady!;
}

let settingsUnsub: (() => void) | null = null;
let registryUnsub: (() => void) | null = null;
let styleGen = 0;

type PaintJob = {
	run: () => Promise<void>;
	signal: AbortSignal;
};

const paintQueue: PaintJob[] = [];
let paintActive = 0;

function pumpPaintQueue(): void {
	while (paintActive < PAINT_CONCURRENCY && paintQueue.length > 0) {
		const job = paintQueue.shift()!;
		if (job.signal.aborted) continue;
		paintActive += 1;
		void job
			.run()
			.catch(() => {
				/* ignore abort / decode errors */
			})
			.finally(() => {
				paintActive -= 1;
				pumpPaintQueue();
			});
	}
}

function enqueuePaint(signal: AbortSignal, run: () => Promise<void>): void {
	if (signal.aborted) return;
	// Drop tiles released during zoom so the queue doesn't grow unbounded.
	for (let i = paintQueue.length - 1; i >= 0; i -= 1) {
		if (paintQueue[i]!.signal.aborted) paintQueue.splice(i, 1);
	}
	paintQueue.push({ run, signal });
	pumpPaintQueue();
}

/** Yield without waiting a full animation frame (rAF was the main load-speed killer). */
function yieldToBrowser(): Promise<void> {
	const sched = (globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } })
		.scheduler;
	if (sched?.yield) return sched.yield();
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

function parseRgb(color: string): { r: number; g: number; b: number } | null {
	const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
	if (!m) return null;
	return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

function triggerTileLoad(el: Element): void {
	queueMicrotask(() => {
		try {
			google.maps.event.trigger(el, "load");
		} catch {
			/* ignore */
		}
	});
}

async function fetchMvt(
	z: number,
	x: number,
	y: number,
	signal: AbortSignal,
): Promise<DecodedMvt | null> {
	const key = `${z}/${x}/${y}`;
	const pending = mvtInflight.get(key);
	if (pending) {
		const decoded = await pending;
		if (signal.aborted) return null;
		return decoded;
	}

	const work = (async (): Promise<DecodedMvt | null> => {
		try {
			// No per-tile AbortSignal: overzoom siblings share this fetch; one
			// released child must not cancel the parent tile for the rest.
			const result = await getPmtiles().getZxy(z, x, y);
			if (!result?.data) return null;
			const raw = result.data as ArrayBuffer | Uint8Array;
			const bytes =
				raw instanceof ArrayBuffer
					? new Uint8Array(raw)
					: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
			return { tile: vectorTileFromBytes(bytes) };
		} catch {
			return null;
		} finally {
			mvtInflight.delete(key);
		}
	})();

	mvtInflight.set(key, work);
	const decoded = await work;
	if (signal.aborted) return null;
	return decoded;
}

function resolveSourceTile(
	coordX: number,
	coordY: number,
	zoom: number,
	headerMax: number,
	headerMin: number,
): { z: number; x: number; y: number; dz: number } {
	let z = zoom;
	let x = coordX;
	let y = coordY;
	const floor = Math.max(MIN_SOURCE_Z, headerMin);
	while (z > headerMax) {
		z -= 1;
		x = Math.floor(x / 2);
		y = Math.floor(y / 2);
	}
	// Caller skips when z < MIN_SOURCE_Z; floor keeps headerMin in the contract.
	if (z < floor) return { z, x, y, dz: zoom - z };
	return { z, x, y, dz: zoom - z };
}

function lineOutsideBBox(
	line: Array<{ x: number; y: number }>,
	minX: number,
	minY: number,
	maxX: number,
	maxY: number,
): boolean {
	let sawInside = false;
	for (let i = 0; i < line.length; i += 1) {
		const p = line[i]!;
		if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
			sawInside = true;
			break;
		}
	}
	if (sawInside) return false;
	// Keep lines that cross the tile even if endpoints are outside (cheap segment test).
	for (let i = 1; i < line.length; i += 1) {
		const a = line[i - 1]!;
		const b = line[i]!;
		if (a.x < minX && b.x < minX) continue;
		if (a.x > maxX && b.x > maxX) continue;
		if (a.y < minY && b.y < minY) continue;
		if (a.y > maxY && b.y > maxY) continue;
		return false;
	}
	return true;
}

async function paintMvt(
	canvas: HTMLCanvasElement,
	decoded: DecodedMvt,
	coordX: number,
	coordY: number,
	zoom: number,
	srcZ: number,
	srcX: number,
	srcY: number,
	strokeStyle: string,
	lineWidthScale: number,
	signal: AbortSignal,
): Promise<void> {
	const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
	if (!ctx || signal.aborted) return;

	const { tile } = decoded;
	const dz = zoom - srcZ;
	const layerSize = (() => {
		for (const name of LAYER_NAMES) {
			const layer = tile.layers[name];
			if (layer) return layer.extent;
		}
		return 4096;
	})();

	const scale = layerSize / TILE / 2 ** Math.max(0, dz);
	// Slightly thicker at low zoom so sparse samples still read as coverage.
	const widthBoost = zoom <= 7 ? 1.35 : zoom <= 9 ? 1.15 : 1;
	const lineWidth = Math.max(1, 1.75 * scale * lineWidthScale * widthBoost);
	const minDist = Math.max(1, (layerSize / TILE) * simplifyPx(zoom, dz));
	const minDist2 = minDist * minDist;

	let minX = -Infinity;
	let minY = -Infinity;
	let maxX = Infinity;
	let maxY = Infinity;
	if (dz > 0) {
		const span = layerSize / 2 ** dz;
		const dx = coordX - srcX * 2 ** dz;
		const dy = coordY - srcY * 2 ** dz;
		// Small pad so strokes near edges aren't culled.
		const pad = minDist * 2;
		minX = dx * span - pad;
		minY = dy * span - pad;
		maxX = (dx + 1) * span + pad;
		maxY = (dy + 1) * span + pad;
	}

	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	if (dz === 0) {
		ctx.scale(canvas.width / layerSize, canvas.height / layerSize);
	} else {
		const dx = coordX - srcX * 2 ** dz;
		const dy = coordY - srcY * 2 ** dz;
		ctx.scale((canvas.width / layerSize) * 2 ** dz, (canvas.height / layerSize) * 2 ** dz);
		ctx.translate(-dx * (layerSize / 2 ** dz), -dy * (layerSize / 2 ** dz));
	}

	const path = new Path2D();
	let vertices = 0;
	let sliceDeadline = performance.now() + PAINT_SLICE_MS;

	outer: for (const layerName of LAYER_NAMES) {
		const vectorLayer = tile.layers[layerName];
		if (!vectorLayer) continue;
		const len = vectorLayer.length;
		const stride = featureStride(len, zoom);
		for (let i = 0; i < len; i += stride) {
			if (signal.aborted) return;
			if (performance.now() >= sliceDeadline) {
				await yieldToBrowser();
				if (signal.aborted) return;
				sliceDeadline = performance.now() + PAINT_SLICE_MS;
			}

			const feature = vectorLayer.feature(i);
			if (feature.type !== 2) continue;
			const geom = feature.loadGeometry();
			for (const line of geom) {
				if (line.length < 2) continue;
				if (dz > 0 && lineOutsideBBox(line, minX, minY, maxX, maxY)) continue;

				let moved = false;
				let lastX = 0;
				let lastY = 0;
				for (let j = 0; j < line.length; j += 1) {
					const p = line[j]!;
					if (moved) {
						const ddx = p.x - lastX;
						const ddy = p.y - lastY;
						if (ddx * ddx + ddy * ddy < minDist2 && j !== line.length - 1) {
							continue;
						}
						path.lineTo(p.x, p.y);
						vertices += 1;
					} else {
						path.moveTo(p.x, p.y);
						moved = true;
						vertices += 1;
					}
					lastX = p.x;
					lastY = p.y;
					if (vertices >= MAX_VERTICES) break outer;
				}
			}
		}
	}

	if (signal.aborted || vertices === 0) return;

	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.lineWidth = lineWidth;
	ctx.strokeStyle = strokeStyle;
	ctx.stroke(path);
}

function createTencentLineLayer(): google.maps.ImageMapType {
	const controllers = new WeakMap<Element, AbortController>();
	const s = getProviderSettings("tencent");
	const fillRgb = parseRgb(s.lineColor) ?? { r: 0, g: 81, b: 218 };
	const strokeStyle = `rgb(${fillRgb.r}, ${fillRgb.g}, ${fillRgb.b})`;
	const lineWidthScale = Math.max(0.25, s.lineWidthScale);
	void styleGen;

	const layer = new google.maps.ImageMapType({
		name: "Tencent SV lines",
		alt: "Tencent Street View coverage",
		minZoom: MIN_COVERAGE_Z,
		maxZoom: MAX_COVERAGE_Z,
		opacity: s.lineOpacity,
		tileSize: new google.maps.Size(TILE, TILE),
		getTileUrl: () => "",
	});

	layer.getTile = (coord, zoom, ownerDocument) => {
		if (!coord || !ownerDocument) return null as unknown as Element;

		const wrap = ownerDocument.createElement("div");
		wrap.style.width = `${TILE}px`;
		wrap.style.height = `${TILE}px`;
		wrap.style.position = "absolute";
		wrap.style.left = "0";
		wrap.style.top = "0";
		wrap.style.opacity = String(getProviderSettings("tencent").lineOpacity);

		triggerTileLoad(wrap);

		if (zoom < MIN_COVERAGE_Z || zoom > MAX_COVERAGE_Z) {
			return wrap;
		}

		const canvas = ownerDocument.createElement("canvas");
		canvas.width = TILE;
		canvas.height = TILE;
		canvas.style.width = `${TILE}px`;
		canvas.style.height = `${TILE}px`;
		canvas.style.position = "absolute";
		canvas.style.left = "0";
		canvas.style.top = "0";
		wrap.appendChild(canvas);

		const controller = new AbortController();
		controllers.set(wrap, controller);
		const { signal } = controller;

		// Fetch in parallel; only serialize CPU-heavy parse/paint on the queue.
		void getHeader()
			.then((header) => {
				if (signal.aborted) return null;
				const src = resolveSourceTile(
					coord.x,
					coord.y,
					zoom,
					header.maxZoom,
					header.minZoom,
				);
				if (src.z < MIN_SOURCE_Z) return null;
				return fetchMvt(src.z, src.x, src.y, signal).then((decoded) =>
					decoded ? { decoded, src } : null,
				);
			})
			.then((payload) => {
				if (signal.aborted || !payload) return;
				enqueuePaint(signal, async () => {
					if (signal.aborted) return;
					await paintMvt(
						canvas,
						payload.decoded,
						coord.x,
						coord.y,
						zoom,
						payload.src.z,
						payload.src.x,
						payload.src.y,
						strokeStyle,
						lineWidthScale,
						signal,
					);
				});
			})
			.catch(() => {
				/* ignore abort / network errors */
			});

		return wrap;
	};

	layer.releaseTile = (tile) => {
		const controller = controllers.get(tile as Element);
		if (controller) {
			controller.abort();
			controllers.delete(tile as Element);
		}
	};

	return layer;
}

export function createTencentLineLayers(): google.maps.ImageMapType[] {
	if (!isProviderEnabled("tencent") || !getProviderSettings("tencent").showLines) return [];
	if (typeof google === "undefined" || !google?.maps?.ImageMapType) return [];
	return [createTencentLineLayer()];
}

export function rebuildTencentStyledLayers(): void {
	styleGen++;
	// Drop queued paints from the previous style generation.
	paintQueue.length = 0;
	bumpProviderCoverageLayers();
}

export function initTencentCoverage(): () => void {
	settingsUnsub?.();
	settingsUnsub = subscribeProvidersSettings(() => {
		rebuildTencentStyledLayers();
	});

	registryUnsub?.();
	registryUnsub = registerProviderLineLayers(createTencentLineLayers);

	return () => {
		settingsUnsub?.();
		settingsUnsub = null;
		registryUnsub?.();
		registryUnsub = null;
		paintQueue.length = 0;
	};
}
