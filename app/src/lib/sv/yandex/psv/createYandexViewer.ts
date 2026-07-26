/**
 * Photo Sphere Viewer for Yandex Street View.
 * MultiTiles on-demand loading (exact Zooms/Tiles sizes), Look Around
 * MovementPlugin markers (Yandex theme), cursor-anchored zoom.
 *
 * Orientation: keep the equirect texture in PSV's native frame (image centre
 * = yaw 0). Compass ↔ yaw is handled via meta.heading (see orientation.ts);
 * MovementPlugin gets yawNorthOffset so ENU link markers match the roads.
 */
import { Viewer } from "@photo-sphere-viewer/core";
import { EquirectangularTilesAdapter } from "@photo-sphere-viewer/equirectangular-tiles-adapter";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";

import type { LookaroundPano } from "@/lib/sv/lookaround/api";
import { installCursorAnchoredZoom } from "@/lib/sv/lookaround/psv/cursorAnchoredZoom";
import { YANDEX_MOVEMENT_MARKER_URL } from "@/lib/sv/lookaround/psv/marker";
import { MovementPlugin } from "@/lib/sv/lookaround/psv/MovementPlugin";

import type { YandexLink, YandexPanoMeta } from "../api";
import { fetchYandexMeta } from "../api";
import {
	ensureYandexCrossfadeCanvas,
	runYandexNavigationCrossfade,
} from "./navigationCrossfade";
import { compassToPsvYaw, psvYawToCompass, yandexYawNorthOffsetRad } from "./orientation";
import { buildYandexTilesPanorama, SPHERE_RESOLUTION, type YandexTilesPanorama } from "./tiles";

const NAV_CROSSFADE_MS = 150;

export type YandexViewerHandle = {
	viewer: Viewer;
	currentMeta: YandexPanoMeta;
	navigateTo(meta: YandexPanoMeta, resetView?: boolean): Promise<void>;
	destroy(): void;
	getPosition(): { yaw: number; pitch: number };
	getZoomLevel(): number;
	rotate(position: { yaw: number; pitch: number }): void;
	zoom(level: number): void;
	addEventListener(name: string, cb: (...args: unknown[]) => void): void;
	removeEventListener(name: string, cb: (...args: unknown[]) => void): void;
	onMetaChanged: ((meta: YandexPanoMeta) => void) | null;
};

type TilesViewer = Viewer & {
	navigateTo: (pano: LookaroundPano) => Promise<void>;
	plugins: {
		movement?: MovementPlugin;
		markers?: MarkersPlugin;
	};
	adapter: {
		__refresh?: () => void;
		state?: { tiles?: Record<string, unknown> };
	};
};

function ensurePsvCssVars(container: HTMLElement): void {
	container.style.setProperty("--psv-core-loaded", "true");
	container.style.setProperty("--psv-markers-plugin-loaded", "true");
}

/** Place a virtual point ~12 m along compass heading when Graph coords are missing. */
function projectAlongHeading(
	lat: number,
	lng: number,
	headingDeg: number,
	distM: number,
): { lat: number; lng: number } {
	const R = 6_371_000;
	const δ = distM / R;
	const θ = (headingDeg * Math.PI) / 180;
	const φ1 = (lat * Math.PI) / 180;
	const λ1 = (lng * Math.PI) / 180;
	const φ2 = Math.asin(
		Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
	);
	const λ2 =
		λ1 +
		Math.atan2(
			Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
			Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
		);
	return { lat: (φ2 * 180) / Math.PI, lng: (((λ2 * 180) / Math.PI + 540) % 360) - 180 };
}

const JUMP_MAX_M = 100;
const JUMP_PROJECT_M = 12;

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
	const R = 6_371_000;
	const φ1 = (aLat * Math.PI) / 180;
	const φ2 = (bLat * Math.PI) / 180;
	const dφ = ((bLat - aLat) * Math.PI) / 180;
	const dλ = ((bLng - aLng) * Math.PI) / 180;
	const s =
		Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function linkToLookaround(link: YandexLink, ref: YandexPanoMeta): LookaroundPano {
	let { lat, lng } = link;
	const geoDist = haversineM(ref.lat, ref.lng, lat, lng);
	// Missing / coincident / too-far Graph coords → project a short hop along
	// link heading so MovementPlugin can place an on-screen jump marker.
	if (
		Number.isFinite(link.heading) &&
		(geoDist < 0.5 || geoDist > JUMP_MAX_M || (lat === ref.lat && lng === ref.lng))
	) {
		const p = projectAlongHeading(ref.lat, ref.lng, link.heading, JUMP_PROJECT_M);
		lat = p.lat;
		lng = p.lng;
	}
	return {
		panoid: link.oid,
		buildId: "yandex",
		lat,
		lon: lng,
		elevation: 0,
		heading: link.heading,
	};
}

