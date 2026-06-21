import { pointInPolygon } from "@/lib/geo/geo";
import type { LatLng } from "@/types";

export function randomPointInBounds(
	south: number,
	north: number,
	west: number,
	east: number,
): LatLng {
	const sinS = Math.sin((south * Math.PI) / 180);
	const sinN = Math.sin((north * Math.PI) / 180);
	const lat = (Math.asin(Math.random() * (sinN - sinS) + sinS) * 180) / Math.PI;
	const lng = west + Math.random() * (east - west);
	return { lat, lng };
}

export function getBoundingBox(
	feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
): [west: number, south: number, east: number, north: number] {
	let west = Infinity,
		south = Infinity,
		east = -Infinity,
		north = -Infinity;
	const coords =
		feature.geometry.type === "Polygon"
			? [feature.geometry.coordinates]
			: feature.geometry.coordinates;
	for (const poly of coords) {
		for (const ring of poly) {
			for (const [lng, lat] of ring) {
				if (lng < west) west = lng;
				if (lng > east) east = lng;
				if (lat < south) south = lat;
				if (lat > north) north = lat;
			}
		}
	}
	return [west, south, east, north];
}

interface CompiledPart {
	w: number;
	s: number;
	e: number;
	n: number;
	rings: number[][][];
}
const compiledCache = new WeakMap<object, CompiledPart[]>();

function compileParts(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): CompiledPart[] {
	const cached = compiledCache.get(geometry);
	if (cached) return cached;
	const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
	const parts: CompiledPart[] = polys.map((rings) => {
		let w = Infinity,
			s = Infinity,
			e = -Infinity,
			n = -Infinity;
		for (const [lng, lat] of rings[0]) {
			if (lng < w) w = lng;
			if (lng > e) e = lng;
			if (lat < s) s = lat;
			if (lat > n) n = lat;
		}
		return { w, s, e, n, rings };
	});
	compiledCache.set(geometry, parts);
	return parts;
}

export function pointInGeoJsonGeometry(
	lng: number,
	lat: number,
	geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): boolean {
	for (const part of compileParts(geometry)) {
		if (lng < part.w || lng > part.e || lat < part.s || lat > part.n) continue;
		if (pointInPolygon(lng, lat, part.rings)) return true;
	}
	return false;
}
