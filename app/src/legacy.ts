// Legacy API shims for plugins. Every export is deprecated: kept only so
// plugins built against an older MMA keep working. New code must not call these.

import { getMapHost, waitForMapHost } from "@/lib/map/mapState";
import { hostInstance } from "@/lib/map/host";
import { getMapState, getActiveSelections, fetchLocations } from "@/store/useMapStore";
import { cmd } from "@/lib/commands";

/** @deprecated v0.8.1. Use `MMA.getMapHost()` and narrow via `hostInstance`. */
export function getGoogleMap(): google.maps.Map | null {
	return hostInstance(getMapHost(), "google");
}

/** @deprecated v0.8.1. Use `MMA.waitForMapHost()`. */
export function waitForGoogleMap(): Promise<google.maps.Map | null> {
	return waitForMapHost().then((host) => hostInstance(host, "google"));
}

/** @deprecated v0.8.2. Read `MMA.getMapState().map`. */
export function getCurrentMap() {
	return getMapState().map;
}

/** @deprecated v0.8.2. Read `MMA.getMapState().mapId`. */
export function getCurrentMapId() {
	return getMapState().mapId;
}

/** @deprecated v0.8.2. Read `MMA.getMapState().activeLocation`. */
export function getActiveLocation() {
	return getMapState().activeLocation;
}

/** @deprecated v0.8.2. Read `MMA.getMapState().selectedLocationIds`. */
export function getSelectedLocationIds() {
	return getMapState().selectedLocationIds;
}

/** @deprecated v0.8.2. Read `MMA.getMapState().workArea`. */
export function getWorkArea() {
	return getMapState().workArea;
}

/** @deprecated v0.8.2. Read `MMA.getMapState().tagCounts`. */
export function getTagCounts() {
	return getMapState().tagCounts;
}

/** @deprecated v0.8.2. Read `MMA.getMapState().knownFieldKeys`. */
export function getKnownFieldKeys() {
	return getMapState().knownFieldKeys;
}

/** @deprecated v0.8.2. Read `MMA.getMapState().selections`. */
export function getAllSelections() {
	return getMapState().selections;
}

/** @deprecated v0.8.2. Read `MMA.getMapState().ghostedSelections`. */
export function getGhostedSelections() {
	return getMapState().ghostedSelections;
}

/** @deprecated v0.8.2. Use `MMA.getActiveSelections()`. */
export function getSelections() {
	return getActiveSelections();
}

/** @deprecated v0.8.2. Read `(await MMA.cmd.storeGetSummary()).dirtyCount`. */
export async function getDirtyCount(): Promise<number> {
	return (await cmd.storeGetSummary()).dirtyCount;
}

/** @deprecated v0.8.4. Use `MMA.fetchLocations({ kind: "ids", ids: [id] })`. */
export async function fetchLocation(id: number) {
	return (await fetchLocations({ kind: "ids", ids: [id] }))[0] ?? null;
}

/** @deprecated v0.8.4. Use `MMA.fetchLocations({ kind: "ids", ids })`. */
export function fetchLocationsByIds(ids: number[]) {
	return fetchLocations({ kind: "ids", ids });
}

/** @deprecated v0.8.4. Use `MMA.fetchLocations({ kind: "all" })`. */
export function fetchAllLocations() {
	return fetchLocations({ kind: "all" });
}
