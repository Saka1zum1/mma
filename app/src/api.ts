// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/google-maps.d.ts" />

/**
 * Unified MMA API — the single public surface for plugins, tests, and app code.
 * Exposed as `window.MMA` (and the global `MMA`).
 *
 * Store functions are spread directly — new store exports appear on MMA automatically.
 */

import * as store from "@/store/useMapStore";
import * as review from "@/lib/review/review";
import { cmd as commands } from "@/lib/commands";
import { goToMap, goToList } from "@/store/router";
import { createLocation } from "@/types";
import type { Location } from "@/types";
import { registerPlugin } from "@/plugins/registry";
import { trackDisposable } from "@/plugins/scope";
import { preloadModules, getAvailableExternals } from "@/plugins/externals";
import { registerEnrichFields, registerEnrichmentProvider } from "@/lib/data/fieldDefs";
import { getFieldDef, getAllFieldDefs } from "@/lib/data/fieldDefRegistry";
import { invoke } from "@tauri-apps/api/core";
import { Command } from "@tauri-apps/plugin-shell";
import { open as dialogOpen, save as dialogSave } from "@tauri-apps/plugin-dialog";
import { getGoogleMap, waitForGoogleMap } from "@/lib/map/mapState";
import { subscribe, type EditorEvent, type EventHandler } from "@/lib/events";
import { setSetting, getSettings } from "@/store/settings";
import { getSeenEntries, getSeenCount, clearSeen } from "@/lib/seen/seen";
import { loadSeenPano } from "@/components/editor/location/LocationPreview";
import { enrichAll, needsEnrichment } from "@/lib/sv/enrich";
import { bulkPinToPano } from "@/lib/sv/pinPano";
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
		subscribe("location:add", (added) => {
			for (const l of added) locs.set(l.id, l);
			notify();
		}),
		subscribe("location:remove", (ids) => {
			for (const id of ids) locs.delete(id);
			notify();
		}),
		subscribe("location:update", (p) => {
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

const mma = {
	ready: false as boolean,

	// --- Store ---
	...store,

	openMap: async (id: string) => {
		goToMap(id);
		while (!store.getCurrentMap()) await new Promise((r) => setTimeout(r, 16));
	},
	closeMap: () => { goToList(); return store.closeMap(); },

	// --- Review sessions ---
	...review,

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
	on<E extends EditorEvent>(event: E, handler: EventHandler<E>) {
		const unsub = subscribe(event, handler);
		trackDisposable(unsub); // auto-removed on plugin deactivation
		return unsub;
	},

	// --- Seen ---
	getSeenEntries,
	getSeenCount,
	clearSeen,
	loadSeenPano,

	// --- Enrichment ---
	enrichAll: async (opts?: Record<string, unknown>) => enrichAll(await store.fetchAllLocations(), opts),
	bulkPinToPano: async (opts?: Record<string, unknown>) => bulkPinToPano(await store.fetchAllLocations(), opts),
	validateLocations,
	needsEnrichment: (loc: Pick<Location, "extra">) => needsEnrichment(loc as Location),

	// --- Import (test convenience) ---
	importPaste: async (text: string) => {
		await commands.storeImportPastePreview(text);
		const r = await commands.storeImportFile([], null);
		await store.mutate(Promise.resolve(r));
		return [r];
	},
	importFile: async (droppedFields: string[], tagName?: string) => {
		const r = await commands.storeImportFile(droppedFields, tagName ?? null);
		await store.mutate(Promise.resolve(r));
		return r;
	},

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
