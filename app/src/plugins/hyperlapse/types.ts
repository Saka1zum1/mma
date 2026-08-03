import type { SvProvider } from "@/lib/sv/providers/types";
import type { LatLng } from "@/types";
import { DEFAULT_VIEW_FILTER, normalizeViewFilter, type ViewFilter } from "./filters";

export type { ViewFilter } from "./filters";
export { VIEW_FILTERS, DEFAULT_VIEW_FILTER } from "./filters";

function normHeading(h: number): number {
	return ((h % 360) + 360) % 360;
}

/** Metadata for one hyperlapse frame (persistable — no image payload). */
export interface HyperlapseFrameMeta {
	lat: number;
	lng: number;
	panoId: string;
	provider: SvProvider;
	/** @deprecated Use `drivingDirection`; kept for older saved sequences. */
	heading: number;
	/** Road / travel direction in world degrees (bound at sequence build). */
	drivingDirection?: number;
	/** World heading at the horizontal center of the stitched equirect (texture forward). */
	textureCenterHeading?: number;
	pitch: number;
	zoom: number;
	elevation: number;
	copyright: string;
	imageDate: string;
	/** Optional source location id when built from the map. */
	locationId?: number;
}

/** Fully loaded frame ready for rendering. */
export interface HyperlapseFrame extends HyperlapseFrameMeta {
	image: HTMLCanvasElement;
}

export type PlaybackMode = "once" | "loop" | "pingpong";
export type PlaybackDirection = "forward" | "backward";

/**
 * How the base (pre-offset) heading is chosen for each frame.
 * Interactive drag offsets are always applied on top (except heading when lookAt).
 *
 * - drive: each frame’s driving direction (default)
 * - lookAt: bearing from frame → lookAt point
 * - fixed: constant fixedHeading
 * - free: texture-forward (0°), like Hyperlapse.js without use_lookat
 */
export type LookMode = "drive" | "lookAt" | "fixed" | "free";

export interface HyperlapseSettings {
	fov: number;
	/** Play / scrub FPS. */
	fps: number;
	/** Tile stitch zoom (1–2 recommended; higher values risk WebGL context loss). */
	panoZoom: number;
	playbackMode: PlaybackMode;
	/** Smooth camera interpolation between frames during playback. */
	smoothTransition: boolean;
	lookMode: LookMode;
	lookAt: LatLng | null;
	fixedHeading: number;
	/** When true, use fixedPitch instead of each frame’s pitch. */
	useFixedPitch: boolean;
	fixedPitch: number;
	/** Screen-space look filter (roadtrip-style). */
	viewFilter: ViewFilter;
}

export const DEFAULT_SETTINGS: HyperlapseSettings = {
	fov: 70,
	fps: 20,
	panoZoom: 1,
	playbackMode: "pingpong",
	smoothTransition: true,
	lookMode: "drive",
	lookAt: null,
	fixedHeading: 0,
	useFixedPitch: false,
	fixedPitch: 0,
	viewFilter: DEFAULT_VIEW_FILTER,
};

export interface BuildProgress {
	phase: "ordering" | "loading" | "done" | "cancelled" | "error";
	/** 0–1 overall progress within the current phase. */
	progress: number;
	message?: string;
	resolved?: number;
	total?: number;
}

/** Persistable snapshot of a generated sequence (images reloaded on restore). */
export interface SavedSequence {
	id: string;
	name: string;
	createdAt: number;
	/** Last edit / save time (ms). Falls back to createdAt when missing. */
	modifiedAt: number;
	settings: Pick<HyperlapseSettings, "panoZoom">;
	frames: HyperlapseFrameMeta[];
	path: LatLng[];
}

/** Migrate older persisted settings shapes. */
export function normalizeSettings(raw: Partial<HyperlapseSettings> | null | undefined): HyperlapseSettings {
	const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
	// Legacy boolean flags → lookMode
	const legacy = raw as Partial<HyperlapseSettings> & {
		useFixedHeading?: boolean;
		followDrivingDirection?: boolean;
	};
	if (!raw?.lookMode) {
		if (legacy.lookAt) s.lookMode = "lookAt";
		else if (legacy.useFixedHeading) s.lookMode = "fixed";
		else if (legacy.followDrivingDirection === false) s.lookMode = "free";
		else s.lookMode = "drive";
	}
	if (s.lookMode === "lookAt" && !s.lookAt) s.lookMode = "drive";
	s.viewFilter = normalizeViewFilter(s.viewFilter);
	return s;
}

/** Normalized POV fields for a frame (legacy `heading`-only snapshots included). */
export function normalizeFramePov(meta: Pick<HyperlapseFrameMeta, "heading" | "drivingDirection" | "textureCenterHeading">) {
	const drivingDirection = normHeading(meta.drivingDirection ?? meta.heading);
	// MMA equirects align texture center with driving direction when metadata is present.
	const textureCenterHeading = normHeading(
		meta.textureCenterHeading ?? meta.drivingDirection ?? meta.heading,
	);
	return { drivingDirection, textureCenterHeading };
}

/** World heading → degrees relative to the equirect horizontal center. */
export function textureRelativeHeading(
	worldHeading: number,
	meta: Pick<HyperlapseFrameMeta, "heading" | "drivingDirection" | "textureCenterHeading">,
): number {
	const { textureCenterHeading } = normalizeFramePov(meta);
	return normHeading(worldHeading - textureCenterHeading);
}