function nearbyForMovement(meta: YandexPanoMeta): LookaroundPano[] {
	// Prefer Thoroughfare links (short hops); Graph nodes can be far away.
	const byOid = new Map<string, LookaroundPano>();
	const consider = (link: YandexLink, prefer: boolean) => {
		if (!link.oid || link.oid === meta.id) return;
		const cand = linkToLookaround(link, meta);
		const dist = haversineM(meta.lat, meta.lng, cand.lat, cand.lon);
		if (dist > JUMP_MAX_M || dist < 0.5) return;
		const prev = byOid.get(link.oid);
		if (!prev) {
			byOid.set(link.oid, cand);
			return;
		}
		const prevDist = haversineM(meta.lat, meta.lng, prev.lat, prev.lon);
		if (prefer || dist < prevDist) byOid.set(link.oid, cand);
	};
	for (const l of meta.links) consider(l, true);
	for (const l of meta.neighbors) consider(l, false);
	return [...byOid.values()];
}

function getMovementPlugin(viewer: TilesViewer): MovementPlugin | null {
	const v = viewer as TilesViewer & {
		getPlugin?: (id: string | typeof MovementPlugin) => MovementPlugin | null;
	};
	try {
		return (
			v.getPlugin?.(MovementPlugin) ??
			v.getPlugin?.("movement") ??
			viewer.plugins.movement ??
			null
		);
	} catch {
		return viewer.plugins.movement ?? null;
	}
}

async function waitForMovementPlugin(viewer: TilesViewer): Promise<MovementPlugin | null> {
	const existing = getMovementPlugin(viewer);
	if (existing) return existing;
	await new Promise<void>((resolve) => {
		if (getMovementPlugin(viewer)) {
			resolve();
			return;
		}
		const onReady = () => {
			viewer.removeEventListener("ready", onReady);
			resolve();
		};
		viewer.addEventListener("ready", onReady);
		window.setTimeout(() => {
			viewer.removeEventListener("ready", onReady);
			resolve();
		}, 3000);
	});
	return getMovementPlugin(viewer);
}

function refLookaround(meta: YandexPanoMeta): LookaroundPano {
	return {
		panoid: meta.id,
		buildId: "yandex",
		lat: meta.lat,
		lon: meta.lng,
		elevation: 0,
		heading: meta.heading,
		timestamp: meta.captureDate.getTime(),
	};
}

function panoramaPayload(tiles: YandexTilesPanorama) {
	return {
		baseUrl: tiles.baseUrl,
		basePanoData: tiles.basePanoData,
		levels: tiles.levels,
		tileUrl: tiles.tileUrl,
	};
}

function wireTileRefresh(viewer: TilesViewer, tiles: YandexTilesPanorama): void {
	tiles.setRefresh((col, row, level) => {
		const adapter = viewer.adapter;
		if (!adapter?.__refresh) return;
		const id = `${col}x${row}/${level}`;
		if (adapter.state?.tiles) delete adapter.state.tiles[id];
		adapter.__refresh();
	});
}

async function applyOrientation(viewer: TilesViewer, meta: YandexPanoMeta): Promise<void> {
	const movement = await waitForMovementPlugin(viewer);
	if (!movement) return;
	const offset = yandexYawNorthOffsetRad(meta.heading);
	movement.setYawNorthOffset(offset);
	movement.updatePanoMarkers(refLookaround(meta), nearbyForMovement(meta));
}

/** Click-to-go by compass heading when geo markers miss (cropped sphere / empty Graph). */
function closestLinkByClickYaw(meta: YandexPanoMeta, clickYawRad: number): YandexLink | null {
	const clickCompass = psvYawToCompass(clickYawRad, meta.heading);
	const src = [...meta.links, ...meta.neighbors];
	let best: YandexLink | null = null;
	let bestDiff = 40;
	for (const l of src) {
		if (!l.oid || l.oid === meta.id || !Number.isFinite(l.heading)) continue;
		const diff = Math.abs(((l.heading - clickCompass + 540) % 360) - 180);
		if (diff < bestDiff) {
			bestDiff = diff;
			best = l;
		}
	}
	return best;
}

