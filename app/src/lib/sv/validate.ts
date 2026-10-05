import { hasLoadAsPanoId, ValidationFlag } from "@/types";
import type { Location } from "@/bindings.gen";
import { fetchSvMetadata } from "./svMeta";
import { capturedAfter, isOfficialPano, newestOfficialPano } from "./panoId";
import { getPanoAtCoords, isUnofficial } from "./lookup";
import { runConcurrent } from "@/lib/util/concurrent";
import { log } from "@/lib/util/log";
import {
	STANDARD_VALIDATION_CATEGORIES,
	VALIDATION_CATEGORIES,
	type ValidationAnswer,
} from "./validationCategories";

const GOOD_CAM_TYPES = new Set(["gen4", "gen2"]);
const KNOWN_BITS = Object.values(ValidationFlag).reduce<number>((all, f) => all | f, 0);

export interface ValidateConfig {
	radius?: number;
}

type GooglePano = google.maps.StreetViewResolvedPanoramaData;

/** The official capture `p` is not the newest in its own timeline. */
function behindOwnTimeline(p: GooglePano): boolean {
	const id = p.location.pano;
	return isOfficialPano(id) && newestOfficialPano(p.time ?? [])?.pano !== id;
}

export async function validateOne(
	loc: Location,
	signal?: AbortSignal,
	config?: ValidateConfig,
): Promise<ValidationAnswer> {
	signal?.throwIfAborted();

	const pinned = hasLoadAsPanoId(loc);
	let data: GooglePano | null = null;
	if (loc.panoId != null) {
		[data] = await fetchSvMetadata([loc.panoId]).catch(() => [null]);
	}
	const coordPano = await getPanoAtCoords(loc.lat, loc.lng, config?.radius);
	let coordData: GooglePano | null = null;
	if (coordPano) [coordData] = await fetchSvMetadata([coordPano]).catch(() => [null]);

	let flags: number = ValidationFlag.None;
	if (pinned && data == null && coordData != null) flags |= ValidationFlag.PanoIdBroke;
	if (
		pinned &&
		data != null &&
		coordData != null &&
		data.location.pano !== coordData.location.pano
	) {
		flags |= ValidationFlag.OffDefault;
	}
	if (coordData != null && !isUnofficial(coordData) && behindOwnTimeline(coordData)) {
		flags |= ValidationFlag.DefaultStale;
	}

	const shown = data ?? coordData;
	if (shown == null) return { flags: ValidationFlag.NotFound, pinned };
	if (isUnofficial(shown)) {
		flags |= ValidationFlag.Unofficial;
		return { flags, pinned };
	}

	if (shown.extra?.cameraType === "badcam" && shown.time?.length) {
		const timeResults = await fetchSvMetadata(shown.time.map((t) => t.pano)).catch(() => []);
		if (timeResults.some((t) => t && GOOD_CAM_TYPES.has(t.extra?.cameraType ?? ""))) {
			flags |= ValidationFlag.GoodcamAvailable;
		}
	}

	const defaultNewer =
		coordData != null &&
		!isUnofficial(coordData) &&
		coordData.location.pano !== shown.location.pano &&
		capturedAfter(coordData, shown);
	const storedBehind = shown.location.pano === loc.panoId && behindOwnTimeline(shown);
	if (defaultNewer || storedBehind) flags |= ValidationFlag.Newer;

	return { flags, pinned };
}

export interface ValidationProgress {
	progress: number;
}

/** What a validation run answered: the ids in each asked-for category, keyed by category. */
export interface ValidationOutcome {
	categories: Map<string, number[]>;
}

/** Check that each location's Street View coverage still exists, grouping the locations
 *  into `categories` (keys of `VALIDATION_CATEGORIES`; the standard ones when omitted). */
export async function validateLocations(
	locations: Location[],
	opts: {
		signal?: AbortSignal;
		onProgress?: (p: ValidationProgress) => void;
		config?: ValidateConfig;
		categories?: readonly string[];
	} = {},
): Promise<ValidationOutcome> {
	const { signal, onProgress, config, categories: asked = STANDARD_VALIDATION_CATEGORIES } = opts;
	const wanted = VALIDATION_CATEGORIES.filter((c) => asked.includes(c.key));
	const answers: { id: number; answer: ValidationAnswer }[] = [];
	let completed = 0;
	let lastUpdate = 0;

	await runConcurrent(
		locations,
		async (loc) => {
			try {
				answers.push({ id: loc.id, answer: await validateOne(loc, signal, config) });
			} finally {
				completed++;
				const now = Date.now();
				if (now - lastUpdate > 16) {
					lastUpdate = now;
					onProgress?.({ progress: completed / locations.length });
				}
			}
		},
		{ concurrency: 100, signal },
	);

	const ids = wanted.map((): number[] => []);
	for (const { id, answer } of answers) {
		if ((answer.flags & ~KNOWN_BITS) !== 0) {
			log.warn(`[validate] location ${id}: unknown validation flags ${String(answer.flags)}`);
			continue;
		}
		wanted.forEach((c, i) => {
			if (c.test(answer)) ids[i].push(id);
		});
	}
	onProgress?.({ progress: 1 });
	return {
		categories: new Map(
			wanted.flatMap((c, i) => (ids[i].length > 0 ? [[c.key, ids[i]] as const] : [])),
		),
	};
}
