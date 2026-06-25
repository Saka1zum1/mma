import type { Bounds } from "@/types";

let googleMap: google.maps.Map | null = null;
let mapReadyResolve: ((map: google.maps.Map) => void) | null = null;
let mapReadyPromise: Promise<google.maps.Map> | null = null;

export function setGoogleMap(map: google.maps.Map | null) {
	googleMap = map;
	if (map && mapReadyResolve) {
		mapReadyResolve(map);
		mapReadyResolve = null;
	}
	if (!map) {
		mapReadyPromise = null;
	}
}

/**
 * This refers to the main editor map only.
 */
export function getGoogleMap(): google.maps.Map | null {
	return googleMap;
}

export function waitForGoogleMap(): Promise<google.maps.Map> {
	if (googleMap) return Promise.resolve(googleMap);
	if (!mapReadyPromise) {
		mapReadyPromise = new Promise((resolve) => { mapReadyResolve = resolve; });
	}
	return mapReadyPromise;
}

export function fitMapToBounds(bounds: Bounds | null | undefined, padding = 0) {
	if (!bounds) return;
	const gm = googleMap;
	if (!gm) return;
	gm.fitBounds(bounds, padding);
}

type ClickInterceptor = (lat: number, lng: number, shiftKey: boolean) => boolean;
const clickInterceptors = new Set<ClickInterceptor>();

export function addClickInterceptor(fn: ClickInterceptor): () => void {
	clickInterceptors.add(fn);
	return () => clickInterceptors.delete(fn);
}

export function tryInterceptClick(lat: number, lng: number, shiftKey = false): boolean {
	for (const fn of clickInterceptors) {
		if (fn(lat, lng, shiftKey)) return true;
	}
	return false;
}

type DrawInterceptor = (rings: number[][][]) => boolean;
let drawInterceptor: DrawInterceptor | null = null;

export function setDrawInterceptor(fn: DrawInterceptor | null) {
	drawInterceptor = fn;
}

export function tryInterceptDraw(rings: number[][][]): boolean {
	return drawInterceptor ? drawInterceptor(rings) : false;
}