export async function createYandexViewer(
	container: HTMLElement,
	initial: YandexPanoMeta,
): Promise<YandexViewerHandle> {
	ensurePsvCssVars(container);
	container.replaceChildren();
	ensurePsvCssVars(container);

	let currentMeta = initial;
	let currentTiles: YandexTilesPanorama | null = null;
	let destroyed = false;
	let loadGen = 0;

	const handle: YandexViewerHandle = {
		viewer: null as unknown as Viewer,
		get currentMeta() {
			return currentMeta;
		},
		onMetaChanged: null,
		async navigateTo(meta, resetView = false) {
			const gen = ++loadGen;
			const viewer = handle.viewer as TilesViewer;
			// Preserve compass heading across hops: yaw 0 is image-centre, so keeping
			// the previous PSV yaw would rotate the world when meta.heading changes.
			const prevPos = viewer.getPosition();
			const keepCompass = psvYawToCompass(prevPos.yaw, currentMeta.heading);
			const keepPitch = prevPos.pitch;
			const next = await buildYandexTilesPanorama(meta);
			if (destroyed || gen !== loadGen) {
				next.dispose();
				return;
			}
			if (!resetView) {
				runYandexNavigationCrossfade(container, NAV_CROSSFADE_MS);
			}
			await viewer.setPanorama(panoramaPayload(next), {
				transition: false,
				showLoader: false,
				position: resetView
					? { yaw: 0, pitch: 0 }
					: { yaw: compassToPsvYaw(keepCompass, meta.heading), pitch: keepPitch },
			});
			if (destroyed || gen !== loadGen) {
				next.dispose();
				return;
			}
			currentTiles?.dispose();
			currentTiles = next;
			wireTileRefresh(viewer, next);
			currentMeta = meta;
			await applyOrientation(viewer, meta);
			container.focus({ preventScroll: true });
			handle.onMetaChanged?.(meta);
		},
		destroy() {
			destroyed = true;
			loadGen += 1;
			try {
				handle.viewer.destroy();
			} catch {
				/* ignore */
			}
			currentTiles?.dispose();
			currentTiles = null;
		},
		getPosition() {
			return handle.viewer.getPosition();
		},
		getZoomLevel() {
			return handle.viewer.getZoomLevel();
		},
		rotate(position: { yaw: number; pitch: number }) {
			handle.viewer.rotate(position);
		},
		zoom(level) {
			handle.viewer.zoom(level);
		},
		addEventListener(name, cb) {
			handle.viewer.addEventListener(name as never, cb as never);
		},
		removeEventListener(name, cb) {
			handle.viewer.removeEventListener(name as never, cb as never);
		},
	};

	const firstTiles = await buildYandexTilesPanorama(initial);
	currentTiles = firstTiles;

	const viewer = new Viewer({
		container,
		adapter: EquirectangularTilesAdapter.withConfig({
			resolution: SPHERE_RESOLUTION,
			showErrorTile: false,
			baseBlur: false,
			antialias: true,
		}),
		panorama: panoramaPayload(firstTiles),
		defaultYaw: 0,
		defaultPitch: 0,
		defaultZoomLvl: 50,
		minFov: 30,
		maxFov: 90,
		navbar: false,
		loadingTxt: "",
		touchmoveTwoFingers: false,
		mousewheelCtrlKey: false,
		mousewheel: false,
		plugins: [
			[MarkersPlugin, {}],
			[
				MovementPlugin,
				{
					canMoveWithKeyboard: true,
					markerImage: YANDEX_MOVEMENT_MARKER_URL,
					yawNorthOffset: yandexYawNorthOffsetRad(initial.heading),
				},
			],
		] as never,
	}) as TilesViewer;
	handle.viewer = viewer;

	// Look Around parity: focusable host so MovementPlugin keydown on psv.parent works.
	container.tabIndex = -1;
	container.focus({ preventScroll: true });

	ensureYandexCrossfadeCanvas(container);
	installCursorAnchoredZoom(viewer);
	wireTileRefresh(viewer, firstTiles);

	// MovementPlugin click/keyboard jump entry — same contract as Look Around.
	viewer.navigateTo = async (pano) => {
		if (destroyed) return;
		const meta = await fetchYandexMeta(pano.panoid);
		if (meta && !destroyed) await handle.navigateTo(meta, false);
	};

	// Heading-based click fallback when geo markers could not be placed
	// (empty Thoroughfare/Graph). Avoid double-nav when MovementPlugin has nearby.
	viewer.addEventListener("click", async (e) => {
		if (destroyed) return;
		if (nearbyForMovement(currentMeta).length > 0) return;
		const data = (e as { data?: { rightclick?: boolean; yaw?: number } }).data;
		if (!data || data.rightclick || data.yaw == null) return;
		const link = closestLinkByClickYaw(currentMeta, data.yaw);
		if (!link) return;
		const meta = await fetchYandexMeta(link.oid);
		if (meta && !destroyed) await handle.navigateTo(meta, false);
	});

	await applyOrientation(viewer, currentMeta);

	return handle;
}
