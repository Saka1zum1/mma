/**
 * Screen-space look presets inspired by Saka1zum1/roadtrip (glfx.js sequencer filters).
 *
 * Reference mapping (sequencer.js `_filter`):
 *  1 → vintage (desat + contrast + warm soft-light + scanlines)
 *  2 → vivid   (boost vibrance + slight brighten)
 *  3 → mono    (full desat + high contrast)
 *  4 → none
 */

export type ViewFilter = "none" | "vintage" | "vivid" | "mono";

export const VIEW_FILTERS: readonly ViewFilter[] = ["none", "vivid", "vintage", "mono"];

export const DEFAULT_VIEW_FILTER: ViewFilter = "none";

export function normalizeViewFilter(raw: unknown): ViewFilter {
	if (raw === "none" || raw === "vivid" || raw === "vintage" || raw === "mono") return raw;
	return DEFAULT_VIEW_FILTER;
}
