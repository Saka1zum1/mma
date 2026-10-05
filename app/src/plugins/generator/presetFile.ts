import type { PolygonGeometry } from "@/bindings.gen";
import { polygonFeatureCollection, polygonsFromGeoJSON } from "@/lib/util/loadGeoJSON";
import { DEFAULT_SETTINGS, type GeneratorSettings } from "./engine/types";

const MEMBER = "generator";

export interface GeneratorPreset {
	settings: GeneratorSettings | null;
	tagName: string | null;
	polygons: PolygonGeometry[];
}

function normalizeGeneratorSettings(raw: unknown): GeneratorSettings | null {
	if (!raw || typeof raw !== "object") return null;
	const saved = raw as Partial<GeneratorSettings>;
	return {
		...DEFAULT_SETTINGS,
		...saved,
		traverse: { ...DEFAULT_SETTINGS.traverse, ...saved.traverse },
		tags: { ...DEFAULT_SETTINGS.tags, ...saved.tags },
		notification: { ...DEFAULT_SETTINGS.notification, ...saved.notification },
		filterByAltitude: { ...DEFAULT_SETTINGS.filterByAltitude, ...saved.filterByAltitude },
		filterByMinutes: { ...DEFAULT_SETTINGS.filterByMinutes, ...saved.filterByMinutes },
		filterByProcdate: { ...DEFAULT_SETTINGS.filterByProcdate, ...saved.filterByProcdate },
		findByAuthor: { ...DEFAULT_SETTINGS.findByAuthor, ...saved.findByAuthor },
	};
}

/** A GeoJSON FeatureCollection of the regions that also carries the generator settings. */
export function writeGeneratorPreset(
	settings: GeneratorSettings,
	tagName: string,
	polygons: PolygonGeometry[],
) {
	return { ...polygonFeatureCollection(polygons), [MEMBER]: { settings, tagName } };
}

/** Read a preset file. Plain GeoJSON reads as regions with no settings. */
export function readGeneratorPreset(data: unknown): GeneratorPreset {
	const member = (data as { [MEMBER]?: { settings?: unknown; tagName?: unknown } } | null)?.[
		MEMBER
	];
	return {
		settings: member?.settings ? normalizeGeneratorSettings(member.settings) : null,
		tagName: typeof member?.tagName === "string" ? member.tagName : null,
		polygons: polygonsFromGeoJSON(data),
	};
}
