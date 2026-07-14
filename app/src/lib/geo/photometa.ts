// Photometa API for fetching Street View panorama dots.

import type { Location } from "@/bindings.gen";
import type { LatLng } from "@/types";
import type { RequireNonNull } from "@/types/util";
import { latLngToWorld, worldToTile } from "@/lib/geo/mercator";

const TILE_ZOOM = 17;

export type PanoDot = LatLng & RequireNonNull<Pick<Location, "panoId">>;

export type Tile = { x: number; y: number };

export function boundsToTiles(west: number, south: number, east: number, north: number): Tile[] {
	const nw = latLngToWorld({ lat: north, lng: west });
	const se = latLngToWorld({ lat: south, lng: east });
	const tl = worldToTile(nw.x, nw.y, TILE_ZOOM);
	const br = worldToTile(se.x, se.y, TILE_ZOOM);
	const tiles: Tile[] = [];
	for (let x = tl.x; x <= br.x; x++) for (let y = tl.y; y <= br.y; y++) tiles.push({ x, y });
	return tiles;
}

export function tileKey(t: Tile) {
	return `${t.x},${t.y}`;
}

function buildPhotometaUrl(tx: number, ty: number): string {
	// Protobuf request: context { client: "apiv3", language: "en" }, tile { x, y, zoom: 17 }
	// Field layout for context (field 1): 1s = client, 5s = language
	// Field layout for tile (field 6): 1i = x, 2i = y, 3i = zoom
	const ctx = `1sapiv3!5sen`;
	const tile = `1i${tx}!2i${ty}!3i${TILE_ZOOM}`;
	const pb = `!1m2!${ctx}!6m3!${tile}`;
	return `https://www.google.com/maps/photometa/ac/v1?pb=${pb}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw protobuf response
function parsePanoDots(data: any): PanoDot[] {
	try {
		const container = data?.[1];
		if (!container) return [];
		const entries = container?.[1];
		if (!Array.isArray(entries)) return [];
		const dots: PanoDot[] = [];
		for (const entry of entries) {
			const info = entry?.[0];
			const pos = info?.[2]?.[0];
			const panoId = info?.[0]?.[1];
			if (!pos) continue;
			const lat = pos[2];
			const lng = pos[3];
			if (typeof lat === "number" && typeof lng === "number") {
				dots.push({ lat, lng, panoId });
			}
		}
		return dots;
	} catch {
		return [];
	}
}

export async function fetchPanoDotsWithIds(tile: { x: number; y: number }): Promise<PanoDot[]> {
	const dots = await fetchPanoDots(tile);
	return dots.filter((d): d is PanoDot => typeof d.panoId === "string");
}

const cache = new Map<string, PanoDot[] | Promise<PanoDot[]>>();
const CACHE_MAX = 2000;

/** Resolved dots for a tile, or undefined while unfetched/in flight. */
export function peekPanoDots(tile: Tile): PanoDot[] | undefined {
	const cached = cache.get(tileKey(tile));
	return Array.isArray(cached) ? cached : undefined;
}

export function fetchPanoDots(tile: { x: number; y: number }): PanoDot[] | Promise<PanoDot[]> {
	const key = tileKey(tile);
	const cached = cache.get(key);
	if (cached) return cached;

	const promise = (async () => {
		try {
			const url = buildPhotometaUrl(tile.x, tile.y);
			const res = await fetch(url, { referrerPolicy: "no-referrer" });
			if (!res.ok) return [];
			const text = await res.text();
			const json = JSON.parse(text.replace(/^\)\]\}'\n/, ""));
			const dots = parsePanoDots(json);
			cache.set(key, dots);
			return dots;
		} catch {
			cache.delete(key);
			return [];
		}
	})();

	cache.set(key, promise);
	for (const k of cache.keys()) {
		if (cache.size <= CACHE_MAX) break;
		cache.delete(k);
	}
	return promise;
}
