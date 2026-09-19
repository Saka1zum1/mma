import { hasLoadAsPanoId } from "@/types";
import type { Location } from "@/bindings.gen";
import { ValidationState } from "@/store/selections";
import { fetchSvMetadata } from "./svMeta";
import { capturedAfter, isOfficialPano, newestOfficialPano } from "./panoId";
import { getPanoAtCoords, isUnofficial } from "./lookup";
import { runConcurrent } from "@/lib/util/concurrent";

const GOOD_CAM_TYPES = new Set(["gen4", "gen2"]);

export interface ValidateConfig {
	radius?: number;
	checkPinned?: boolean;
}

export async function validateOne(
	loc: Location,
	signal?: AbortSignal,
	config?: ValidateConfig,
): Promise<ValidationState> {
	signal?.throwIfAborted();

	const pinned = hasLoadAsPanoId(loc);
	const checkPinned = config?.checkPinned ?? true;
	let data: google.maps.StreetViewResolvedPanoramaData | null = null;
	let coordData: google.maps.StreetViewResolvedPanoramaData | null = null;
	let state = ValidationState.Ok;

	// Fetch by pano ID if stored
	if (loc.panoId != null) {
		[data] = await fetchSvMetadata([loc.panoId]).catch(() => [null]);
	}

	// The coordinate is the comparison (pinned rows included under checkPinned) and the
	// fallback for a pinned row whose pano broke.
	const needCoord = checkPinned || !pinned || data == null;
	if (needCoord) {
		const coordPano = await getPanoAtCoords(loc.lat, loc.lng, config?.radius);
		if (coordPano) [coordData] = await fetchSvMetadata([coordPano]).catch(() => [null]);
		if (pinned && data == null) {
			if (loc.panoId != null) state = ValidationState.PanoIdBroke;
			data = coordData;
			coordData = null;
		}
	}

	data ??= coordData;

	if (data == null) return ValidationState.NotFound;
	if (isUnofficial(data)) return ValidationState.Unofficial;

	// Badcam check (pinned rows included under checkPinned)
	if ((checkPinned || !pinned) && data.extra?.cameraType === "badcam" && data.time?.length) {
		const timePanoIds = data.time.map((t) => t.pano);
		const timeResults = await fetchSvMetadata(timePanoIds).catch(() => []);
		if (timeResults.some((t) => t && GOOD_CAM_TYPES.has(t.extra?.cameraType ?? ""))) {
			return ValidationState.GoodcamAvailable;
		}
	}

	// Only newer official coverage counts as an update: the nearest hit can be a
	// photosphere, an adjacent road, or a default lagging behind the pinned pano.
	if (
		coordData != null &&
		!isUnofficial(coordData) &&
		coordData.location.pano !== data.location.pano &&
		capturedAfter(coordData, data)
	) {
		return pinned ? ValidationState.UpdateAvailable : ValidationState.UpdateApplied;
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
		config?: ValidateConfig;
	} = {},
): Promise<Map<ValidationState, Location[]>> {
	const { signal, onProgress, config } = opts;
	const results = new Map<ValidationState, Location[]>();
	let completed = 0;
	let lastUpdate = 0;

	await runConcurrent(
		locations,
		async (loc) => {
			try {
				const state = await validateOne(loc, signal, config);
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
