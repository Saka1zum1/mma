import { fetchSvMetadata } from "@/lib/sv/svMeta";
import { resolveExactTimestamp } from "@/lib/sv/exactDate";
import { resolveTimezone } from "@/lib/util/timezone";
import { getCurrentMap, updateLocations, fetchLocationsByIds } from "@/store/useMapStore";
import {
	filterEnrichPatch,
	isFieldEnabled,
	getEnrichmentProviders,
	getDefaultEnrichKeys,
	registerEnrichmentProvider,
	providerWaves,
	type EnrichmentProvider,
} from "@/lib/data/fieldDefs";
import { registerSvResolver, runResolvers, type SvResolver } from "@/lib/sv/svRunner";
import { SV_CONCURRENCY } from "@/lib/sv/constants";
import { log } from "@/lib/util/log";
import type { Location } from "@/bindings.gen";

/** True when the location is missing any of the given enrich fields (default: the enabled set). */
export function needsEnrichment(loc: Location, enrichFields?: string[]): boolean {
	const fields = enrichFields ?? getDefaultEnrichKeys();
	return fields.some((key) => loc.extra?.[key] == null);
}

export function buildPatch(
	data: google.maps.StreetViewPanoramaData,
	loc: Location,
	enrichFields: string[] | null,
): Record<string, unknown> | null {
	if (!data.extra) return null;
	const pad2 = (n: number) => String(n).padStart(2, "0");
	const fullPatch: Record<string, unknown> = {
		altitude: data.extra.altitude ?? 0,
		countryCode: data.extra.countryCode ?? null,
		cameraType: data.extra.cameraType ?? null,
		panoType: data.extra.panoType ?? null,
		drivingDirection: data.extra.drivingDirection ?? null,
		uploaderName: data.extra.uploaderName ?? null,
		imageDate: data.imageDate || null,
		coverageDates:
			data.time
				?.filter((t) => t.date)
				.map((t) => `${t.date!.getFullYear()}-${pad2(t.date!.getMonth() + 1)}`) ?? [],
	};
	const filtered = filterEnrichPatch(fullPatch, enrichFields);
	// Stale exact-date data is wrong once imageDate changes; clear it regardless of the
	// active enrich set (the filter would otherwise drop the null when datetime is off).
	if (loc.extra?.imageDate !== fullPatch.imageDate && loc.extra?.datetime != null) {
		filtered.datetime = null;
		filtered.timezone = null;
	}
	return filtered;
}

/** Enrich a single location (used on pano load). */
export async function enrich(
	loc: Location,
	data?: google.maps.StreetViewPanoramaData | null,
): Promise<boolean> {
	if (!data) {
		if (!loc.panoId) return false;
		[data] = await fetchSvMetadata([loc.panoId]);
		if (!data) return false;
	}
	const map = getCurrentMap();
	if (!map || !(map.meta.settings.enrichMetadata ?? true)) return false;
	const enrichFields = map.meta.settings.enrichFields ?? getDefaultEnrichKeys();
	const write = (extra: Record<string, unknown>) =>
		updateLocations([{ id: loc.id, patch: { extra } }], { undoable: false });

	const corePatch = buildPatch(data, loc, enrichFields);
	if (corePatch && Object.keys(corePatch).length > 0) await write(corePatch);

	// Providers run in dependency waves against fresh store data, same as the bulk
	// path: core fields (imageDate) are in place before wave 1, and a provider that
	// `requires` another provider's field sees it written before its wave runs.
	for (const wave of providerWaves(getEnrichmentProviders())) {
		const [fresh] = await fetchLocationsByIds([loc.id]);
		if (!fresh) break;
		const results = await Promise.all(
			wave.map((provider) => provider.enrich([fresh], enrichFields).then((m) => m.get(loc.id))),
		);
		const merged = Object.assign({}, ...results.filter(Boolean));
		if (Object.keys(merged).length > 0) await write(merged);
	}
	return true;
}

// --- Resolvers ---

