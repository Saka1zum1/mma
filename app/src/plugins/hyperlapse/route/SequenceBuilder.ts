import type { Location } from "@/bindings.gen";
import type { LatLng } from "@/types";
import { distMeters } from "@/lib/geo/geo";
import { getLocationProvider, getLocationPanoId } from "@/lib/sv/providers/types";
import { bearingDegrees } from "./RouteGenerator";
import type { BuildProgress, HyperlapseFrameMeta, HyperlapseSettings } from "../types";

export interface BuildSequenceOptions {
	settings: HyperlapseSettings;
	locations: Location[];
	signal?: AbortSignal;
	onProgress?: (p: BuildProgress) => void;
}

function drivingDirectionOf(loc: Location): number {
	const extra = loc.extra as { drivingDirection?: number } | null;
	if (typeof extra?.drivingDirection === "number" && Number.isFinite(extra.drivingDirection)) {
		return ((extra.drivingDirection % 360) + 360) % 360;
	}
	return ((loc.heading % 360) + 360) % 360;
}

/** World heading at the center of the stitched equirect (matches panoDownload perspective math). */
function textureCenterHeadingOf(loc: Location): number {
	const extra = loc.extra as { drivingDirection?: number; textureCenterHeading?: number } | null;
	if (typeof extra?.textureCenterHeading === "number" && Number.isFinite(extra.textureCenterHeading)) {
		return ((extra.textureCenterHeading % 360) + 360) % 360;
	}
	if (typeof extra?.drivingDirection === "number" && Number.isFinite(extra.drivingDirection)) {
		return ((extra.drivingDirection % 360) + 360) % 360;
	}
	return ((loc.heading % 360) + 360) % 360;
}

/** Sum of |bearing(step) − drivingDirection| per edge; lower = chain follows road direction. */
function chainDrivingAlignmentScore(ordered: Location[]): number {
	let score = 0;
	for (let i = 0; i < ordered.length - 1; i++) {
		const bearing = bearingDegrees(ordered[i], ordered[i + 1]);
		const drive = drivingDirectionOf(ordered[i]);
		score += Math.abs(((bearing - drive + 540) % 360) - 180);
	}
	return score;
}

function orientChainWithDrivingDirection(ordered: Location[]): Location[] {
	if (ordered.length < 2) return ordered;
	const forward = chainDrivingAlignmentScore(ordered);
	const reversed = [...ordered].reverse();
	const backward = chainDrivingAlignmentScore(reversed);
	return backward < forward ? reversed : ordered;
}

/**
 * Order locations into a playable chain using each panorama's driving direction.
 * Greedy nearest-neighbor that prefers candidates ahead of the current heading.
 */
export function orderByDrivingDirection(locs: Location[]): Location[] {
	if (locs.length <= 1) return [...locs];

	// Diameter endpoint as start (one end of the spatial span).
	let start = locs[0];
	let maxD = -1;
	for (let i = 0; i < locs.length; i++) {
		for (let j = i + 1; j < locs.length; j++) {
			const d = distMeters(locs[i], locs[j]);
			if (d > maxD) {
				maxD = d;
				start = locs[i];
			}
		}
	}

	// Prefer the endpoint whose driving direction points toward the other points.
	const other = locs.reduce(
		(best, loc) => {
			if (loc === start) return best;
			const d = distMeters(start, loc);
			return d > best.d ? { loc, d } : best;
		},
		{ loc: locs[0], d: -1 },
	).loc;
	const towardOther = bearingDegrees(start, other);
	const startDrive = drivingDirectionOf(start);
	const startAlign = Math.abs(((towardOther - startDrive + 540) % 360) - 180);
	const otherDrive = drivingDirectionOf(other);
	const otherToward = bearingDegrees(other, start);
	const otherAlign = Math.abs(((otherToward - otherDrive + 540) % 360) - 180);
	// If `other` looks away from `start` better than `start` looks toward `other`,
	// begin at `other` (more "upstream").
	if (otherAlign < startAlign) start = other;

	const ordered: Location[] = [];
	const unused = new Set(locs);
	let current = start;
	unused.delete(current);
	ordered.push(current);

	while (unused.size > 0) {
		const drive = drivingDirectionOf(current);
		let best: Location | null = null;
		let bestScore = Infinity;
		for (const cand of unused) {
			const bearing = bearingDegrees(current, cand);
			const dist = Math.max(1, distMeters(current, cand));
			const angleDiff = Math.abs(((bearing - drive + 540) % 360) - 180);
			// Prefer nearby points roughly ahead of the driving direction.
			const score = dist * (1 + angleDiff / 60);
			if (score < bestScore) {
				bestScore = score;
				best = cand;
			}
		}
		if (!best) break;
		current = best;
		unused.delete(current);
		ordered.push(current);
	}

	return orientChainWithDrivingDirection(ordered);
}

function toFrameMeta(loc: Location, zoom: number): HyperlapseFrameMeta | null {
	const panoId = getLocationPanoId(loc);
	if (!panoId) return null;
	const provider = getLocationProvider(loc);
	const drivingDirection = drivingDirectionOf(loc);
	const textureCenterHeading = textureCenterHeadingOf(loc);
	const extra = loc.extra as { altitude?: number; imageDate?: string } | null;
	return {
		lat: loc.lat,
		lng: loc.lng,
		panoId,
		provider,
		heading: drivingDirection,
		drivingDirection,
		textureCenterHeading,
		pitch: loc.pitch || 0,
		zoom: Math.min(2, Math.max(1, Math.round(zoom) || 1)),
		elevation: typeof extra?.altitude === "number" ? extra.altitude : -1,
		copyright: "",
		imageDate: typeof extra?.imageDate === "string" ? extra.imageDate : "",
		locationId: loc.id || undefined,
	};
}

/** Build a hyperlapse frame sequence from selected map locations. */
export async function buildSequence(opts: BuildSequenceOptions): Promise<{
	frames: HyperlapseFrameMeta[];
	path: LatLng[];
}> {
	const { settings, signal, onProgress } = opts;
	const report = (p: BuildProgress) => onProgress?.(p);
	const locs = opts.locations ?? [];
	if (locs.length < 2) throw new Error("Select at least two locations");

	report({ phase: "ordering", progress: 0.2, message: "Ordering by driving direction" });
	if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

	const ordered = orderByDrivingDirection(locs);
	const frames: HyperlapseFrameMeta[] = [];
	const path: LatLng[] = [];

	for (let i = 0; i < ordered.length; i++) {
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
		const loc = ordered[i];
		path.push({ lat: loc.lat, lng: loc.lng });
		const meta = toFrameMeta(loc, settings.panoZoom);
		if (!meta) continue;
		if (frames.length && frames[frames.length - 1].panoId === meta.panoId) continue;
		frames.push(meta);
		report({
			phase: "ordering",
			progress: (i + 1) / ordered.length,
			resolved: frames.length,
			total: ordered.length,
		});
	}

	if (frames.length < 2) throw new Error("Need at least two panoramas with pano IDs");

	report({ phase: "done", progress: 1, resolved: frames.length, total: ordered.length });
	return { frames, path };
}
