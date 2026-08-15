// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/google-maps.d.ts" />

/**
 * Unified MMA API — the single public surface for plugins, tests, and app code.
 * Exposed as `window.MMA` (and the global `MMA`).
 */

import * as store from "@/store/useMapStore";
import * as importStaging from "@/store/importStaging";
import * as commitDiff from "@/store/commitDiff";
import * as scope from "@/store/scope";
import * as mapList from "@/store/mapList";
import * as review from "@/lib/review/review";
import { events, type Scope, type Location } from "@/bindings.gen";
import { cmd as commands, type Cmd } from "@/lib/commands";
import { createLocation, applyLocationPatch } from "@/types";
import { registerPlugin, createPluginStorage, usePluginState } from "@/plugins/registry";
import { trackDisposable } from "@/plugins/scope";
import {
	Sidebar,
	Section,
	Field,
	EmptyState,
	SegmentedControl,
} from "@/components/primitives/Sidebar";
import { ScopeSelector } from "@/components/primitives/ScopeSelector";
import { toast } from "@/lib/util/toast";
import { preloadModules, getAvailableExternals } from "@/plugins/externals";
import { registerEnrichFields, registerEnrichmentProvider } from "@/lib/data/fieldDefs";
import { getFieldDef, getAllFieldDefs } from "@/lib/data/fieldDefRegistry";
import { invoke } from "@tauri-apps/api/core";
import { Command } from "@tauri-apps/plugin-shell";
import { open as dialogOpen, save as dialogSave } from "@tauri-apps/plugin-dialog";
import { subscribe, type EditorEvent, type EventHandler } from "@/lib/events";
import { setSetting, getSettings } from "@/store/settings";
import { t, tp, getLocale, LOCALES } from "@/lib/i18n";
import { getSavedSelections, savedToSelectionProps, describeRule } from "@/store/savedSelections";
import { getSeenEntries, getSeenCount, clearSeen } from "@/lib/seen/seen";
import { loadSeenPano } from "@/lib/sv/panoSingleton";
import { enrichAll, needsEnrichment } from "@/lib/sv/enrich";
import { bulkPinToPano } from "@/lib/sv/pinPano";
import { validateLocations } from "@/lib/sv/validate";
import { fetchSvMetadata } from "@/lib/sv/svMeta";
import { mmaBufUrl } from "@/lib/util/util";
import { getMapHost, waitForMapHost } from "@/lib/map/mapState";
import * as legacy from "@/legacy";
import * as testApi from "@/testApi";

export interface LocationStore {
	locations: Map<number, Location>;
	/** The materialized locations narrowed to a scope (defaults to all). */
	get(scope?: Scope): Location[];
	onChange(cb: () => void): () => void;
	destroy(): void;
}

/** A live id-to-Location map of the whole map, kept in sync via store events.
 *  Call `destroy()` when done. */
async function createLocationStore(): Promise<LocationStore> {
	const locs = new Map<number, Location>();
	for (const l of await store.fetchAllLocations()) locs.set(l.id, l);

	const listeners = new Set<() => void>();
	const notify = () => {
		for (const cb of listeners) cb();
	};

	const unsubs = [
		subscribe("location:add", (added) => {
			for (const l of added) locs.set(l.id, l);
			notify();
		}),
		subscribe("location:remove", (ids) => {
			for (const id of ids) locs.delete(id);
			notify();
		}),
		subscribe("location:update", (updates) => {
			for (const u of updates) {
				const existing = locs.get(u.id);
				if (existing) locs.set(u.id, applyLocationPatch(existing, u.patch));
			}
			notify();
		}),
	];

	return {
		locations: locs,
		get(s = { kind: "all" }) {
			return scope.applyScope(s, [...locs.values()]);
		},
		onChange(cb) {
			listeners.add(cb);
			return () => {
				listeners.delete(cb);
			};
		},
		destroy() {
			unsubs.forEach((fn) => fn());
			listeners.clear();
			locs.clear();
		},
	};
}

// --- Sidecar requests ---
// One set of listeners for every request, demultiplexed by request id. Events can
// land before `sidecarRequest` learns its id (a resident-served request finishes in
// a millisecond), so unclaimed events are buffered until their caller arrives.

type SidecarEvent =
	| { kind: "line"; line: string }
	| { kind: "log"; line: string }
	| { kind: "done"; error: string | null };

