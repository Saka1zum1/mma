// gen4cam/src/index.ts
var CAMERAS = ["normal", "smallcam", "truck", "trekker"];
var FIELD_DEFS = {
  gen4Camera: {
    type: "enum",
    label: MMA.t("Gen4 camera"),
    values: [...CAMERAS],
    labels: {
      normal: "Normal",
      smallcam: "Smallcam",
      truck: "Truck",
      trekker: "Trekker"
    },
    comparison: { type: "categorical" }
  }
};
MMA.registerPlugin({
  activate() {
    MMA.registerEnrichFields([{ key: "gen4Camera", label: MMA.t("Gen4 camera") }]);
    MMA.registerEnrichmentProvider({
      id: "gen4cam",
      label: MMA.t("Gen4 camera"),
      fieldDefs: FIELD_DEFS,
      procedure: {
        entry: "procedure.js",
        batch: { mode: "chunk", size: 200 },
        instances: 1
      }
    });
  }
});