/** Core metadata enrichment: pano data -> `extra` fields. Drives the provider pass. */
export const enrichMetaResolver: SvResolver = {
	id: "enrichMeta",
	label: "Enrich metadata",
	pending: (loc, force) => {
		if (force) return true;
		const map = getCurrentMap();
		const fields = map?.meta.settings.enrichFields ?? getDefaultEnrichKeys();
		return needsEnrichment(loc, fields);
	},
	needsPanoResolve: (loc) => !loc.panoId,
	needsMetadata: true,
	runsProviders: true,
	resolve: (loc, data, ctx) => {
		if (!data) return null;
		const patch = buildPatch(data, loc, (ctx.config as string[] | null) ?? null);
		return patch ? { extra: patch } : null;
	},
};

/** Exact capture timestamp: binary-searches Google's SingleImageSearch per location.
 *  A slow enrichment provider -- runs in a dependency wave after the core metadata
 *  pass has written `imageDate`. */
export const exactDateProvider: EnrichmentProvider = {
	id: "exactDate",
	label: "Exact dates",
	requires: ["imageDate"],
	fieldDefs: {
		datetime: { type: "date", label: "Exact date" },
		timezone: { type: "enum", label: "Timezone" },
	},
	units: (locations, enrichFields, force) =>
		isFieldEnabled(enrichFields, "datetime")
			? locations.filter((l) => l.extra?.imageDate && (force || l.extra?.datetime == null)).length
			: 0,
	async enrich(locations, enrichFields, ctx) {
		const out = new Map<number, Record<string, unknown>>();
		if (!isFieldEnabled(enrichFields, "datetime")) return out;
		const pending = locations.filter(
			(l) => l.extra?.imageDate && (ctx?.force || l.extra?.datetime == null),
		);
		let next = 0;
		async function worker() {
			// On abort, stop early and return what resolved so far -- the runner
			// persists partial results before propagating the abort.
			while (next < pending.length && !ctx?.signal?.aborted) {
				const loc = pending[next++];
				try {
					const ts = await resolveExactTimestamp(
						loc.lat,
						loc.lng,
						loc.extra!.imageDate as string,
						ctx?.signal,
					);
					const tz = resolveTimezone(loc.lat, loc.lng);
					const patch = filterEnrichPatch({ datetime: ts, timezone: tz }, enrichFields);
					if (Object.keys(patch).length > 0) out.set(loc.id, patch);
				} catch (e) {
					// An abort mid-search is not a failure -- bail without recording one.
					if (ctx?.signal?.aborted) return;
					log.warn(
						`[exactDate] failed for ${loc.id} (${loc.lat},${loc.lng} ${loc.extra!.imageDate}):`,
						e,
					);
					ctx?.onFail?.(loc.id);
				}
				ctx?.onUnit?.();
			}
		}
		await Promise.all(
			Array.from({ length: Math.min(SV_CONCURRENCY, pending.length) }, () => worker()),
		);
		return out;
	},
};

registerSvResolver(enrichMetaResolver);
registerEnrichmentProvider(exactDateProvider);

/** One summary row per pass that did work: the core metadata pass, then every
 *  provider that updated or failed at least one location. */
export interface EnrichOutcome {
	id: string;
	label: string;
	success: number[];
	failed: number[];
}
export type EnrichResult = EnrichOutcome[];

/** Bulk enrich: selector over the resolver engine. Runs `enrichMeta`, then the
 *  enrichment providers (exact date among them) in dependency waves. */
export async function enrichAll(
	locations: Location[],
	opts: {
		signal?: AbortSignal;
		force?: boolean;
		onProgress?: (done: number, total: number, label?: string) => void;
	} = {},
): Promise<EnrichResult> {
	const map = getCurrentMap();
	if (!map) return [];
	const enrichFields = map.meta.settings.enrichFields ?? getDefaultEnrichKeys();

	const run = await runResolvers(locations, [{ id: "enrichMeta", config: enrichFields }], opts);
	const labelOf = (id: string) =>
		id === "enrichMeta"
			? "Metadata"
			: (getEnrichmentProviders().find((p) => p.id === id)?.label ?? id);
	return Object.entries(run)
		.filter(([, o]) => o.success.length > 0 || o.failed.length > 0)
		.map(([id, o]) => ({ id, label: labelOf(id), ...o }));
}
