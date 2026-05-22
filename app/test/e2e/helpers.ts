/**
 * Shared helpers for E2E tests.
 * All browser calls go through withApi, which injects the test API as `api`.
 */

import type { TestAPI } from "@/lib/testApi.add";
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
     const makeLoc = (o = {}) => ({ id: 0, lat: Math.random() * 170 - 85, lng: Math.random() * 360 - 180, heading: Math.random() * 360, pitch: 0, zoom: 1, panoId: null, flags: 0, tags: [], createdAt: new Date().toISOString(), ...o });
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

export function makeLoc(overrides: Partial<Location> = {}): Location {
	return {
		id: 0, // placeholder; Rust assigns the real ID on insert
		lat: Math.random() * 170 - 85,
		lng: Math.random() * 360 - 180,
		heading: Math.random() * 360,
		pitch: 0,
		zoom: 1,
		panoId: null,
		flags: 0,
		tags: [],
		createdAt: new Date().toISOString(),
		...overrides,
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeLocBatch(
	count: number,
	overrides: Record<string, any> | ((i: number) => Record<string, any>) = {},
): string {
	const overrideFn = typeof overrides === "function";
	if (overrideFn) {
		return `
      const locs = [];
      const overrideFn = ${overrides.toString()};
      for (let i = 0; i < ${count}; i++) {
        locs.push({
          lat: Math.random() * 170 - 85,
          lng: Math.random() * 360 - 180,
          heading: Math.random() * 360,
          pitch: 0, zoom: 1, panoId: null, flags: 0, tags: [],
          createdAt: new Date().toISOString(),
          ...overrideFn(i),
        });
      }
    `;
	}
	const ovStr = JSON.stringify(overrides);
	return `
    const locs = [];
    for (let i = 0; i < ${count}; i++) {
      locs.push({
        lat: Math.random() * 170 - 85,
        lng: Math.random() * 360 - 180,
        heading: Math.random() * 360,
        pitch: 0, zoom: 1, panoId: null, flags: 0, tags: [],
        createdAt: new Date().toISOString(),
        ...${ovStr},
      });
    }
  `;
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
