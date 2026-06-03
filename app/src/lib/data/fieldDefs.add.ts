import type { ExtraFieldDef } from "@/types";
import type { Location } from "@/types";
import { registerPluginFieldDefs, unregisterPluginFieldDefs } from "@/lib/data/fieldDefRegistry";
import { trackDisposable } from "@/plugins/scope";

export interface EnrichFieldOption {
	key: string;
	label: string;
	/** Excluded from the default field set (null enrichFields); user must opt in. */
	defaultOff?: boolean;
}

const coreFieldOptions: EnrichFieldOption[] = [
	{ key: "altitude", label: "Altitude" },
	{ key: "countryCode", label: "Country code" },
	{ key: "cameraType", label: "Camera type" },
	{ key: "panoType", label: "Pano type" },
	{ key: "imageDate", label: "Image date" },
	{ key: "datetime", label: "Exact date", defaultOff: true },
	{ key: "timezone", label: "Timezone", defaultOff: true },
	{ key: "drivingDirection", label: "Driving direction", defaultOff: true },
	{ key: "uploaderName", label: "Uploader", defaultOff: true },
];

const pluginFieldOptions: EnrichFieldOption[] = [];

export function getEnrichFieldOptions(): EnrichFieldOption[] {
	return [...coreFieldOptions, ...pluginFieldOptions];
}

export function registerEnrichFields(fields: EnrichFieldOption[]) {
	for (const f of fields) {
		if (!pluginFieldOptions.some((e) => e.key === f.key)) {
			pluginFieldOptions.push(f);
			trackDisposable(() => {
				const i = pluginFieldOptions.findIndex((e) => e.key === f.key);
				if (i >= 0) pluginFieldOptions.splice(i, 1);
			});
		}
	}
}

export function getAllEnrichKeys(): string[] {
	return getEnrichFieldOptions().map((f) => f.key);
}

/** Keys enriched when enrichFields is null (the default set: all options except defaultOff ones). */
export function getDefaultEnrichKeys(): string[] {
	return getEnrichFieldOptions().filter((f) => !f.defaultOff).map((f) => f.key);
}


export interface EnrichmentProvider {
	id: string;
	enrich(locations: Location[], enrichFields: string[] | null): Promise<Map<number, Record<string, unknown>>>;
	fieldDefs: Record<string, ExtraFieldDef>;
	/** When set, this provider is auto-invoked after patchLocationExtra writes any of these fields. */
	requires?: string[];
}

const providers: EnrichmentProvider[] = [];

export function registerEnrichmentProvider(provider: EnrichmentProvider) {
	if (!providers.some((p) => p.id === provider.id)) {
		providers.push(provider);
		registerPluginFieldDefs(provider.fieldDefs);
		const defKeys = Object.keys(provider.fieldDefs);
		trackDisposable(() => {
			const i = providers.findIndex((p) => p.id === provider.id);
			if (i >= 0) providers.splice(i, 1);
			unregisterPluginFieldDefs(defKeys);
		});
	}
}

export function getEnrichmentProviders(): EnrichmentProvider[] {
	return providers;
}

export function getTriggeredProviders(patchedKeys: string[]): EnrichmentProvider[] {
	const keySet = new Set(patchedKeys);
	return providers.filter(
		(p) => p.requires && p.requires.some((r) => keySet.has(r)),
	);
}

export function isFieldEnabled(enrichFields: string[] | null, key: string): boolean {
	return (enrichFields ?? getDefaultEnrichKeys()).includes(key);
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

