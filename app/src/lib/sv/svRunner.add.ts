/**
 * Generic engine for Street-View-dependent bulk operations. Every such op derives
 * a `Partial<Location>` from a location's pano data; each is a `SvResolver`. The
 * runner does the shared work once -- resolve missing pano IDs, fetch metadata in
 * batches (with all-null bisection), merge every selected resolver's patch per
 * location, write once -- then runs any self-contained post phases (e.g. exact date)
 * and the enrichment providers.
 *
 * `enrichAll` and `bulkPinToPano` are thin selectors over this engine; the modal's
 * "Street View" operation runs an arbitrary set of resolvers.
 */

import type { Location, ExtraFieldDef } from "@/types";
import { batchUpdateLocations, fetchLocationsByIds } from "@/store/useMapStore";
import { fetchSvMetadata } from "@/lib/sv/svMeta";
import { resolvePanoIds } from "@/lib/sv/lookup.add";
import { getEnrichmentProviders } from "@/lib/data/fieldDefs.add";

const BATCH_SIZE = 200;

export type PanoData = google.maps.StreetViewResolvedPanoramaData;

export interface PostCtx {
	signal?: AbortSignal;
	force: boolean;
	config: unknown;
	/** Call once per unit of work completed, to advance the progress bar. */
	onUnit: () => void;
}

export interface SvResolver {
	id: string;
	label: string;
	/** Locations this resolver would act on, given `force` (drives counts + skip). */
	pending(loc: Location, force: boolean): boolean;
	/** Locations this resolver needs a coords->panoId resolution for (prelude). */
	needsPanoResolve?(loc: Location, force: boolean): boolean;
	/** Whether this resolver consumes fetched `PanoData` (joins the metadata phase). */
	needsMetadata?: boolean;
	/** Per-location patch derived in the metadata phase. `data` is null for resolvers
	 *  that don't need metadata (they act off the prelude-resolved panoId).
	 *  `ctx.resolvedPanoId` is set only when this run resolved the pano from coords. */
	resolve?(
		loc: Location,
		data: PanoData | null,
		ctx: { config: unknown; resolvedPanoId?: string },
	): Partial<Location> | null;
	/** Progress units this resolver's post phase contributes. */
	postUnits?(locations: Location[], force: boolean): number;
	/** Self-contained second phase using fresh store data (e.g. exact-date RPCs). */
	post?(locations: Location[], ctx: PostCtx): Promise<ResolverOutcome>;
	/** When set, the runner also runs the registered enrichment providers. */
	runsProviders?: boolean;
	fieldDefs?: Record<string, ExtraFieldDef>;
}

export interface ResolverOutcome {
	success: number[];
	failed: number[];
}
export type SvRunResult = Record<string, ResolverOutcome>;

const registry: SvResolver[] = [];

export function registerSvResolver(r: SvResolver) {
	if (!registry.some((x) => x.id === r.id)) registry.push(r);
}

export function getSvResolvers(): SvResolver[] {
	return registry;
}

/** Merge resolver patches for one location: `extra` deep-merges into the location's
 *  existing extra; every other key overwrites. Same rule as `fieldOps.planFieldSet`. */
function mergePatches(loc: Location, patches: Partial<Location>[]): Partial<Location> | null {
	const out: Record<string, unknown> = {};
	let extra: Record<string, unknown> | undefined;
	for (const p of patches) {
		for (const [k, v] of Object.entries(p)) {
			if (k === "extra")
				extra = { ...(extra ?? (loc.extra as Record<string, unknown>) ?? {}), ...(v as object) };
			else out[k] = v;
		}
	}
	if (extra) out.extra = extra;
	return Object.keys(out).length > 0 ? (out as Partial<Location>) : null;
}

export interface RunOpts {
	signal?: AbortSignal;
	force?: boolean;
	onProgress?: (done: number, total: number) => void;
}

