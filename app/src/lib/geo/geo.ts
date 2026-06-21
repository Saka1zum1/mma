import type { LatLng } from "@/types";

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i];
		const [xj, yj] = ring[j];
		const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

export function pointInPolygon(lng: number, lat: number, coordinates: number[][][]): boolean {
	if (coordinates.length === 0) return false;
	if (!pointInRing(lng, lat, coordinates[0])) return false;
	for (let i = 1; i < coordinates.length; i++) {
		if (pointInRing(lng, lat, coordinates[i])) return false;
	}
	return true;
}

export function distMeters(a: LatLng, b: LatLng): number {
	const { lat: lat1, lng: lng1 } = a;
	const { lat: lat2, lng: lng2 } = b;
	const R = 6371000;
	const f1 = (lat1 * Math.PI) / 180;
	const f2 = (lat2 * Math.PI) / 180;
	const df = ((lat2 - lat1) * Math.PI) / 180;
	const dl = ((lng2 - lng1) * Math.PI) / 180;
	const x = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
	return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
