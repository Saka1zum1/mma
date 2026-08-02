import type { LatLng } from "@/types";
import { bearingDegrees } from "./route/RouteGenerator";
import {
	normalizeFramePov,
	textureRelativeHeading,
	type HyperlapseFrameMeta,
	type HyperlapseSettings,
	type LookMode,
} from "./types";

export interface FrameLook {
	heading: number;
	pitch: number;
}

export interface PovConfig {
	lookMode: LookMode;
	lookAt: LatLng | null;
	fixedHeading: number;
	useFixedPitch: boolean;
	fixedPitch: number;
}

/**
 * Viewer POV manager (Hyperlapse.js position / tilt / use_lookat model).
 *
 * Base look comes from lookMode + frame metadata.
 * Interactive offsets (heading/pitch/roll) are what the user drags —
 * analogous to Hyperlapse.js `position.x/y` and `tilt`.
 */
export class PovController {
	lookMode: LookMode = "drive";
	lookAt: LatLng | null = null;
	fixedHeading = 0;
	useFixedPitch = false;
	fixedPitch = 0;

	/** Interactive offsets (degrees). */
	headingOffset = 0;
	pitchOffset = 0;
	roll = 0;

	applyConfig(cfg: PovConfig) {
		this.lookMode = cfg.lookMode;
		this.lookAt = cfg.lookAt;
		this.fixedHeading = cfg.fixedHeading;
		this.useFixedPitch = cfg.useFixedPitch;
		this.fixedPitch = cfg.fixedPitch;
		if (this.lookMode === "lookAt") this.headingOffset = 0;
	}

	fromSettings(settings: HyperlapseSettings) {
		this.applyConfig({
			lookMode: settings.lookMode,
			lookAt: settings.lookAt,
			fixedHeading: settings.fixedHeading,
			useFixedPitch: settings.useFixedPitch,
			fixedPitch: settings.fixedPitch,
		});
	}

	/** Heading drag is locked in lookAt mode (pitch + roll still free). */
	canDragHeading() {
		return this.lookMode !== "lookAt";
	}

	/** Base look for a frame before interactive offsets. */
	resolveBase(
		frame: Pick<
			HyperlapseFrameMeta,
			"lat" | "lng" | "heading" | "pitch" | "drivingDirection" | "textureCenterHeading"
		>,
	): FrameLook {
		let heading = 0;
		switch (this.lookMode) {
			case "lookAt":
				if (this.lookAt) {
					heading = textureRelativeHeading(bearingDegrees(frame, this.lookAt), frame);
				} else {
					heading = textureRelativeHeading(normalizeFramePov(frame).drivingDirection, frame);
				}
				break;
			case "fixed":
				heading = textureRelativeHeading(this.fixedHeading, frame);
				break;
			case "drive":
				heading = textureRelativeHeading(normalizeFramePov(frame).drivingDirection, frame);
				break;
			case "free":
			default:
				heading = 0;
				break;
		}
		const pitch = this.useFixedPitch ? this.fixedPitch : frame.pitch;
		return { heading, pitch };
	}

	/** Final camera pose = base + interactive offsets. */
	resolve(frame: Pick<HyperlapseFrameMeta, "lat" | "lng" | "heading" | "pitch">): FrameLook {
		const base = this.resolveBase(frame);
		return {
			heading: base.heading + (this.canDragHeading() ? this.headingOffset : 0),
			pitch: Math.max(-85, Math.min(85, base.pitch + this.pitchOffset)),
		};
	}

	applyLookDrag(dx: number, dy: number, startH: number, startP: number) {
		if (this.canDragHeading()) this.headingOffset = startH - dx * 0.25;
		this.pitchOffset = Math.max(-85, Math.min(85, startP + dy * 0.25));
	}

	applyRollDrag(dx: number, startR: number) {
		this.roll = startR + dx * 0.25;
	}

	resetRoll() {
		this.roll = 0;
	}

	/** Reset interactive offsets (keeps lookMode / lookAt / fixed values). */
	resetOffsets() {
		this.headingOffset = 0;
		this.pitchOffset = 0;
		this.roll = 0;
	}
}

/** @deprecated use PovController — kept for unit tests of pure resolve. */
export function resolveFrameLook(
	frame: Pick<HyperlapseFrameMeta, "lat" | "lng" | "heading" | "pitch">,
	settings: PovConfig & { followDrivingDirection?: boolean },
): FrameLook {
	const pov = new PovController();
	// Support legacy followDrivingDirection from older tests/callers.
	let mode = settings.lookMode;
	if (!mode && settings.followDrivingDirection === false) mode = "free";
	pov.applyConfig({ ...settings, lookMode: mode ?? "drive" });
	return pov.resolveBase(frame);
}

export function isLookAtActive(lookAt: LatLng | null | undefined): boolean {
	return !!lookAt && Number.isFinite(lookAt.lat) && Number.isFinite(lookAt.lng);
}
