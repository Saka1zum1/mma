/**
 * Shared helpers for E2E tests.
 * All browser calls go through withApi, which injects the test API as `api`.
 */

import type { TestAPI } from "@/lib/testApi.add";
import { createLocation } from "../../src/types";
import type { Location } from "@/types";

/**
 * Run an async function in the browser with the test API injected as `api`.
 * Handles the done callback, try/catch, and serialization boilerplate.
 * The result type is inferred from whatever the callback returns.
 *
 * Usage: `await withApi(async (api, id) => api.fetchLocation(id), locId);`
 */
export async function withApi<A extends unknown[], R>(
	fn: (api: TestAPI, ...args: A) => R,
	...args: A
): Promise<Awaited<R>> {
	const wrapped = new Function(
		"...___a",
		`const ___d = ___a.pop();
     const api = window.__TEST_API__;
     (async () => { try { ___d(await (${fn.toString()})(api, ...___a)); } catch(e) { ___d({ __withApiError: e.message }); } })();`,
	);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- callback is serialized and re-evaluated in the browser; this bridge can't be statically typed
	const result = (await browser.executeAsync(wrapped as any, ...args)) as unknown;
	if (result !== null && typeof result === "object" && "__withApiError" in result) {
		throw new Error(String((result as { __withApiError: unknown }).__withApiError));
	}
	return result as Awaited<R>;
}

export async function waitForReady() {
	await browser.waitUntil(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		async () => browser.execute(() => (window as any).__TEST_API__?.ready === true),
		{ timeout: 30000, timeoutMsg: "App did not boot in time" },
	);
}

export async function createAndOpenMap(name: string): Promise<string> {
	return withApi(async (api, n) => {
		const map = await api.createMap(n, null);
		await api.openMap(map.meta.id);
		return map.meta.id;
	}, name);
}

export async function openMap(id: string) {
	await withApi(async (api, mapId) => api.openMap(mapId), id);
}

export async function closeMap() {
	await withApi(async (api) => {
		try {
			await api.closeMap();
		} catch {}
	});
}

export async function deleteMap(id: string) {
	await withApi(async (api, mapId) => {
		try {
			await api.deleteMap(mapId);
		} catch {}
	}, id);
}

export async function flushAndWait() {
	await withApi(async (api) => api.flushSave());
}

/** Open a location in the editor via the test API. */
export async function openLocation(id: number) {
	await withApi(async (api, locId) => {
		api.setActiveLocation(locId, false);
	}, id);
}

/** Close the active location (return to overview) via the test API. */
export async function closeLocation() {
	await withApi(async (api) => {
		api.setActiveLocation(null);
	});
	await browser.pause(300);
}

// --- Location helpers ---

export { createLocation };

export function randomLatLng(): { lat: number; lng: number } {
	return { lat: Math.random() * 180 - 90, lng: Math.random() * 360 - 180 };
}

export function randomHeading(): { heading: number } {
	return { heading: Math.random() * 360 };
}

export async function addLocs(locs: Location[]): Promise<number[]> {
	return withApi(async (api, locations) => {
		await api.addLocations(locations);
		return locations.map((l) => l.id);
	}, locs);
}

export async function getLoc(id: number): Promise<Location> {
	const loc = await withApi(async (api, locId) => api.fetchLocation(locId), id);
	if (loc == null) throw new Error(`Location ${id} not found`);
	return loc;
}

/** Like getLoc but returns null instead of throwing — for asserting a location was removed. */
export async function getLocOrNull(id: number): Promise<Location | null> {
	return withApi(async (api, locId) => api.fetchLocation(locId), id);
}

export async function getAllLocs(): Promise<Location[]> {
	return withApi(async (api) => api.fetchAllLocations());
}

export async function getLocCount(): Promise<number> {
	return withApi(async (api) => api.getLocationCount());
}

export async function refreshSelections(): Promise<number[]> {
	return withApi(async (api) => (await api.syncSelections()).ids);
}

export async function createTag(
	name: string,
): Promise<{ id: number; name: string; color: string }> {
	return withApi(async (api, n) => (await api.resolveTagNames([n]))[0], name);
}
