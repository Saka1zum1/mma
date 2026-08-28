import type { ExtraFieldDef } from "mma-plugin-types";

const FIELD_DEFS: Record<string, ExtraFieldDef> = {
	// Year labels are identification categories, not distances: comparison stays
	// categorical (disambiguate) while type=number keeps numeric bucketing/ranges.
	copyrightYear: {
		type: "number",
		label: MMA.t("Copyright year"),
		comparison: { type: "categorical" },
	},
};

MMA.registerPlugin({
	activate() {
		MMA.registerEnrichFields([
			{ key: "copyrightYear", label: MMA.t("Copyright year") },
		]);
		MMA.registerEnrichmentProvider({
			id: "copyright",
			label: MMA.t("Copyright year"),
			fieldDefs: FIELD_DEFS,
			procedure: {
				entry: "procedure.js",
				// Every call is a one-shot process that loads the models (~3 s), so a batch is a page.
				batch: { mode: "chunk", size: 10000 },
				instances: 1,
			},
		});
	},
	comingSoon: true,
});