export async function runResolvers(
	locations: Location[],
	selected: { id: string; config?: unknown }[],
	opts: RunOpts = {},
): Promise<SvRunResult> {
	const { signal, force = false, onProgress } = opts;
	const chosen = selected
		.map((s) => ({ r: registry.find((x) => x.id === s.id), config: s.config }))
		.filter((x): x is { r: SvResolver; config: unknown } => !!x.r);

	const result: SvRunResult = {};
	for (const { r } of chosen) result[r.id] = { success: [], failed: [] };
	if (chosen.length === 0) return result;

	const scopeIds = locations.map((l) => l.id);
	const configOf = (id: string) => chosen.find((c) => c.r.id === id)?.config;

	// --- Progress budget: prelude + metadata-phase units + each resolver's post units. ---
	const metaResolvers = chosen.filter(({ r }) => r.needsMetadata);
	const metaPending = locations.filter((l) => metaResolvers.some(({ r }) => r.pending(l, force)));
	const needResolve = locations.filter((l) =>
		chosen.some(({ r }) => r.pending(l, force) && r.needsPanoResolve?.(l, force)),
	);
	const postTotal = chosen.reduce(
		(sum, { r }) => sum + (r.post ? (r.postUnits?.(locations, force) ?? 0) : 0),
		0,
	);
	const grandTotal = needResolve.length + metaPending.length + postTotal;
	let done = 0;
	const tick = (n = 1) => {
		done += n;
		onProgress?.(done, grandTotal);
	};

	// --- Phase 0: resolve missing pano IDs for the union that needs them. ---
	let resolvedPanoIds: Map<number, string> | undefined;
	if (needResolve.length > 0) {
		let lastDone = 0;
		const pr = await resolvePanoIds(needResolve, {
			signal,
			onProgress: (d) => {
				tick(d - lastDone);
				lastDone = d;
			},
		});
		resolvedPanoIds = new Map(pr.resolved.map((x) => [x.id, x.panoId]));
	}
	const panoIdFor = (l: Location) => l.panoId ?? resolvedPanoIds?.get(l.id);

	// --- Resolvers that act off the prelude only (no metadata), e.g. pin to pano. ---
	const flagResolvers = chosen.filter(({ r }) => r.resolve && !r.needsMetadata);

	// --- Phase 1: metadata. Fetch each pano once, run every metadata resolver. ---
	const metaLocs = metaPending.filter((l) => panoIdFor(l));
	// Locations that need metadata but have no pano fail their metadata resolvers.
	const metaNoPano = metaPending.filter((l) => !panoIdFor(l));
	for (const loc of metaNoPano)
		for (const { r } of metaResolvers) if (r.pending(loc, force)) result[r.id].failed.push(loc.id);

	async function metaBatch(batch: Location[], panoIds: string[]): Promise<void> {
		signal?.throwIfAborted();
		const datas = await fetchSvMetadata(panoIds);
		signal?.throwIfAborted();

		if (batch.length > 1 && datas.every((d) => d == null)) {
			const mid = Math.ceil(batch.length / 2);
			await metaBatch(batch.slice(0, mid), panoIds.slice(0, mid));
			await metaBatch(batch.slice(mid), panoIds.slice(mid));
			return;
		}

		const updates: { id: number; patch: Partial<Location> }[] = [];
		for (let j = 0; j < batch.length; j++) {
			const loc = batch[j];
			const data = datas[j];
			const patches: Partial<Location>[] = [];
			for (const { r, config } of metaResolvers) {
				if (!r.pending(loc, force)) continue;
				if (!data) {
					result[r.id].failed.push(loc.id);
					continue;
				}
				const patch = r.resolve?.(loc, data, { config, resolvedPanoId: resolvedPanoIds?.get(loc.id) });
				result[r.id].success.push(loc.id);
				if (patch) patches.push(patch);
			}
			const merged = mergePatches(loc, patches);
			if (merged) updates.push({ id: loc.id, patch: merged });
		}
		if (updates.length > 0) batchUpdateLocations(updates);
	}

	for (let i = 0; i < metaLocs.length; i += BATCH_SIZE) {
		signal?.throwIfAborted();
		const batch = metaLocs.slice(i, i + BATCH_SIZE);
		await metaBatch(
			batch,
			batch.map((l) => panoIdFor(l)!),
		);
		tick(Math.min(BATCH_SIZE, batch.length));
	}
	if (metaNoPano.length > 0) tick(metaNoPano.length);

	// --- Flag-only resolvers (pin to pano): patch off the prelude result. ---
	if (flagResolvers.length > 0) {
		const updates: { id: number; patch: Partial<Location> }[] = [];
		for (const loc of locations) {
			const patches: Partial<Location>[] = [];
			for (const { r, config } of flagResolvers) {
				if (!r.pending(loc, force)) continue;
				const patch = r.resolve?.(loc, null, { config, resolvedPanoId: resolvedPanoIds?.get(loc.id) });
				if (patch) {
					result[r.id].success.push(loc.id);
					patches.push(patch);
				} else {
					result[r.id].failed.push(loc.id);
				}
			}
			const merged = mergePatches(loc, patches);
			if (merged) updates.push({ id: loc.id, patch: merged });
		}
		if (updates.length > 0) batchUpdateLocations(updates);
	}

	// --- Phase 2: post phases (exact date) on fresh store data. ---
	for (const { r, config } of chosen) {
		if (!r.post) continue;
		signal?.throwIfAborted();
		const fresh = await fetchLocationsByIds(scopeIds);
		const outcome = await r.post(fresh, { signal, force, config, onUnit: () => tick(1) });
		result[r.id].success.push(...outcome.success);
		result[r.id].failed.push(...outcome.failed);
	}

	// --- Phase 3: enrichment providers (when an enrich-style resolver ran). ---
	if (chosen.some(({ r }) => r.runsProviders)) {
		const providers = getEnrichmentProviders();
		if (providers.length > 0) {
			signal?.throwIfAborted();
			const enrichFields = configOf("enrichMeta") as string[] | null | undefined;
			const pluginLocs = await fetchLocationsByIds(scopeIds);
			const results = await Promise.all(
				providers.map((p) => p.enrich(pluginLocs, enrichFields ?? null)),
			);
			signal?.throwIfAborted();
			const byId = new Map(pluginLocs.map((l) => [l.id, l]));
			const mergedById = new Map<number, Record<string, unknown>>();
			for (const res of results)
				for (const [id, patch] of res) mergedById.set(id, { ...mergedById.get(id), ...patch });
			if (mergedById.size > 0) {
				const updates = [...mergedById.entries()].map(([id, patch]) => ({
					id,
					patch: { extra: { ...byId.get(id)?.extra, ...patch } },
				}));
				batchUpdateLocations(updates);
			}
		}
	}

	return result;
}
