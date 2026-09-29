import { PANO_PITCH, PANO_ZOOM } from "@/lib/sv/constants";

/** Fields the batch editor writes onto every selected location. Omitted keys stay put. */
export interface SelectionViewPatch {
	heading?: number;
	pitch?: number;
	zoom?: number;
}

export type SelectionViewResult =
	| { ok: true; patch: SelectionViewPatch }
	| { ok: false; reason: "empty" | "incomplete" | "heading" | "pitch" | "zoom" };

function read(raw: string): number | "blank" | "incomplete" | "bad" {
	const s = raw.trim();
	if (s === "") return "blank";
	if (s === "-" || s === "." || s === "-." || s.endsWith(".")) return "incomplete";
	const n = Number(s);
	return Number.isFinite(n) ? n : "bad";
}

/** Heading wraps onto 0–360. 360 lands on 0. */
function wrapHeading(deg: number): number {
	return ((deg % 360) + 360) % 360;
}

/**
 * Parse the three inputs. A blank field is left unchanged. Heading accepts any
 * finite angle and wraps; pitch and zoom must sit in the panorama ranges.
 */
export function selectionViewPatch(input: {
	heading: string;
	pitch: string;
	zoom: string;
}): SelectionViewResult {
	const heading = read(input.heading);
	const pitch = read(input.pitch);
	const zoom = read(input.zoom);
	if (heading === "incomplete" || pitch === "incomplete" || zoom === "incomplete") {
		return { ok: false, reason: "incomplete" };
	}
	if (heading === "bad") return { ok: false, reason: "heading" };
	if (pitch === "bad") return { ok: false, reason: "pitch" };
	if (zoom === "bad") return { ok: false, reason: "zoom" };
	if (heading === "blank" && pitch === "blank" && zoom === "blank") {
		return { ok: false, reason: "empty" };
	}
	if (typeof pitch === "number" && (pitch < PANO_PITCH.min || pitch > PANO_PITCH.max)) {
		return { ok: false, reason: "pitch" };
	}
	if (typeof zoom === "number" && (zoom < PANO_ZOOM.min || zoom > PANO_ZOOM.max)) {
		return { ok: false, reason: "zoom" };
	}
	const patch: SelectionViewPatch = {};
	if (typeof heading === "number") patch.heading = wrapHeading(heading);
	if (typeof pitch === "number") patch.pitch = pitch;
	if (typeof zoom === "number") patch.zoom = zoom;
	return { ok: true, patch };
}
