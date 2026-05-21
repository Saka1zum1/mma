import { fetchSvMetadata } from "@/lib/sv/svMeta";
import { resolveExactTimestamp } from "@/lib/sv/exactDate.add";
import { resolveTimezone } from "@/lib/util/timezone.add";
import {
	getCurrentMap,
	fetchAllLocations,
	batchUpdateLocations,
	patchLocationExtra,
	updateMapExtraFields,
} from "@/store/useMapStore";
import {
	ENRICHMENT_FIELD_DEFS,
	filterEnrichPatch,
	isFieldEnabled,
	getEnrichmentProviders,
} from "@/lib/data/fieldDefs.add";
import { resolvePanoIds } from "@/lib/sv/lookup.add";
import { log } from "@/lib/util/log";
import type { Location } from "@/types";

const BATCH_SIZE = 200;

export function needsEnrichment(loc: Location): boolean {
	return loc.extra?.countryCode == null;
}

function buildPatch(
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
		imageDate: data.imageDate || null,
	};
	if (loc.extra?.imageDate !== fullPatch.imageDate && loc.extra?.datetime != null) {
		fullPatch.datetime = null;
		fullPatch.timezone = null;
	}
	return filterEnrichPatch(fullPatch, enrichFields);
}

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
	const enrichFields = map.meta.settings.enrichFields;
	const patch = buildPatch(data, loc, enrichFields);
	if (patch) patchLocationExtra(loc.id, patch);

	for (const provider of getEnrichmentProviders()) {
		const patches = await provider.enrich([loc], enrichFields);
		const p = patches.get(loc.id);
		if (p) patchLocationExtra(loc.id, p);
	}

	return true;
}

export interface EnrichResult {
	metaSuccess: number[];
	metaFailed: number[];
	dateSuccess: number[];
	dateFailed: number[];
}

export async function enrichAll(
	opts: {
		signal?: AbortSignal;
		force?: boolean;
		onProgress?: (done: number, total: number) => void;
	} = {},
): Promise<EnrichResult> {
	const { signal, force, onProgress } = opts;
	const result: EnrichResult = { metaSuccess: [], metaFailed: [], dateSuccess: [], dateFailed: [] };
	const map = getCurrentMap();
	if (!map) return result;
	const enrichFields = map.meta.settings.enrichFields;
	const exactDates = isFieldEnabled(enrichFields, "datetime");

	const allLocations = await fetchAllLocations();
	const pending: Location[] = allLocations.filter((l) => force || needsEnrichment(l));

	if (pending.length === 0 && !exactDates) return result;

	let resolvedPanoIds: Map<number, string> | undefined;
	const noPano = pending.filter((l) => !l.panoId);
	if (noPano.length > 0) {
		const panoResult = await resolvePanoIds(noPano, {
			signal,
			onProgress,
		});
		result.metaFailed.push(...panoResult.failed);
		resolvedPanoIds = new Map(panoResult.resolved.map((r) => [r.id, r.panoId]));
	}

	const enrichable = pending.filter((l) => l.panoId || resolvedPanoIds?.has(l.id));
	const skipped = pending.length - enrichable.length;

	async function enrichBatch(
		batch: Location[],
		panoIds: string[],
	): Promise<{ id: number; patch: { extra: Record<string, unknown> } }[]> {
		signal?.throwIfAborted();
		const results = await fetchSvMetadata(panoIds);
		signal?.throwIfAborted();

		const allNull = results.every((r) => r == null);
		if (allNull && batch.length > 1) {
			const mid = Math.ceil(batch.length / 2);
			const left = await enrichBatch(batch.slice(0, mid), panoIds.slice(0, mid));
			const right = await enrichBatch(batch.slice(mid), panoIds.slice(mid));
			return [...left, ...right];
		}

		const updates: { id: number; patch: { extra: Record<string, unknown> } }[] = [];
		for (let j = 0; j < batch.length; j++) {
			const data = results[j];
			const loc = batch[j];
			if (!data) {
				result.metaFailed.push(loc.id);
				continue;
			}
			result.metaSuccess.push(loc.id);
			const patch = buildPatch(data, loc, enrichFields);
			if (!patch) continue;
			updates.push({ id: loc.id, patch: { extra: { ...loc.extra, ...patch } } });
		}
		return updates;
	}

	let totalEnriched = 0;
	for (let i = 0; i < enrichable.length; i += BATCH_SIZE) {
		signal?.throwIfAborted();
		const batch = enrichable.slice(i, i + BATCH_SIZE);
		const panoIds = batch.map((l) => l.panoId ?? resolvedPanoIds!.get(l.id)!);

		const updates = await enrichBatch(batch, panoIds);
		if (updates.length > 0) batchUpdateLocations(updates);
		totalEnriched += updates.length;

		onProgress?.(skipped + Math.min(i + batch.length, enrichable.length), pending.length);
	}

	if (exactDates) {
		const freshMap = getCurrentMap();
		if (!freshMap) return result;
		const allLocs = await fetchAllLocations();
		const datePending = allLocs.filter(
			(l) => l.extra?.imageDate && (force || l.extra?.datetime == null),
		);
		const metaDone = pending.length;
		let dateDone = 0;
		const dateTotal = datePending.length;
		const grandTotal = metaDone + dateTotal;

		let next = 0;
		async function dateWorker() {
			while (next < datePending.length) {
				signal?.throwIfAborted();
				const idx = next++;
				const loc = datePending[idx];
				try {
					const ts = await resolveExactTimestamp(loc.lat, loc.lng, loc.extra!.imageDate as string);
					const tz = resolveTimezone(loc.lat, loc.lng);
					const datePatch = filterEnrichPatch(
						{ datetime: ts, timezone: tz },
						freshMap!.meta.settings.enrichFields,
					);
					if (Object.keys(datePatch).length > 0) patchLocationExtra(loc.id, datePatch);
					result.dateSuccess.push(loc.id);
				} catch (e) {
					log.warn(
						`[enrichAll] exact date failed for ${loc.id} (${loc.lat},${loc.lng} ${loc.extra!.imageDate}):`,
						e,
					);
					result.dateFailed.push(loc.id);
				}
				dateDone++;
				onProgress?.(metaDone + dateDone, grandTotal);
			}
		}
		await Promise.all(Array.from({ length: Math.min(1000, dateTotal) }, () => dateWorker()));
	}

	// Run plugin enrichment providers
	const providers = getEnrichmentProviders();
	if (providers.length > 0) {
		const freshLocs = await fetchAllLocations();
		for (const provider of providers) {
			signal?.throwIfAborted();
			const patches = await provider.enrich(freshLocs, enrichFields);
			if (patches.size > 0) {
				const updates = [...patches.entries()].map(([id, patch]) => {
					const loc = freshLocs.find((l) => l.id === id);
					return { id, patch: { extra: { ...loc?.extra, ...patch } } };
				});
				batchUpdateLocations(updates);
				await updateMapExtraFields(provider.fieldDefs);
			}
		}
	}

	if (totalEnriched > 0 || result.dateSuccess.length > 0) {
		await updateMapExtraFields(ENRICHMENT_FIELD_DEFS);
	}

	return result;
}
