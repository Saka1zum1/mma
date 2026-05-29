/**
 * Unified field-definition registry.
 *
 * Field **existence** (which keys have data) is tracked separately by
 * `knownFieldKeys` in `useMapStore`. This module handles field **metadata**
 * (type, label, enum values) from three sources, in priority order:
 *
 *   1. **User overrides** — persisted in `MapMeta.extra.fields`, editable via
 *      ManageFields. Loaded on map open, updated on save.
 *   2. **Plugin defs** — declared by `EnrichmentProvider.fieldDefs` at
 *      registration time. Available as long as the plugin is active.
 *   3. **Core defs** — hardcoded for well-known SV metadata keys. Always available.
 *
 * `getFieldDef(key)` returns the highest-priority definition for a key,
 * or `undefined` if no metadata is declared (the UI falls back to the raw key name).
 */

import type { ExtraFieldDef } from "@/types";

const coreDefs: Record<string, ExtraFieldDef> = {
	altitude: { type: "number", label: "Altitude" },
	countryCode: { type: "string", label: "Country code" },
	cameraType: {
		type: "enum",
		label: "Camera type",
		values: ["gen1", "gen2", "gen4", "badcam", "tripod"],
		labels: { gen1: "Gen 1", gen2: "Gen 2/3", gen4: "Gen 4", badcam: "Bad cam", tripod: "Tripod" },
	},
	panoType: {
		type: "enum",
		label: "Pano type",
		values: ["2", "3", "10"],
		labels: { "2": "Official", "3": "Unknown", "10": "User uploaded" },
	},
	imageDate: { type: "month", label: "Image date" },
	datetime: { type: "date", label: "Exact date" },
	timezone: { type: "enum", label: "Timezone" },
	drivingDirection: { type: "number", label: "Driving direction" },
};

let pluginDefs: Record<string, ExtraFieldDef> = {};
let userDefs: Record<string, ExtraFieldDef> = {};

/** Register field definitions from an enrichment provider (called at activation). */
export function registerPluginFieldDefs(defs: Record<string, ExtraFieldDef>) {
	pluginDefs = { ...pluginDefs, ...defs };
}

/** Load user-customized field definitions from `MapMeta.extra.fields` (called on map open). */
export function setUserFieldDefs(defs: Record<string, ExtraFieldDef>) {
	userDefs = defs;
}

/** Clear per-map state on map close. Plugin defs persist across maps. */
export function resetForMapChange() {
	userDefs = {};
}

/** Look up metadata for a single field key. Returns `undefined` if no metadata exists. */
export function getFieldDef(key: string): ExtraFieldDef | undefined {
	return userDefs[key] ?? pluginDefs[key] ?? coreDefs[key];
}

/** Merged view of all field definitions across all layers. */
export function getAllFieldDefs(): Record<string, ExtraFieldDef> {
	return { ...coreDefs, ...pluginDefs, ...userDefs };
}
