// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/google-maps.d.ts" />

/**
 * Unified MMA API — the single public surface for plugins, tests, and app code.
 * Exposed as `window.MMA` (and the global `MMA`).
 *
 * Store functions are spread directly — new store exports appear on MMA automatically.
 */

import * as store from "@/store/useMapStore";
import { cmd as commands } from "@/lib/commands";
import { createLocation } from "@/types";
import type { Location } from "@/types";
import { registerPlugin } from "@/plugins/registry";
import { preloadModules, getAvailableExternals } from "@/plugins/externals";
import { registerEnrichFields, registerEnrichmentProvider } from "@/lib/data/fieldDefs.add";
import { getFieldDef, getAllFieldDefs } from "@/lib/data/fieldDefRegistry";
import { invoke } from "@tauri-apps/api/core";
import { Command } from "@tauri-apps/plugin-shell";
import { open as dialogOpen, save as dialogSave } from "@tauri-apps/plugin-dialog";
import { getGoogleMap, waitForGoogleMap } from "@/lib/map/mapState";
import { subscribe, type EditorEvent } from "@/lib/events";
import { setSetting, getSettings } from "@/store/settings.add";
import { getSeenEntries, getSeenCount, clearSeen } from "@/lib/seen/seen.add";
import { loadSeenPano } from "@/components/editor/location/LocationPreview";
import { enrichAll, needsEnrichment } from "@/lib/sv/enrich.add";
import { bulkPinToPano } from "@/lib/sv/pinPano.add";
import { validateLocations } from "@/lib/sv/validate";
import { mmaBufUrl } from "@/lib/util/util";

export interface LocationStore {
	locations: Map<number, Location>;
	onChange(cb: () => void): () => void;
	destroy(): void;
}

async function createLocationStore(): Promise<LocationStore> {
	const locs = new Map<number, Location>();
	for (const l of await store.fetchAllLocations()) locs.set(l.id, l);

	const listeners = new Set<() => void>();
	const notify = () => { for (const cb of listeners) cb(); };

	const unsubs = [
		subscribe("location:add", (...args: unknown[]) => {
			for (const l of args[0] as Location[]) locs.set(l.id, l);
			notify();
		}),
		subscribe("location:remove", (...args: unknown[]) => {
			for (const id of args[0] as number[]) locs.delete(id);
			notify();
		}),
		subscribe("location:update", (...args: unknown[]) => {
			const p = args[0] as Partial<Location> & { id: number };
			const existing = locs.get(p.id);
			if (existing) locs.set(p.id, { ...existing, ...p });
			notify();
		}),
	];

	return {
		locations: locs,
		onChange(cb) {
			listeners.add(cb);
			return () => { listeners.delete(cb); };
		},
		destroy() {
			unsubs.forEach((fn) => fn());
			listeners.clear();
			locs.clear();
		},
	};
}

type Handler = (...args: unknown[]) => void;

const mma = {
	ready: false as boolean,

	// --- Store (map, locations, tags, selections, undo, review, import, etc.) ---
	...store,

	// --- Rust IPC commands ---
	cmd: commands,

	// --- Tauri primitives (for plugins) ---
	invoke,
	shell: { Command },
	dialog: { open: dialogOpen, save: dialogSave },

	// --- Bootstrap (for plugins) ---
	registerPlugin,
	registerEnrichFields,
	registerEnrichmentProvider,
	preloadModules,
	getAvailableExternals,
	createLocationStore,

	// --- Field definitions ---
	getFieldDef,
	getAllFieldDefs,

	// --- Types ---
	createLocation,

	// --- Google Maps ---
	getGoogleMap: () => getGoogleMap(),
	waitForGoogleMap: () => waitForGoogleMap(),

	// --- Settings ---
	setSetting,
	getSettings: () => ({ ...getSettings() }),

	// --- Events (for plugins) ---
	on(event: EditorEvent, handler: Handler) {
		return subscribe(event, handler);
	},

	// --- Seen ---
	getSeenEntries,
	getSeenCount,
	clearSeen,
	loadSeenPano,

	// --- Enrichment ---
	enrichAll: async (opts?: Record<string, unknown>) =>
		enrichAll(await store.fetchAllLocations(), opts),
	bulkPinToPano: async (opts?: Record<string, unknown>) =>
		bulkPinToPano(await store.fetchAllLocations(), opts),
	validateLocations,
	needsEnrichment: (loc: Pick<Location, "extra">) => needsEnrichment(loc as Location),

	// --- Util ---
	mmaBufUrl,
};

export type MMA = typeof mma;

declare global {
	interface Window {
		MMA: typeof mma;
	}
	const MMA: typeof mma;
}

window.MMA = mma;

export default mma;
