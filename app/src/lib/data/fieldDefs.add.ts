import type { ExtraFieldDef } from "@/types";
import type { Location } from "@/types";
import { getSettings } from "@/store/settings.add";

export interface EnrichFieldOption {
	key: string;
	label: string;
}

const coreFieldOptions: EnrichFieldOption[] = [
	{ key: "altitude", label: "Altitude" },
	{ key: "countryCode", label: "Country code" },
	{ key: "cameraType", label: "Camera type" },
	{ key: "panoType", label: "Pano type" },
	{ key: "imageDate", label: "Image date" },
	{ key: "datetime", label: "Exact date" },
	{ key: "timezone", label: "Timezone" },
];

const pluginFieldOptions: EnrichFieldOption[] = [];

export function getEnrichFieldOptions(): EnrichFieldOption[] {
	return [...coreFieldOptions, ...pluginFieldOptions];
}

export function registerEnrichFields(fields: EnrichFieldOption[]) {
	for (const f of fields) {
		if (!pluginFieldOptions.some((e) => e.key === f.key)) pluginFieldOptions.push(f);
	}
}

export function getAllEnrichKeys(): string[] {
	return getEnrichFieldOptions().map((f) => f.key);
}


export interface EnrichmentProvider {
	id: string;
	enrich(locations: Location[], enrichFields: string[] | null): Promise<Map<number, Record<string, unknown>>>;
	fieldDefs: Record<string, ExtraFieldDef>;
}

const providers: EnrichmentProvider[] = [];

export function registerEnrichmentProvider(provider: EnrichmentProvider) {
	if (!providers.some((p) => p.id === provider.id)) providers.push(provider);
}

export function getEnrichmentProviders(): EnrichmentProvider[] {
	return providers;
}

export function isFieldEnabled(enrichFields: string[] | null, key: string): boolean {
	if ((key === "datetime" || key === "timezone") && !getSettings().showExactDate) return false;
	return !enrichFields || enrichFields.includes(key);
}

export function filterEnrichPatch(
	patch: Record<string, unknown>,
	enrichFields: string[] | null,
): Record<string, unknown> {
	if (!enrichFields) return patch;
	const filtered: Record<string, unknown> = {};
	for (const key of enrichFields) {
		if (key in patch) filtered[key] = patch[key];
	}
	return filtered;
}

export const ENRICHMENT_FIELD_DEFS: Record<string, ExtraFieldDef> = {
	altitude: { type: "number", label: "Altitude" },
	countryCode: { type: "string", label: "Country code" },
	cameraType: {
		type: "enum",
		label: "Camera type",
		values: ["gen1", "gen2", "gen4", "badcam", "tripod"],
		labels: { gen1: "Gen 1", gen2: "Gen 2", gen4: "Gen 4", badcam: "Bad cam", tripod: "Tripod" },
	},
	panoType: {
		type: "enum",
		label: "Pano type",
		values: ["2", "3", "10"],
		labels: { "2": "Official", "3": "Unknown", "10": "User uploaded" },
	},
	imageDate: { type: "month", label: "Image date" },
	datetime: { type: "date", label: "Exact date" },
	timezone: { type: "enum", label: "Timezone" },
};