const sidecarHandlers = new Map<number, (ev: SidecarEvent) => void>();
const sidecarPending = new Map<number, SidecarEvent[]>();
let sidecarListeners: Promise<void> | null = null;

function routeSidecarEvent(reqId: number, ev: SidecarEvent) {
	const handler = sidecarHandlers.get(reqId);
	if (handler) {
		handler(ev);
		return;
	}
	const buffered = sidecarPending.get(reqId);
	if (buffered) buffered.push(ev);
	else sidecarPending.set(reqId, [ev]);
}

function listenForSidecarEvents(): Promise<void> {
	sidecarListeners ??= (async () => {
		await events.sidecarLine.listen((ev) =>
			routeSidecarEvent(ev.payload.reqId, { kind: "line", line: ev.payload.line }),
		);
		await events.sidecarLog.listen((ev) =>
			routeSidecarEvent(ev.payload.reqId, { kind: "log", line: ev.payload.line }),
		);
		await events.sidecarDone.listen((ev) =>
			routeSidecarEvent(ev.payload.reqId, { kind: "done", error: ev.payload.error }),
		);
	})();
	return sidecarListeners;
}

export interface SidecarOptions<T> {
	/** Fires once per JSON object the sidecar emits, in order. */
	onLine?(item: T): void;
	/** Sidecar diagnostics (stderr), one-shot runs only. Resident-served commands
	 *  write theirs to the app log instead. */
	onLog?(line: string): void;
	signal?: AbortSignal;
}

/** Legacy handle returned by {@link spawnSidecarCompat}. Prefer {@link sidecarRequest}. */
export interface SidecarRun {
	runId: number;
	onLine(cb: (line: string) => void): void;
	onStderr(cb: (line: string) => void): void;
	onExit(cb: (code: number | null) => void): void;
	kill(): void;
}

/** Run one unit of work on a plugin's sidecar and resolve with its last emitted
 *  object (null if it emitted none). The app owns the process: commands the manifest
 *  lists under `serve` are answered by the plugin's resident sidecar, the rest by a
 *  one-shot run. `payload` is handed to the sidecar as JSON. */
async function sidecarRequest<T>(
	pluginId: string,
	command: string,
	payload?: unknown,
	opts?: SidecarOptions<T>,
): Promise<T | null> {
	await listenForSidecarEvents();
	const reqId = await commands.sidecarRequest(
		pluginId,
		command,
		payload === undefined ? null : JSON.stringify(payload),
	);

	return new Promise<T | null>((resolve, reject) => {
		let last: T | null = null;
		// Abort kills the run but leaves the handler installed, so the `done` that
		// follows still cleans up. Resident-served work has no process to kill.
		const onAbort = () => {
			commands.sidecarCancel(reqId).catch(() => {});
			reject(new DOMException(`Sidecar ${command} aborted`, "AbortError"));
		};
		sidecarHandlers.set(reqId, (ev) => {
			if (ev.kind === "line") {
				let item: T;
				try {
					item = JSON.parse(ev.line) as T;
				} catch {
					return;
				}
				last = item;
				opts?.onLine?.(item);
			} else if (ev.kind === "log") {
				opts?.onLog?.(ev.line);
			} else {
				sidecarHandlers.delete(reqId);
				opts?.signal?.removeEventListener("abort", onAbort);
				if (ev.error) reject(new Error(ev.error));
				else resolve(last);
			}
		});

		const buffered = sidecarPending.get(reqId);
		if (buffered) {
			sidecarPending.delete(reqId);
			for (const ev of buffered) sidecarHandlers.get(reqId)?.(ev);
		}

		if (opts?.signal?.aborted) onAbort();
		else opts?.signal?.addEventListener("abort", onAbort);
	});
}

/**
 * Compatibility shim for plugins still calling `MMA.sidecar.spawn` (pre app-owned
 * sidecar API). Translates CLI-style args (`detect --input path.json`) into
 * {@link sidecarRequest}. New plugins should use `request` directly.
 */
