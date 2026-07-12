// Web Mercator projection (256px world at zoom 0, Google Maps convention).

import type { LatLng } from "@/types";

export const WORLD_SIZE = 256;

export function latLngToWorld(p: LatLng): { x: number; y: number } {
	const siny = Math.min(Math.max(Math.sin((p.lat * Math.PI) / 180), -0.9999), 0.9999);
	return {
		x: (p.lng / 360 + 0.5) * WORLD_SIZE,
		y: (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * WORLD_SIZE,
	};
}

export function worldToLatLng(x: number, y: number): LatLng {
	const n = Math.PI * (1 - (2 * y) / WORLD_SIZE);
	return {
		lat: (Math.atan(Math.sinh(n)) * 180) / Math.PI,
		lng: (x / WORLD_SIZE - 0.5) * 360,
	};
}

export function worldToTile(wx: number, wy: number, zoom: number): { x: number; y: number } {
	const scale = 2 ** zoom;
	return {
		x: Math.floor((wx * scale) / WORLD_SIZE),
		y: Math.floor((wy * scale) / WORLD_SIZE),
	};
}

export function pixelToLatLng(globalPx: number, globalPy: number, zoom: number): LatLng {
	const scale = 2 ** zoom;
	return worldToLatLng(globalPx / scale, globalPy / scale);
}
