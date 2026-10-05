import type { PolygonGeometry } from "@/bindings.gen";
import { addPolygonSelections } from "@/lib/map/addPolygonSelections";

/** Polygons from a GeoJSON geometry, feature, or feature collection. */
export function polygonsFromGeoJSON(data: unknown): PolygonGeometry[] {
	const polygons: PolygonGeometry[] = [];
	const features =
		data && typeof data === "object" && (data as { type?: string }).type === "FeatureCollection"
			? ((data as { features?: unknown[] }).features ?? [])
			: [data];
	for (const feature of features) {
		if (!feature || typeof feature !== "object") continue;
		const f = feature as {
			type?: string;
			geometry?: { type?: string; coordinates?: unknown };
			properties?: unknown;
		};
		const geometry = f.type === "Feature" || f.geometry ? f.geometry : f;
		if (!geometry || typeof geometry !== "object") continue;
		const g = geometry as { type?: string; coordinates?: unknown };
		if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
			polygons.push({
				coordinates: g.coordinates as PolygonGeometry["coordinates"],
				properties: f.properties ?? undefined,
			});
		} else if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
			const [first, ...rest] = g.coordinates as PolygonGeometry["coordinates"][];
			if (!first) continue;
			const polygon: PolygonGeometry = {
				coordinates: first,
				properties: f.properties ?? undefined,
			};
			if (rest.length) polygon.extraPolygons = rest;
			polygons.push(polygon);
		}
	}
	return polygons;
}

/** A FeatureCollection of polygon geometries. */
export function polygonFeatureCollection(polygons: PolygonGeometry[]) {
	return {
		type: "FeatureCollection" as const,
		features: polygons.map((polygon) => ({
			type: "Feature" as const,
			properties: polygon.properties ?? {},
			geometry: {
				type: "Polygon" as const,
				coordinates: polygon.coordinates,
			},
		})),
	};
}

/** Prompt for GeoJSON file(s) and add their polygons as selections. */
export async function loadGeoJSON() {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = ".json,.geojson";
	input.multiple = true;
	input.onchange = async () => {
		if (!input.files) return;
		const polygons: PolygonGeometry[] = [];
		for (const file of input.files) {
			try {
				const text = await file.text();
				polygons.push(...polygonsFromGeoJSON(JSON.parse(text)));
			} catch {
				/* ignore malformed files */
			}
		}
		void addPolygonSelections(polygons);
	};
	input.click();
}
