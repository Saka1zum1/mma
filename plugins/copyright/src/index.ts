import type { Location, ExtraFieldDef, EnrichCtx } from "mma-plugin-types";

interface DetectResult {
	panoId: string;
	year: number | null;
	text?: string;
	error?: string;
	done?: number;
	total?: number;
}

const FIELD_DEFS: Record<string, ExtraFieldDef> = {
	// Year labels are identification categories, not distances: comparison stays
	// categorical (disambiguate) while type=number keeps numeric bucketing/ranges.
	copyrightYear: {
		type: "number",
		label: MMA.t("Copyright year"),
		comparison: { type: "categorical" },
	},
};

function fieldRequested(enrichFields: string[] | null): boolean {
	return !enrichFields || enrichFields.includes("copyrightYear");
}

function usableLocations(
	locations: Location[],
	enrichFields: string[] | null,
	force?: boolean,
): Location[] {
	if (!fieldRequested(enrichFields)) return [];
	return locations.filter(
		(l) => typeof l.panoId === "string" && l.panoId.length > 0 && (force || l.extra?.copyrightYear == null),
	);
}

async function enrich(
	locations: Location[],
	enrichFields: string[] | null,
	ctx?: EnrichCtx,
): Promise<Map<number, Record<string, unknown>>> {
	const patches = new Map<number, Record<string, unknown>>();

	const usable = usableLocations(locations, enrichFields, ctx?.force);
	if (usable.length === 0 || ctx?.signal?.aborted) return patches;

	const idsByPano = new Map<string, number[]>();
	for (const loc of usable) {
		const panoId = loc.panoId as string;
		const ids = idsByPano.get(panoId);
		if (ids) ids.push(loc.id);
		else idsByPano.set(panoId, [loc.id]);
	}
	const panoIds = Array.from(idsByPano.keys());

	try {
		await MMA.sidecar.request<DetectResult>("copyright", "detect", { panoIds }, {
			signal: ctx?.signal,
			onLog: (line) => console.error("[copyright]", line),
			onLine: (result) => {
				const ids = idsByPano.get(result.panoId);
				if (!ids) return;
				for (const id of ids) {
					if (result.error) {
						ctx?.onFail?.(id);
					} else if (result.year != null) {
						patches.set(id, { copyrightYear: result.year });
					}
					ctx?.onUnit?.();
				}
			},
		});
	} catch (e) {
		// Cancelling keeps whatever was detected before the abort.
		if (!ctx?.signal?.aborted) throw e;
	}

	return patches;
}

MMA.registerPlugin({
	activate() {
		MMA.registerEnrichFields([
			{ key: "copyrightYear", label: MMA.t("Copyright year") },
		]);
		MMA.registerEnrichmentProvider({
			id: "copyright",
			label: MMA.t("Copyright year"),
			enrich,
			fieldDefs: FIELD_DEFS,
			units: (locations, enrichFields, force) => usableLocations(locations, enrichFields, force).length,
			transform(_field, value, loc) {
				if (loc.extra?.imageDate && Number((loc.extra.imageDate as string).slice(0, 4)) > Number(value)) return null;
				return `© ${value}`;
			},
		});
	},
	comingSoon: true,
});