async function spawnSidecarCompat(
	pluginId: string,
	_binaryName: string,
	args: string[],
): Promise<SidecarRun> {
	const command = args[0];
	if (!command) throw new Error("MMA.sidecar.spawn: missing command");
	if (command === "serve") {
		throw new Error(
			"MMA.sidecar.spawn('serve') is no longer supported — update the plugin; the app manages resident sidecars",
		);
	}

	let inputPath: string | undefined;
	for (let i = 1; i < args.length; i++) {
		if (args[i] === "--input" && args[i + 1]) {
			inputPath = args[i + 1];
			break;
		}
	}

	let payload: unknown;
	if (inputPath) {
		payload = JSON.parse(await commands.readFile(inputPath));
	}

	const lineCbs: ((line: string) => void)[] = [];
	const errCbs: ((line: string) => void)[] = [];
	const exitCbs: ((code: number | null) => void)[] = [];
	const ac = new AbortController();
	let exited = false;
	const finish = (code: number | null) => {
		if (exited) return;
		exited = true;
		for (const cb of exitCbs) cb(code);
	};

	const run: SidecarRun = {
		runId: -1,
		onLine: (cb) => lineCbs.push(cb),
		onStderr: (cb) => errCbs.push(cb),
		onExit: (cb) => exitCbs.push(cb),
		kill: () => ac.abort(),
	};

	// Defer so callers can register onLine/onExit synchronously after `await spawn()`.
	queueMicrotask(() => {
		void sidecarRequest(pluginId, command, payload, {
			signal: ac.signal,
			onLine: (item) => {
				const line = typeof item === "string" ? item : JSON.stringify(item);
				for (const cb of lineCbs) cb(line);
			},
			onLog: (line) => {
				for (const cb of errCbs) cb(line);
			},
		}).then(
			() => finish(0),
			(err: unknown) => {
				if (err instanceof DOMException && err.name === "AbortError") finish(null);
				else finish(1);
			},
		);
	});

	return run;
}

/** Explicitly exposed functions not in other APIs. */
const surface = {
	ready: false,

	// --- Rust IPC commands ---
	cmd: commands as Cmd,

	// --- Tauri primitives (for plugins) ---
	invoke,
	shell: { Command },
	dialog: { open: dialogOpen, save: dialogSave },

	// --- Sidecar binaries (distributed via GitHub Releases on install) ---
	sidecar: {
		installedVersion: (pluginId: string) => commands.sidecarInstalledVersion(pluginId),
		request: sidecarRequest,
		/** @deprecated Use `request`. Kept for installed plugins built against the old spawn API. */
		spawn: spawnSidecarCompat,
	},

	// --- Bootstrap (for plugins) ---
	registerPlugin,
	registerEnrichFields,
	registerEnrichmentProvider,
	preloadModules,
	getAvailableExternals,
	createLocationStore,

	// --- UI primitives (for plugins) ---
	ui: { Sidebar, Section, Field, EmptyState, SegmentedControl, ScopeSelector },

	// --- Notifications ---
	toast,

	// --- Namespaced per-plugin storage ---
	storage: createPluginStorage,
	usePluginState,

	// --- Field definitions ---
	getFieldDef,
	getAllFieldDefs,

	// --- Types ---
	createLocation,

	// --- Map host ---
	getMapHost,
	waitForMapHost,

	// --- Settings ---
	setSetting,
	getSettings: () => ({ ...getSettings() }),

	// --- i18n ---
	t,
	tp,
	getLocale,
	LOCALES,

	// --- Saved selections ---
	getSavedSelections,
	savedToSelectionProps,
	describeRule,

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
	enrichAll,
	bulkPinToPano,
	validateLocations,
	needsEnrichment,

	// --- SV metadata ---
	fetchSvMetadata,

	// --- Util ---
	mmaBufUrl,

	// --- Test-only convenience ---
	_test: testApi,
};

type StoreApi = typeof store;
type ImportStagingApi = typeof importStaging;
type CommitDiffApi = typeof commitDiff;
type ScopeApi = typeof scope;
type MapListApi = typeof mapList;
type ReviewApi = typeof review;
type SurfaceApi = typeof surface;
type LegacyApi = typeof legacy;

export interface MMA
	extends
		StoreApi,
		ImportStagingApi,
		CommitDiffApi,
		ScopeApi,
		MapListApi,
		ReviewApi,
		SurfaceApi,
		LegacyApi {}

const mma: MMA = {
	...store,
	...importStaging,
	...commitDiff,
	...scope,
	...mapList,
	...review,
	...surface,
	...legacy,
};

declare global {
	interface Window {
		MMA: MMA;
	}
	const MMA: MMA;
}

window.MMA = mma;

export default mma;
