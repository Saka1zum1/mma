import type { Bounds } from "@/types";
import { type MapHost } from "@/lib/map/host";

let mapHost: MapHost | null = null;
let hostReadyResolve: ((host: MapHost) => void) | null = null;
let hostReadyPromise: Promise<MapHost> | null = null;

export function setMapHost(host: MapHost | null) {
	mapHost = host;
	if (host && hostReadyResolve) {
		hostReadyResolve(host);
		hostReadyResolve = null;
	}
	if (!host) {
		hostReadyPromise = null;
	}
}

/**
 * This refers to the main editor map only.
 */
export function getMapHost(): MapHost | null {
	return mapHost;
}

/**
 * Wait for the main editor map to be ready.
 */
export function waitForMapHost(): Promise<MapHost> {
	if (mapHost) return Promise.resolve(mapHost);
	if (!hostReadyPromise) {
		hostReadyPromise = new Promise((resolve) => {
			hostReadyResolve = resolve;
		});
	}
	return hostReadyPromise;
}

/** Expand any axis narrower than `2 * minExtent` (degrees) to that span, centered.
 *  A single-point paste has zero-area bounds; without this, fitBounds maxes out the zoom. */
function padBoundsToMin(b: Bounds, minExtent: number): Bounds {
	const pad = (lo: number, hi: number): [number, number] => {
		if (hi - lo >= minExtent * 2) return [lo, hi];
		const mid = (lo + hi) / 2;
		return [mid - minExtent, mid + minExtent];
	};
	const [south, north] = pad(b.south, b.north);
	const [west, east] = pad(b.west, b.east);
	return { west, south, east, north };
}

export function fitMapToBounds(bounds: Bounds | null | undefined, padding = 0, minExtent?: number) {
	if (!bounds) return;
	if (minExtent != null) bounds = padBoundsToMin(bounds, minExtent);
	mapHost?.fitBounds(bounds, padding);
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
