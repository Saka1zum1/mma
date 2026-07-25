import { getSettings, setSetting } from "@/store/settings";
import { emit as emitEvent, useEventValue } from "@/lib/events";

let panoFullscreen = false;
let suspendedFullscreenMap = false;
let suspendedPanoFullscreen = false;

function setPanoFullscreen(next: boolean): void {
	if (next === panoFullscreen) return;
	panoFullscreen = next;
	emitEvent("fullscreen:changed");
}

export function usePanoFullscreen(): boolean {
	return useEventValue("fullscreen:changed", () => panoFullscreen);
}

export function togglePanoFullscreen(): void {
	const next = !panoFullscreen;
	// Flag before setting: the fullscreenMap watcher reads panoFullscreen.
	setPanoFullscreen(next);
	if (next && getSettings().fullscreenMap) {
		suspendedFullscreenMap = true;
		setSetting("fullscreenMap", false);
	} else if (!next && suspendedFullscreenMap) {
		suspendedFullscreenMap = false;
		setSetting("fullscreenMap", true);
	}
}

/** Returns whether pano fullscreen was on (and is now exited). */
export function exitPanoFullscreen(): boolean {
	if (!panoFullscreen) return false;
	togglePanoFullscreen();
	return true;
}

/** Enforcement point for the mutual exclusion, called on every `fullscreenMap`
 *  transition (hotkey, settings page, plugin api.setSetting alike). */
export function onFullscreenMapChanged(on: boolean): void {
	if (on) {
		if (panoFullscreen) {
			suspendedPanoFullscreen = true;
			setPanoFullscreen(false);
		}
	} else if (suspendedPanoFullscreen) {
		suspendedPanoFullscreen = false;
		setPanoFullscreen(true);
	}
}

/** Location cleared (save/delete/close): drop pano fullscreen, restore a
 *  suspended fullscreen-map, forget all suspensions. */
export function onLocationCleared(): void {
	setPanoFullscreen(false);
	if (suspendedFullscreenMap) {
		suspendedFullscreenMap = false;
		setSetting("fullscreenMap", true);
	}
	suspendedPanoFullscreen = false;
}

export function toggleFullscreenMap(): void {
	setSetting("fullscreenMap", !getSettings().fullscreenMap);
}

/** Returns whether fullscreen-map was on (and is now exited). */
export function exitFullscreenMap(): boolean {
	if (!getSettings().fullscreenMap) return false;
	setSetting("fullscreenMap", false);
	return true;
}
