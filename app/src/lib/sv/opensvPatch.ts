/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSettings } from "@/store/settings";

/**
 * Runtime patches for opensv (patched Google Maps JS API v3.63).
 *
 * opensv's WebGL Street View renderer draws two separate click-to-go visuals:
 *   - "target" (the X/crosshair) — a plus shape rotated 45deg
 *   - "V" (the ground arrow) — a directional chevron on the road
 *   - "Z" — shadow/base for the ground arrow
 *
 * These are on the internal `bL` cursor object at:
 *   renderer.A.Da.F.F.pa.C.cursor (path may vary)
 *
 * This patch overrides their .show() methods to check settings at render time.
 */

interface CursorVisual {
	show: () => void;
	hide: () => void;
}

interface BLCursor {
	target: CursorVisual;
	V: CursorVisual;
	Z: CursorVisual;
	K: unknown;
	enabled: boolean;
}

function findCursor(renderer: any): BLCursor | null {
	const visited = new WeakSet();
	let cursor: BLCursor | null = null;

	function hunt(obj: any, depth: number) {
		if (cursor || !obj || depth > 8 || typeof obj !== "object") return;
		if (visited.has(obj)) return;
		try {
			visited.add(obj);
		} catch {
			return;
		}
		let keys: string[];
		try {
			keys = Object.getOwnPropertyNames(obj);
		} catch {
			return;
		}
		if (
			keys.includes("target") &&
			keys.includes("V") &&
			keys.includes("Z") &&
			keys.includes("K") &&
			keys.includes("enabled")
		) {
			cursor = obj;
			return;
		}
		for (const k of keys) {
			try {
				const v = obj[k];
				if (v && typeof v === "object" && !(v instanceof HTMLElement)) {
					hunt(v, depth + 1);
				}
			} catch {
				// ignored
			}
		}
	}

	try {
		hunt(renderer.Da, 0);
	} catch {
		// ignored
	}
	if (!cursor) {
		try {
			hunt(renderer, 0);
		} catch {
			// ignored
		}
	}
	return cursor;
}

let panoHovered = false;

export function setPanoHovered(v: boolean) {
	panoHovered = v;
}

function patchVisual(visual: CursorVisual, settingKey: "showNavArrow" | "showGroundArrow") {
	const origShow = visual.show.bind(visual);
	const origHide = visual.hide.bind(visual);
	visual.show = () => {
		if (!panoHovered || !getSettings()[settingKey]) origHide();
		else origShow();
	};
	origHide();
}

export function patchOpenSV(pano: google.maps.StreetViewPanorama) {
	const gm = (pano as any).__gm;
	if (!gm) return;

	let patched = false;

	function tryPatch() {
		if (patched) return;
		try {
			const renderer = gm.gm_accessors_.latLngBounds.zu.mh;
			const cursor = findCursor(renderer);
			if (!cursor) return;

			patchVisual(cursor.target, "showNavArrow");
			patchVisual(cursor.V, "showGroundArrow");
			patchVisual(cursor.Z, "showGroundArrow");
			patched = true;
		} catch {
			// ignored
		}
	}

	pano.addListener("status_changed", () => {
		if ((pano as any).getStatus() === "OK") tryPatch();
	});
	tryPatch();
}
