import { KNOWN_FIELDS, type ExtraFieldDef, type Location } from "@/bindings.gen";
import { registerPluginFieldDefs, unregisterPluginFieldDefs } from "@/lib/data/fieldDefRegistry";
import { trackDisposable } from "@/plugins/scope";

export interface EnrichFieldOption {
	key: string;
	label: string;
	/** Excluded from the default field set (null enrichFields); user must opt in. */
	defaultOff?: boolean;
}

const coreFieldOptions: EnrichFieldOption[] = KNOWN_FIELDS.map((f) => ({
	key: f.key,
	label: f.label,
	defaultOff: f.defaultOff,
}));

const pluginFieldOptions: EnrichFieldOption[] = [];

/** Field defs for catalog keys, for providers that write well-known SV fields. */
export function knownFieldDefs(...keys: string[]): Record<string, ExtraFieldDef> {
	const out: Record<string, ExtraFieldDef> = {};
	for (const key of keys) {
		const f = KNOWN_FIELDS.find((k) => k.key === key);
		if (!f) continue;
		out[key] = {
			type: f.type,
			label: f.label,
			values: f.values.length > 0 ? [...f.values] : null,
			labels: f.labels.length > 0 ? Object.fromEntries(f.labels) : null,
			comparison: f.circularPeriod != null ? { type: "circular", period: f.circularPeriod } : null,
		};
	}
	return out;
}

export function getEnrichFieldOptions(): EnrichFieldOption[] {
	return [...coreFieldOptions, ...pluginFieldOptions];
}

/** Offer extra fields in the enrichment UI. Unregistered when the plugin deactivates. */
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
	return getEnrichFieldOptions()
		.filter((f) => !f.defaultOff)
		.map((f) => f.key);
}

/** Optional context passed by the bulk runner. Cheap providers can ignore it. */
export interface EnrichCtx {
	signal?: AbortSignal;
	force?: boolean;
	/** Advance the bulk progress bar by one unit. */
	onUnit?: () => void;
	/** Report a location that errored (surfaced as failed in the bulk summary). */
	onFail?: (id: number) => void;
}

export interface EnrichmentProvider {
	id: string;
	/** Bulk progress label for slow providers; omit for instant ones. */
	label?: string;
	enrich(
		locations: Location[],
		enrichFields: string[] | null,
		ctx?: EnrichCtx,
	): Promise<Map<number, Record<string, unknown>>>;
	fieldDefs: Record<string, ExtraFieldDef>;
	/** Fields this provider reads: schedules it into a later dependency wave than any
	 *  provider producing them (core-written fields like imageDate precede wave 1). */
	requires?: string[];
	/** Progress units this provider would contribute in bulk (absent = instant). */
	units?(locations: Location[], enrichFields: string[] | null, force?: boolean): number;
	/** Transform a raw partition value per-location. Return null to skip. */
	transform?(field: string, value: string, location: Location): string | null;
}

/** Schedule providers into dependency waves: a provider runs once no other
 *  unscheduled provider produces (via `fieldDefs`) a field it `requires`.
 *  A dependency cycle falls back to running the remainder as one wave. */
export function providerWaves(list: EnrichmentProvider[]): EnrichmentProvider[][] {
	const waves: EnrichmentProvider[][] = [];
	let remaining = [...list];
	while (remaining.length > 0) {
		let wave = remaining.filter(
			(p) => !p.requires?.some((r) => remaining.some((q) => q !== p && r in q.fieldDefs)),
		);
		if (wave.length === 0) wave = remaining;
		waves.push(wave);
		remaining = remaining.filter((p) => !wave.includes(p));
	}
	return waves;
}

const providers: EnrichmentProvider[] = [];

/** Register a provider that computes extra fields during enrichment (e.g. sun position).
 *  Unregistered when the plugin deactivates. */
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

export function getProviderForField(field: string): EnrichmentProvider | undefined {
	return providers.find((p) => field in p.fieldDefs);
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
