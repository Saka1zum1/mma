// copyright/src/index.ts
var FIELD_DEFS = {
  // Year labels are identification categories, not distances: comparison stays
  // categorical (disambiguate) while type=number keeps numeric bucketing/ranges.
  copyrightYear: {
    type: "number",
    label: MMA.t("Copyright year"),
    comparison: { type: "categorical" }
  }
};
function fieldRequested(enrichFields) {
  return !enrichFields || enrichFields.includes("copyrightYear");
}
function usableLocations(locations, enrichFields, force) {
  if (!fieldRequested(enrichFields)) return [];
  return locations.filter(
    (l) => typeof l.panoId === "string" && l.panoId.length > 0 && (force || l.extra?.copyrightYear == null)
  );
}
async function enrich(locations, enrichFields, ctx) {
  const patches = /* @__PURE__ */ new Map();
  const usable = usableLocations(locations, enrichFields, ctx?.force);
  if (usable.length === 0 || ctx?.signal?.aborted) return patches;
  const idsByPano = /* @__PURE__ */ new Map();
  for (const loc of usable) {
    const panoId = loc.panoId;
    const ids = idsByPano.get(panoId);
    if (ids) ids.push(loc.id);
    else idsByPano.set(panoId, [loc.id]);
  }
  const panoIds = Array.from(idsByPano.keys());
  try {
    await MMA.sidecar.request("copyright", "detect", { panoIds }, {
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
      }
    });
  } catch (e) {
    if (!ctx?.signal?.aborted) throw e;
  }
  return patches;
}
MMA.registerPlugin({
  activate() {
    MMA.registerEnrichFields([
      { key: "copyrightYear", label: MMA.t("Copyright year") }
    ]);
    MMA.registerEnrichmentProvider({
      id: "copyright",
      label: MMA.t("Copyright year"),
      enrich,
      fieldDefs: FIELD_DEFS,
      units: (locations, enrichFields, force) => usableLocations(locations, enrichFields, force).length,
      transform(_field, value, loc) {
        if (loc.extra?.imageDate && Number(loc.extra.imageDate.slice(0, 4)) > Number(value)) return null;
        return `\xA9 ${value}`;
      }
    });
  },
  comingSoon: true
});
