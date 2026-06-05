import { fetchSvMetadata } from "@/lib/sv/svMeta";
import { resolveExactTimestamp } from "@/lib/sv/exactDate.add";
import { resolveTimezone } from "@/lib/util/timezone.add";
import { getCurrentMap, patchLocationExtra } from "@/store/useMapStore";
import {
	filterEnrichPatch,
	isFieldEnabled,
	getEnrichmentProviders,
	getDefaultEnrichKeys,
} from "@/lib/data/fieldDefs.add";
import {
	registerSvResolver,
	runResolvers,
	type SvResolver,
	type ResolverOutcome,
} from "@/lib/sv/svRunner.add";
import { log } from "@/lib/util/log";
import type { Location } from "@/types";

export function needsEnrichment(loc: Location): boolean {
	return loc.extra?.countryCode == null;
}

export function buildPatch(
	data: google.maps.StreetViewPanoramaData,
	loc: Location,
	enrichFields: string[] | null,
): Record<string, unknown> | null {
	if (!data.extra) return null;
	const fullPatch: Record<string, unknown> = {
		altitude: data.extra.altitude ?? 0,
		countryCode: data.extra.countryCode ?? null,
		cameraType: data.extra.cameraType ?? null,
		panoType: data.extra.panoType ?? null,
		drivingDirection: data.extra.drivingDirection ?? null,
		uploaderName: data.extra.uploaderName ?? null,
		imageDate: data.imageDate || null,
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
	// Single merged pass: gather the core patch and every provider's patch against the
	// same base, then write once. Per-provider writes would each rebuild extra from a
	// stale base and clobber the previous provider's keys.
	const corePatch = buildPatch(data, loc, enrichFields) ?? {};
	const providerPatches = await Promise.all(
		getEnrichmentProviders().map((provider) =>
			provider.enrich([loc], enrichFields).then((m) => m.get(loc.id)),
		),
	);
	const merged = Object.assign({}, corePatch, ...providerPatches.filter(Boolean));
	if (Object.keys(merged).length > 0) await patchLocationExtra(loc, merged);

	return true;
}

// --- Resolvers ---

/** Core metadata enrichment: pano data -> `extra` fields. Drives the provider pass. */
export const enrichMetaResolver: SvResolver = {
	id: "enrichMeta",
	label: "Enrich metadata",
	pending: (loc, force) => force || needsEnrichment(loc),
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
 *  Self-contained post phase -- runs after `imageDate` is populated, with its own
 *  concurrency, on fresh store data. */
export const exactDateResolver: SvResolver = {
	id: "exactDate",
	label: "Resolve exact dates",
	pending: (loc, force) => !!loc.extra?.imageDate && (force || loc.extra?.datetime == null),
	postUnits: (locs, force) =>
		locs.filter((l) => l.extra?.imageDate && (force || l.extra?.datetime == null)).length,
	post: async (locations, { signal, force, config, onUnit }) => {
		const out: ResolverOutcome = { success: [], failed: [] };
		const enrichFields = (config as string[] | null) ?? getDefaultEnrichKeys();
		const datePending = locations.filter(
			(l) => l.extra?.imageDate && (force || l.extra?.datetime == null),
		);
		let next = 0;
		async function worker() {
			while (next < datePending.length) {
				signal?.throwIfAborted();
				const loc = datePending[next++];
				try {
					const ts = await resolveExactTimestamp(loc.lat, loc.lng, loc.extra!.imageDate as string);
					const tz = resolveTimezone(loc.lat, loc.lng);
					const patch = filterEnrichPatch({ datetime: ts, timezone: tz }, enrichFields);
					if (Object.keys(patch).length > 0) patchLocationExtra(loc, patch);
					out.success.push(loc.id);
				} catch (e) {
					log.warn(
						`[exactDate] failed for ${loc.id} (${loc.lat},${loc.lng} ${loc.extra!.imageDate}):`,
						e,
					);
					out.failed.push(loc.id);
				}
				onUnit();
			}
		}
		await Promise.all(Array.from({ length: Math.min(1000, datePending.length) }, () => worker()));
		return out;
	},
};

registerSvResolver(enrichMetaResolver);
registerSvResolver(exactDateResolver);

export interface EnrichResult {
	metaSuccess: number[];
	metaFailed: number[];
	dateSuccess: number[];
	dateFailed: number[];
}

/** Bulk enrich: selector over the resolver engine. Runs `enrichMeta` (+ providers),
 *  and `exactDate` when the datetime field is enabled. */
export async function enrichAll(
	locations: Location[],
	opts: {
		signal?: AbortSignal;
		force?: boolean;
		onProgress?: (done: number, total: number) => void;
	} = {},
): Promise<EnrichResult> {
	const empty: EnrichResult = { metaSuccess: [], metaFailed: [], dateSuccess: [], dateFailed: [] };
	const map = getCurrentMap();
	if (!map) return empty;
	const enrichFields = map.meta.settings.enrichFields ?? getDefaultEnrichKeys();
	const exactDates = isFieldEnabled(enrichFields, "datetime");

	const selected: { id: string; config?: unknown }[] = [{ id: "enrichMeta", config: enrichFields }];
	if (exactDates) selected.push({ id: "exactDate", config: enrichFields });

	const run = await runResolvers(locations, selected, opts);
	return {
		metaSuccess: run.enrichMeta?.success ?? [],
		metaFailed: run.enrichMeta?.failed ?? [],
		dateSuccess: run.exactDate?.success ?? [],
		dateFailed: run.exactDate?.failed ?? [],
	};
}
