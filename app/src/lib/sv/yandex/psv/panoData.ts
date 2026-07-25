/**
 * Build Photo Sphere Viewer `panoData` for a Yandex (often non-full-vertical)
 * equirectangular capture.
 *
 * Per Yandex custom-panorama geometry:
 *   θT − θB = (h/w)·2π
 * so the image is a horizontal 360° strip that may cover less than 180° vertically.
 * PSV places that strip on the full sphere via croppedX/Y/Width/Height.
 *
 * Angular placement is always derived from level-0 (highest-res) Zooms + Origin,
 * then scaled into the texture pixel space of the displayed level — this keeps
 * low-zoom and high-zoom projections identical.
 */
import type { PanoData } from "@photo-sphere-viewer/core";
import type { YandexPanoMeta, YandexZoomSize } from "../api";

export function levelSize(meta: YandexPanoMeta, level: number): YandexZoomSize {
	const z = meta.zooms[level] ?? meta.zooms[0];
	if (z) return z;
	return { width: meta.worldWidth, height: meta.worldHeight };
}

/** Coarsest native level index (highest Yandex zoom number = lowest detail). */
export function coarsestLevel(meta: YandexPanoMeta): number {
	return Math.max(0, meta.zooms.length - 1);
}

/**
 * panoData for an image of `width`×`height` that covers full 360° horizontally
 * and a possibly restricted vertical FOV.
 *
 * `width`/`height` must be the Zooms entry for the texture being shown.
 * Crop placement follows level-0 geometry so every pyramid level shares the
 * same sphere projection.
 */
export function buildYandexPanoData(
	meta: YandexPanoMeta,
	width: number,
	height: number,
): PanoData {
	const ref = meta.zooms[0] ?? { width, height };
	const refW = ref.width;
	const refH = ref.height;
	const refFullH = refW / 2;
	const refCropH = Math.min(refH, refFullH);

	let refCropY = Math.max(0, (refFullH - refCropH) / 2);
	if (meta.originPitch != null && refW > 0) {
		// Image centre at originPitch degrees above the horizon; +90° = zenith (y=0).
		const alphaDeg = (refCropH / refW) * 360;
		const thetaTop = meta.originPitch + alphaDeg / 2;
		refCropY = ((90 - thetaTop) / 180) * refFullH;
		refCropY = Math.max(0, Math.min(refFullH - refCropH, refCropY));
	}

	const scale = width / refW;
	const fullWidth = width;
	const fullHeight = width / 2;
	// Keep the displayed texture's native height from Zooms; place it using the
	// level-0-derived top edge so FOV centre matches Origin across levels.
	const croppedHeight = Math.min(height, fullHeight);
	const croppedY = Math.max(
		0,
		Math.min(fullHeight - croppedHeight, refCropY * scale),
	);

	return {
		fullWidth,
		fullHeight,
		croppedWidth: width,
		croppedHeight,
		croppedX: 0,
		croppedY,
		// Keep texture-native frame (image centre = PSV yaw 0). Compass is
		// layered in orientation.ts / panoramaProxy — not via poseHeading.
		poseHeading: 0,
		posePitch: 0,
		poseRoll: 0,
	};
}
