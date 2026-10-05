// Street View coverage validation, Run shape. Metadata for the stored pano, a coordinate
// lookup as comparison and fallback, then the unofficial, badcam and timeline checks. It
// answers each row with the ValidationFlags that apply and whether it is pinned, and writes
// nothing -- the run declares the collect sink.
//
// The batch moves through four phases, each issuing every request it needs in one
// `mma.fetch`, so a batch of any size costs a fixed number of rounds.

import type { Location, Update } from "@/bindings.gen";
import {
	detectCameraType,
	fetchMetadata,
	imageDateOf,
	indexPanos,
	isGoogleImagery,
	type FetchedMetadata,
} from "@/lib/sv/getMetadata";
import { capturedAfter, isOfficialPano, isUnofficial, newestOfficialPano } from "@/lib/sv/panoId";
import { SV_SEARCH_RADIUS } from "@/lib/sv/constants";
import { panosAtCoords } from "@/lib/sv/singleImageSearch";
import type { ValidationAnswer } from "@/lib/sv/validationCategories";
import { LocationFlag, ValidationFlag, type Pano } from "@/types";

interface RunConfig {
	config?: { radius?: number } | null;
}

let radius = SV_SEARCH_RADIUS;

export function configure(cfg: RunConfig | null): void {
	radius = cfg?.config?.radius ?? SV_SEARCH_RADIUS;
}

/** A capture worth keeping: anything else is what the badcam check is looking past. */
function isGoodCam(m: Pano): boolean {
	const cam = detectCameraType(m);
	return cam === "gen4" || cam === "gen2";
}

/** Metadata at one slot, or null when the pano is unknown or its request failed. */
function metaAt(f: FetchedMetadata, slot: number): Pano | null {
	return slot >= 0 && f.done[slot] && !f.failed[slot] ? f.metas[slot] : null;
}

/** The official capture `p` is not the newest in its own timeline. */
function behindOwnTimeline(p: Pano): boolean {
	return isOfficialPano(p.pano) && newestOfficialPano(p.time)?.pano !== p.pano;
}

interface RowState {
	row: Location;
	/** The pano the row shows: its stored pano, or the default when that does not load. */
	data: Pano | null;
	coordData: Pano | null;
	pinned: boolean;
	flags: number;
}

export function run(rows: Location[]): Update<ValidationAnswer>[] {
	rows = rows.filter(isGoogleImagery);
	if (rows.length === 0 || mma.aborted()) return [];

	const stored = indexPanos(rows.map((r) => r.panoId ?? ""));
	const storedMeta = fetchMetadata(stored.unique);
	if (mma.aborted()) return [];
	// The search answers the default's metadata too, so there is no second lookup.
	const coordPanos = panosAtCoords(rows, radius);
	if (mma.aborted()) return [];

	const items: RowState[] = rows.map((row, i) => {
		const storedPano = metaAt(storedMeta, stored.slot[i]);
		const coordData = coordPanos[i] ?? null;
		const pinned = (row.flags & LocationFlag.LoadAsPanoId) !== 0;
		let flags: number = ValidationFlag.None;
		if (pinned && storedPano === null && coordData !== null) flags |= ValidationFlag.PanoIdBroke;
		if (pinned && storedPano !== null && coordData !== null && storedPano.pano !== coordData.pano) {
			flags |= ValidationFlag.OffDefault;
		}
		if (coordData !== null && !isUnofficial(coordData) && behindOwnTimeline(coordData)) {
			flags |= ValidationFlag.DefaultStale;
		}
		return { row, data: storedPano ?? coordData, coordData, pinned, flags };
	});

	const checked: RowState[] = [];
	for (const it of items) {
		if (it.data === null) it.flags = ValidationFlag.NotFound;
		else if (isUnofficial(it.data)) it.flags |= ValidationFlag.Unofficial;
		else checked.push(it);
	}

	const badcam = checked.filter((it) => detectCameraType(it.data!) === "badcam");
	const cams = indexPanos(badcam.flatMap((it) => it.data!.time.map((e) => e.pano)));
	const camMeta = fetchMetadata(cams.unique);
	if (mma.aborted()) return [];

	let at = 0;
	for (const it of badcam) {
		let better = false;
		for (let k = 0; k < it.data!.time.length; k++) {
			const m = metaAt(camMeta, cams.slot[at++]);
			if (m && isGoodCam(m)) better = true;
		}
		if (better) it.flags |= ValidationFlag.GoodcamAvailable;
	}

	for (const it of checked) {
		const data = it.data!;
		// Only newer official coverage counts: the nearest hit can be a photosphere, an
		// adjacent road, or a default lagging behind the stored pano.
		const defaultNewer =
			it.coordData !== null &&
			!isUnofficial(it.coordData) &&
			it.coordData.pano !== data.pano &&
			capturedAfter({ imageDate: imageDateOf(it.coordData) }, { imageDate: imageDateOf(data) });
		const storedBehind = data.pano === it.row.panoId && behindOwnTimeline(data);
		if (defaultNewer || storedBehind) it.flags |= ValidationFlag.Newer;
	}

	mma.progress(items.length);
	return items.map((it) => ({ id: it.row.id, patch: { flags: it.flags, pinned: it.pinned } }));
}
