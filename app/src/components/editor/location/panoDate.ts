import { type PanoReference, parsePanoDate } from "@/lib/sv/lookup";
import { ymFromDate } from "@/lib/util/date";

type CurrentPano = Pick<google.maps.StreetViewPanoramaData, "location" | "imageDate"> | null;

export interface PanoDateState {
	defaultEntry: PanoReference | undefined;
	sorted: PanoReference[];
	currentEntry: PanoReference | undefined;
	isDefault: boolean;
	displayDate: Date | null;
	triggerPanoId: string | null;
	yearMonth: string | null;
}

/** Derive a date picker's view labels and exact-date resolution inputs from pano-viewer
 *  state. Pure, so the resolution can be hoisted to a single owner and every picker reads
 *  the same result instead of each running the expensive lookup. */
export function derivePanoDateState(
	panoDates: PanoReference[],
	selectedPanoId: string | null,
	currentPano: CurrentPano,
	defaultPanoId: string | null,
): PanoDateState {
	const defaultEntry = panoDates.find((d) => d.pano === defaultPanoId);
	const resolvedEntry = currentPano?.location
		? panoDates.find((d) => d.pano === currentPano.location!.pano)
		: undefined;
	const sorted = [...panoDates].sort((a, b) => a.date.getTime() - b.date.getTime());
	const currentEntry =
		selectedPanoId == null
			? (defaultEntry ?? resolvedEntry)
			: sorted.find((d) => d.pano === selectedPanoId);
	const isDefault = selectedPanoId == null;
	const displayDate =
		currentEntry?.date ??
		(isDefault && currentPano?.imageDate ? parsePanoDate(currentPano.imageDate) : null);
	const triggerPanoId =
		currentEntry?.pano ??
		currentPano?.location?.pano ??
		sorted[sorted.length - 1]?.pano ??
		defaultPanoId;
	const yearMonth = displayDate ? ymFromDate(displayDate) : null;
	return { defaultEntry, sorted, currentEntry, isDefault, displayDate, triggerPanoId, yearMonth };
}
