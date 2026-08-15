import { hasLoadAsPanoId } from "@/types";
import type { Location } from "@/bindings.gen";
import { ValidationState } from "@/store/selections";
import { fetchSvMetadata } from "./svMeta";
import { isOfficialPano, newestOfficialPano } from "./panoId";
import { getPanoAtCoords, isUnofficial } from "./lookup";
import { runConcurrent } from "@/lib/util/concurrent";

const GOOD_CAM_TYPES = new Set(["gen4", "gen2"]);

export async function validateOne(loc: Location, signal?: AbortSignal): Promise<ValidationState> {
	signal?.throwIfAborted();

	const pinned = hasLoadAsPanoId(loc);
	let data: google.maps.StreetViewResolvedPanoramaData | null = null;
	let coordData: google.maps.StreetViewResolvedPanoramaData | null = null;
	let state = ValidationState.Ok;

	// Fetch by pano ID if stored
	if (loc.panoId != null) {
		[data] = await fetchSvMetadata([loc.panoId]).catch(() => [null]);
	}

	if (pinned) {
		// LoadAsPanoId: if pano lookup failed, mark broke, fall back to coord
		if (data == null) {
			if (loc.panoId != null) state = ValidationState.PanoIdBroke;
			const coordPano = await getPanoAtCoords(loc.lat, loc.lng);
			if (coordPano) [data] = await fetchSvMetadata([coordPano]).catch(() => [null]);
		}
	} else {
		// No LoadAsPanoId: do coord lookup
		const coordPano = await getPanoAtCoords(loc.lat, loc.lng);
		if (coordPano) [coordData] = await fetchSvMetadata([coordPano]).catch(() => [null]);
	}

	data ??= coordData;

	if (data == null) return ValidationState.NotFound;
	if (isUnofficial(data)) return ValidationState.Unofficial;

	// Badcam check (only when not pinned)
	if (!pinned && data.extra?.cameraType === "badcam" && data.time?.length) {
		const timePanoIds = data.time.map((t) => t.pano);
		const timeResults = await fetchSvMetadata(timePanoIds).catch(() => []);
		if (timeResults.some((t) => t && GOOD_CAM_TYPES.has(t.extra?.cameraType ?? ""))) {
			return ValidationState.GoodcamAvailable;
		}
	}

	// Coord update (only when not pinned, since coordData is only set then)
	if (coordData != null && coordData.location.pano !== data.location.pano) {
		return ValidationState.UpdateApplied;
	}

	// Timeline check: the stored pano is a known official capture, but not the newest one
	const time = data.time ?? [];
	const storedIsOfficial = time.some((t) => t.pano === loc.panoId && isOfficialPano(t.pano));
	if (storedIsOfficial && newestOfficialPano(time)?.pano !== loc.panoId) {
		return pinned ? ValidationState.UpdateAvailable : ValidationState.UpdateApplied;
	}

	return state;
}

export interface ValidationProgress {
	progress: number;
	results: Map<ValidationState, Location[]>;
}

/** Check that each location's Street View coverage still exists; returns locations grouped
 *  by validation state. */
export async function validateLocations(
	locations: Location[],
	opts: {
		signal?: AbortSignal;
		onProgress?: (p: ValidationProgress) => void;
	} = {},
): Promise<Map<ValidationState, Location[]>> {
	const { signal, onProgress } = opts;
	const results = new Map<ValidationState, Location[]>();
	let completed = 0;
	let lastUpdate = 0;

	await runConcurrent(
		locations,
		async (loc) => {
			try {
				const state = await validateOne(loc, signal);
				const list = results.get(state);
				if (list) list.push(loc);
				else results.set(state, [loc]);
			} finally {
				completed++;
				const now = Date.now();
				if (now - lastUpdate > 16) {
					lastUpdate = now;
					onProgress?.({ progress: completed / locations.length, results });
				}
			}
		},
		{ concurrency: 100, signal },
	);

	onProgress?.({ progress: 1, results });
	return results;
}
