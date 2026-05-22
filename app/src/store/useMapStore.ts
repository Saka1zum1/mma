import { useEffect, useSyncExternalStore } from "react";
import type { MapData, MapMeta, Location, Tag, WorkArea, ExtraFieldDef } from "@/types";
import { emit as tauriEmit, listen } from "@tauri-apps/api/event";
import { cmd, fetchViaFile } from "@/lib/commands";
import type { MutationResult_Serialize as MutationResult, LocationPatch_Deserialize as LocationPatch } from "@/bindings.gen";
import { emit as emitEvent } from "@/lib/events";
import { log } from "@/lib/util/log";
import { ENRICHMENT_FIELD_DEFS } from "@/lib/data/fieldDefs.add";
import { debugSpan } from "@/lib/util/debug";
import { mmaBufUrl } from "@/lib/util/util";
import type { RenderDelta } from "@/lib/render/CellManager";

/** Minimal pub/sub bus. `.on()` returns an unsubscribe function. */
function createBus<T extends (...args: never[]) => void>() {
	let handlers: T[] = [];
	return {
		on: (fn: T) => { handlers.push(fn); return () => { handlers = handlers.filter((h) => h !== fn); }; },
		emit: ((...args: Parameters<T>) => { for (const h of handlers) h(...args); }) as T,
	};
}

/** Fires when Rust sends incremental render changes (adds/removes/patches to cell buffers). */
export const renderDeltaBus = createBus<(delta: RenderDelta) => void>();

type SelectionBitmaskHandler = (
	selColors: [number, number, number][],
	cellEntries: { cellChar: string; locCount: number; masks: Uint8Array[] }[],
	setIds: (ids: Set<number>) => void,
) => void;
/** Fires when selection bitmasks are resolved. Subscribers apply per-cell masks to the render overlay. */
export const selBitmaskBus = createBus<SelectionBitmaskHandler>();

import {
	type Selection,
	type SelectionProps,
	type PolygonGeometry,
	addSelection as addSel,
	removeSelection as removeSel,
	intersectSelections,
	unionSelections,
	invertSelections,
	toggleManualSelection as toggleManual,
	setPolygonName as renamePolygonSel,
	setSelectionColor as setSelColor,
	reorderSelections,
	composeSelections as composeSels,
	composeWithChild as composeWithChildSel,
	decomposeChild as decomposeChildSel,
	removeFromComposite as removeFromCompositeSel,
	composeSiblings as composeSiblingsSel,
} from "./selections";

const storeBus = createBus<() => void>();
const subscribe = storeBus.on;
const notify = storeBus.emit;

// --- Map list state ---
let mapListVersion = 0;
function getMapListSnapshot() {
	return mapListVersion;
}

let cachedMapList: MapMeta[] = [];
export function useMapList() {
	useSyncExternalStore(subscribe, getMapListSnapshot);
	return cachedMapList;
}

async function reloadMapList() {
	cachedMapList = await cmd.storeListMaps();
	mapListVersion++;
	notify();
}

export async function invalidateMapList() {
	await reloadMapList();
	tauriEmit("map-list-changed");
}

// --- Extra field index (incremental cache of known extra keys) ---
interface ExtraFieldInfo {
	count: number;
	numericCount: number;
}
let extraFieldIndex = new Map<string, ExtraFieldInfo>();

function indexExtrasFromLocations(locs: Location[]) {
	for (const loc of locs) {
		if (!loc.extra) continue;
		for (const [k, v] of Object.entries(loc.extra)) {
			const info = extraFieldIndex.get(k) ?? { count: 0, numericCount: 0 };
			info.count++;
			if (typeof v === "number") info.numericCount++;
			extraFieldIndex.set(k, info);
		}
	}
}

function indexExtraPatch(patch: Record<string, unknown>) {
	for (const [k, v] of Object.entries(patch)) {
		const info = extraFieldIndex.get(k) ?? { count: 0, numericCount: 0 };
		info.count++;
		if (typeof v === "number") info.numericCount++;
		extraFieldIndex.set(k, info);
	}
}

export function getExtraFieldIndex(): ReadonlyMap<string, { count: number; numericCount: number }> {
	return extraFieldIndex;
}

export function useExtraFieldIndex(): ReadonlyMap<string, { count: number; numericCount: number }> {
	useSyncExternalStore(subscribe, getMapSnapshot);
	return extraFieldIndex;
}

// --- Current map state ---
let currentMapId: string | null = null;
let currentMap: MapData | null = null;
/** Persisted bitmasks per selection key. Updated incrementally on each
 *  mutation (delta refresh) when the column store is available. */
let selections: Selection[] = [];
let selectionVersion = 0;
let selectedLocationIds = new Set<number>();
let activeLocationId: number | null = null;
let duplicateLocations: Location[] = [];
let review: { locations: number[]; index: number } | null = null;
let workArea: WorkArea = "overview";
let activePluginId: string | null = null;
let mapVersion = 0;
let tagCounts: Record<number, number> = {};

export function useTagCounts(): Record<number, number> {
	useSyncExternalStore(subscribe, getMapSnapshot);
	return tagCounts;
}

async function computeCommitDiff(): Promise<{ added: number; removed: number; modified: number }> {
	const [added, removed, modified] = await cmd.storeCommitDiff();
	return { added, removed, modified };
}

function getMapSnapshot() {
	return mapVersion;
}

export function refreshAfterMutation() {
	if (!currentMap) {
		selections = [];
		selectionVersion++;
		selectedLocationIds = new Set();
		mapVersion++;
		notify();
		return;
	}
	mapVersion++;
	notify();
}

export function useCurrentMap() {
	useSyncExternalStore(subscribe, getMapSnapshot);
	return currentMap;
}

/** Reactive map version counter. Bumps on every mutation. Use as a
 *  React effect dep when you want to react to changes to currentMap or
 *  its locations without depending on reference equality of the inner
 *  `locations: Location[]` array (which is now mutated in place on add). */
export function useMapVersion(): number {
	useSyncExternalStore(subscribe, getMapSnapshot);
	return mapVersion;
}

export function useSelectedLocationIds() {
	useSyncExternalStore(subscribe, getMapSnapshot);
	return selectedLocationIds;
}

let cachedActiveLocation: Location | null = null;

export function useActiveLocation(): Location | null {
	useSyncExternalStore(subscribe, getMapSnapshot);
	return cachedActiveLocation;
}

export function useDuplicateLocations(): Location[] {
	useSyncExternalStore(subscribe, getMapSnapshot);
	return duplicateLocations;
}

export function useWorkArea() {
	useSyncExternalStore(subscribe, getMapSnapshot);
	return workArea;
}

export function useReview() {
	useSyncExternalStore(subscribe, getMapSnapshot);
	return review;
}

let cachedCommitDiff = { added: 0, removed: 0, modified: 0 };

export function hasCommitDiff(): boolean {
	return (
		cachedCommitDiff.added > 0 ||
		cachedCommitDiff.removed > 0 ||
		cachedCommitDiff.modified > 0
	);
}

export function useCommitDiff() {
	const version = useSyncExternalStore(subscribe, getMapSnapshot);
	useEffect(() => {
		computeCommitDiff().then((d) => {
			if (
				d.added !== cachedCommitDiff.added ||
				d.removed !== cachedCommitDiff.removed ||
				d.modified !== cachedCommitDiff.modified
			) {
				cachedCommitDiff = d;
				mapVersion++;
				notify();
			}
		});
	}, [version]);
	return cachedCommitDiff;
}

// --- Autosave ---
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let inflightSave: Promise<void> | null = null;
const AUTOSAVE_DELAY_MS = 2000;

export async function getDirtyCount(): Promise<number> {
	const result = await cmd.storeGetSummary();
	return result.dirtyCount;
}

export function scheduleSave() {
	if (autosaveTimer) clearTimeout(autosaveTimer);
	autosaveTimer = setTimeout(() => {
		autosaveTimer = null;
		doSave();
	}, AUTOSAVE_DELAY_MS);
}

async function doSave(): Promise<void> {
	if (!currentMapId || !currentMap) return;
	const span = debugSpan("doSave");
	const t0 = performance.now();
	inflightSave = cmd
		.storeSaveDirty()
		.then(() => {
			log.debug(`[save] saveDirty=${(performance.now() - t0).toFixed(0)}ms`);
			invalidateMapList();
		})
		.catch((err) => {
			scheduleSave();
			log.error("Autosave failed, will retry:", err);
		})
		.finally(() => {
			inflightSave = null;
			span.end();
		});
	await inflightSave;
}

export async function flushSave(): Promise<void> {
	if (autosaveTimer) clearTimeout(autosaveTimer);
	autosaveTimer = null;
	if (inflightSave) await inflightSave;
	await doSave();
}

// --- Init (called once at startup) ---
export async function initStore() {
	cachedMapList = await cmd.storeListMaps();
	notify();
	listen("map-list-changed", () => reloadMapList());
}

// --- Actions ---
export async function openMap(id: string, pushHistory = true) {
	if (autosaveTimer) {
		clearTimeout(autosaveTimer);
		autosaveTimer = null;
	}
	if (inflightSave) await inflightSave;
	const totalSpan = debugSpan("openMap:total");
	currentMapId = id;
	const t0 = performance.now();
	currentMap = await cmd.storeGetMap(id);
	log.debug(`[openMap] getMap=${(performance.now() - t0).toFixed(0)}ms`);
	extraFieldIndex = new Map();

	if (currentMap) {
		const t1 = performance.now();
		try {
			const openResult = await cmd.storeOpenMap(id);
			log.debug(`[openMap] store_open_map=${(performance.now() - t1).toFixed(0)}ms`);
			tagCounts = openResult.tagCounts;
			undoRedoState = { canUndo: openResult.canUndo, canRedo: openResult.canRedo };
		} catch (e) {
			log.error("[openMap] store_open_map failed:", e);
			currentMap = null;
			currentMapId = null;
			notify();
			return;
		}
		cmd.storeTouchMapOpened(id);
	}

	selections = [];
	selectedLocationIds = new Set();
	activeLocationId = null;
	review = null;
	workArea = "overview";

	mapVersion++;
	notify();
	totalSpan.end();
	if (pushHistory) history.pushState({ mapId: id }, "", `#map/${id}`);
	emitEvent("map:open", currentMap);
}

export async function closeMap(pushHistory = true) {
	await flushSave();
	emitEvent("map:close");
	currentMapId = null;
	currentMap = null;

	selections = [];
	selectedLocationIds = new Set();
	activeLocationId = null;
	review = null;
	workArea = "overview";

	await cmd.storeCloseMap();
	renderDeltaBus.emit({ added: [], updated: [], removed: [], colorPatches: [], fullReset: true });
	undoRedoState = { canUndo: false, canRedo: false };
	tagCounts = {};
	mapVersion++;
	notify();
	if (pushHistory) history.pushState({ mapId: null }, "", "#");
}

export function getCurrentMapId() {
	return currentMapId;
}

export function getCurrentMap() {
	return currentMap;
}

export function getActiveLocation(): Location | null {
	return cachedActiveLocation;
}

export async function fetchAllLocations(): Promise<Location[]> {
	const path = await cmd.storeGetAllLocations();
	const res = await fetch(mmaBufUrl(path));
	return res.json();
}

export async function fetchLocation(id: number): Promise<Location | null> {
	return fetchViaFile<Location>(cmd.storeGetLocationFile(id));
}

export async function fetchLocationsByIds(ids: number[]): Promise<Location[]> {
	return cmd.storeGetLocationsByIds(ids);
}

export function getSelections() {
	return selections;
}

export function getSelectedLocationIds() {
	return selectedLocationIds;
}

export async function createMap(name: string, folder: string | null = null) {
	await cmd.storeCreateMap(name, folder);
	await invalidateMapList();
}

export async function deleteMap(id: string) {
	// TODO: if this map is open in another window, that window won't know it was deleted
	await cmd.storeDeleteMap(id);
	if (currentMapId === id) await closeMap();
	await invalidateMapList();
}

export async function renameFolder(from: string, to: string) {
	await cmd.storeRenameFolder(from, to);
	await invalidateMapList();
}

export async function moveMapToFolder(mapId: string, folder: string | null) {
	const idx = cachedMapList.findIndex((m) => m.id === mapId);
	if (idx !== -1) {
		cachedMapList = cachedMapList.map((m) => (m.id === mapId ? { ...m, folder } : m));
		mapListVersion++;
		notify();
	}
	await cmd.storeMoveMapToFolder(mapId, folder);
	tauriEmit("map-list-changed");
}

export async function deleteFolder(name: string) {
	await cmd.storeDeleteFolder(name);
	await invalidateMapList();
}

export async function getAllMaps(): Promise<MapData[]> {
	const metas = await cmd.storeListMaps();
	const maps: MapData[] = [];
	for (const meta of metas) {
		const map = await cmd.storeGetMap(meta.id);
		if (map) maps.push(map);
	}
	return maps;
}

export async function renameMap(id: string, name: string) {
	await cmd.storeUpdateMapMeta(id, { name });
	if (currentMap && currentMapId === id) currentMap.meta.name = name;
	refreshAfterMutation();
	await invalidateMapList();
}

export async function updateMapLabels(id: string, labels: string[]) {
	await cmd.storeUpdateMapLabels(id, labels);
	if (currentMap && currentMapId === id) currentMap.meta.labels = labels;
	await invalidateMapList();
}

export async function updateMapMeta(patch: Partial<MapMeta>) {
	if (!currentMapId || !currentMap) return;
	await cmd.storeUpdateMapMeta(currentMapId, patch);
	if (patch.name !== undefined) currentMap.meta.name = patch.name;
	if (patch.description !== undefined) currentMap.meta.description = patch.description;
	if (patch.folder !== undefined) currentMap.meta.folder = patch.folder;
	if (patch.settings !== undefined) currentMap.meta.settings = patch.settings;
	if (patch.scoreBounds !== undefined) currentMap.meta.scoreBounds = patch.scoreBounds;
	if (patch.extra !== undefined) currentMap.meta.extra = patch.extra;
	refreshAfterMutation();
	await invalidateMapList();
}

export async function updateMapExtraFields(fields: Record<string, ExtraFieldDef>) {
	if (!currentMapId || !currentMap) return;
	const current = currentMap.meta.extra ?? {};
	const merged = { ...current, fields: { ...current.fields, ...fields } };
	currentMap = { ...currentMap, meta: { ...currentMap.meta, extra: merged } };
	mapVersion++;
	notify();
	await cmd.storeUpdateMapMeta(currentMapId, { extra: merged } as Partial<MapMeta>);
}

export async function setMapExtraFields(fields: Record<string, ExtraFieldDef>) {
	if (!currentMapId || !currentMap) return;
	const current = currentMap.meta.extra ?? {};
	const replaced = { ...current, fields };
	currentMap = { ...currentMap, meta: { ...currentMap.meta, extra: replaced } };
	mapVersion++;
	notify();
	await cmd.storeUpdateMapMeta(currentMapId, { extra: replaced } as Partial<MapMeta>);
}

function autoRegisterFieldDefs(extraKeys: string[]) {
	if (!currentMap) return;
	const existing = currentMap.meta.extra?.fields ?? {};
	const newDefs: Record<string, ExtraFieldDef> = {};
	for (const key of extraKeys) {
		if (!existing[key] && ENRICHMENT_FIELD_DEFS[key]) {
			newDefs[key] = ENRICHMENT_FIELD_DEFS[key];
		}
	}
	if (Object.keys(newDefs).length > 0) {
		updateMapExtraFields(newDefs);
	}
}

export function addLocationCount(delta: number) {
	if (!currentMap) return;
	currentMap = {
		...currentMap,
		meta: { ...currentMap.meta, locationCount: currentMap.meta.locationCount + delta },
	};
}

export function setTagCounts(counts: Record<number, number>) {
	tagCounts = counts;
}

export function setUndoRedoState(canUndo: boolean, canRedo: boolean) {
	undoRedoState = { canUndo, canRedo };
}

/** Sync JS-side state (location count, undo/redo, tag counts, selections) from a Rust MutationResult. */
function syncMutationResult(r: MutationResult) {
	if (!currentMap) return;
	const needsNotify =
		currentMap.meta.locationCount !== r.locationCount ||
		undoRedoState.canUndo !== r.canUndo ||
		undoRedoState.canRedo !== r.canRedo;
	currentMap = {
		...currentMap,
		meta: { ...currentMap.meta, locationCount: r.locationCount },
	};
	undoRedoState = { canUndo: r.canUndo, canRedo: r.canRedo };
	tagCounts = r.tagCounts;
	if (needsNotify) {
		mapVersion++;
		notify();
	}
	if (r.selectionSync) {
		applySelectionSync(r.selectionSync);
	}
}

/** Parse a binary bitmask file from Rust and emit to selBitmaskBus. */
async function emitBitmaskFile(patchFile: string) {
	const resp = await fetch(mmaBufUrl(patchFile));
	const buf = await resp.arrayBuffer();
	const dv = new DataView(buf);
	let off = 0;
	const numSels = dv.getUint8(off);
	off += 1;
	const selColors: [number, number, number][] = [];
	for (let i = 0; i < numSels; i++) {
		selColors.push([dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2)]);
		off += 3;
	}
	const numCells = dv.getUint8(off);
	off += 1;
	const cellEntries: { cellChar: string; locCount: number; masks: Uint8Array[] }[] = [];
	for (let ci = 0; ci < numCells; ci++) {
		const cellChar = String.fromCharCode(dv.getUint8(off));
		off += 1;
		const locCount = dv.getUint32(off, true);
		off += 4;
		const maskBytes = Math.ceil(locCount / 8);
		const masks: Uint8Array[] = [];
		for (let si = 0; si < numSels; si++) {
			masks.push(new Uint8Array(buf, off, maskBytes));
			off += maskBytes;
		}
		cellEntries.push({ cellChar, locCount, masks });
	}
	selBitmaskBus.emit(selColors, cellEntries, (ids) => { selectedLocationIds = ids; });
}

async function applySelectionSync(sync: { counts: number[]; patchFile: string | null; selectedCount: number }) {
	for (let i = 0; i < selections.length; i++) {
		selections[i] = { ...selections[i], count: sync.counts[i] ?? 0 };
	}
	if (sync.patchFile) await emitBitmaskFile(sync.patchFile);
	selectionVersion++;
	mapVersion++;
	notify();
}

/** Await a mutation IPC, emit its render delta, sync JS state, and schedule a save. */
async function mutate(p: Promise<MutationResult>): Promise<MutationResult> {
	const r = await p;
	renderDeltaBus.emit(r.delta);
	syncMutationResult(r);
	refreshAfterMutation();
	scheduleSave();
	return r;
}

export async function addLocations(locs: Location[], opts?: { hideInDelta?: boolean }) {
	if (!currentMap || locs.length === 0) return;
	indexExtrasFromLocations(locs);
	const extraKeys = new Set<string>();
	for (const l of locs) if (l.extra) for (const k of Object.keys(l.extra)) extraKeys.add(k);
	if (extraKeys.size > 0) autoRegisterFieldDefs([...extraKeys]);
	const t0 = performance.now();
	const r = await mutate(cmd.storeAddLocations(locs));
	log.debug(`[add] ipc=${(performance.now() - t0).toFixed(0)}ms delta: +${r.delta.added.length} -${r.delta.removed.length}`);
	for (let i = 0; i < r.delta.added.length && i < locs.length; i++) {
		locs[i].id = r.delta.added[i].id;
	}
	if (opts?.hideInDelta) {
		for (const entry of r.delta.added) entry.a = 0;
	}
	emitEvent("location:add", locs);
}

export async function duplicateLocation(locId: number): Promise<number | null> {
	if (!currentMap) return null;
	const loc = await fetchViaFile<Location>(cmd.storeGetLocationFile(locId));
	if (!loc) return null;
	const now = new Date().toISOString();
	const clone: Location = { ...loc, id: 0, createdAt: now, modifiedAt: now };
	await addLocations([clone]);
	return clone.id;
}

export function removeLocations(ids: Set<number>) {
	if (!currentMap || ids.size === 0) return;
	if (activeLocationId && ids.has(activeLocationId)) {
		activeLocationId = null;
		cachedActiveLocation = null;
		workArea = "overview";
	}
	mapVersion++;
	notify();
	emitEvent("location:remove", [...ids]);
	mutate(cmd.storeRemoveLocations([...ids]))
		.catch((e) => log.error("[delete] store_remove_locations failed:", e));
}

function buildUpdates(
	items: { id: number; patch: Partial<Location> }[],
): [number, Record<string, unknown>][] {
	return items.map(({ id, patch }) => {
		const p: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(patch)) {
			if (k !== "id") p[k] = v;
		}
		return [id, p];
	});
}

export function updateLocation(locId: number, patch: Partial<Location>) {
	if (!currentMap) return;
	const updates = buildUpdates([{ id: locId, patch }]);
	emitEvent("location:update", { id: locId, ...patch });
	mutate(cmd.storeUpdateLocations(updates, true))
		.then(() => {
			if (activeLocationId === locId) {
				fetchViaFile<Location>(cmd.storeGetLocationFile(locId))
					.then((loc) => {
						cachedActiveLocation = loc ?? null;
						mapVersion++;
						notify();
					})
					.catch((e) => log.error("[update] store_get_location refresh failed:", e));
			}
		})
		.catch((e) => log.error("[update] store_update_locations failed:", e));
}

export function batchUpdateLocations(updates: { id: number; patch: Partial<Location> }[]) {
	if (!currentMap || updates.length === 0) return Promise.resolve();
	return mutate(cmd.storeUpdateLocations(buildUpdates(updates), true)).catch((e) =>
		log.error("[batchUpdate] store_update_locations failed:", e),
	);
}

export function patchLocationExtra(
	locId: number,
	extraPatch: Record<string, unknown>,
	replace = false,
) {
	if (!currentMap) return;
	indexExtraPatch(extraPatch);
	autoRegisterFieldDefs(Object.keys(extraPatch));
	const send = (extra: Record<string, unknown>) => {
		mutate(cmd.storeUpdateLocations([[locId, { extra }]], false)).then(
			() => {
				if (activeLocationId === locId) {
					fetchViaFile<Location>(cmd.storeGetLocationFile(locId)).then((loc) => {
						cachedActiveLocation = loc ?? null;
						mapVersion++;
						notify();
					});
				}
			},
		);
	};
	if (replace) {
		send(extraPatch);
	} else {
		fetchViaFile<Location>(cmd.storeGetLocationFile(locId)).then((loc) => {
			send({ ...(loc?.extra || {}), ...extraPatch });
		});
	}
}

// --- Selections ---

export function useSelections() {
	useSyncExternalStore(subscribe, getMapSnapshot);
	return selections;
}

export function useSelectionVersion() {
	useSyncExternalStore(subscribe, getMapSnapshot);
	return selectionVersion;
}

/** Apply a pure selection transform, then IPC to Rust to resolve bitmasks and sync the overlay. */
async function applySelectionUpdate(updater: (m: MapData, sels: Selection[]) => Selection[]) {
	if (!currentMap) return;
	const t0 = performance.now();
	selections = updater(currentMap, selections);
	const sels = selections.map((s) => {
		let color = s.color;
		if (s.props.type === "Tag" && currentMap) {
			const tag = currentMap.meta.tags[s.props.tagId];
			if (tag) {
				const r = parseInt(tag.color.slice(1, 3), 16);
				const g = parseInt(tag.color.slice(3, 5), 16);
				const b = parseInt(tag.color.slice(5, 7), 16);
				color = [r, g, b] as [number, number, number];
			}
		}
		return { props: s.props, color };
	});
	const t1 = performance.now();
	let result;
	try {
		result = await cmd.storeSyncSelections(sels);
	} catch (e) {
		log.error("[selection] store_sync_selections failed:", e);
		return;
	}
	const t2 = performance.now();
	for (let i = 0; i < selections.length; i++) {
		selections[i] = { ...selections[i], count: result.counts[i] ?? 0 };
	}
	if (result.patchFile) await emitBitmaskFile(result.patchFile);
	const t3 = performance.now();
	log.debug(
		`[selection] total=${(t3 - t0).toFixed(0)}ms ipc=${(t2 - t1).toFixed(0)}ms apply=${(t3 - t2).toFixed(0)}ms selected=${result.selectedCount}`,
	);
	selectionVersion++;
	mapVersion++;
	notify();
	emitEvent("selection:change", selections);
}

export function addSelection(props: SelectionProps) {
	return applySelectionUpdate((m, sels) => addSel(m, sels, props));
}

export function removeSelection(key: string) {
	return applySelectionUpdate((_m, sels) => removeSel(sels, key));
}

export function resetSelections() {
	return applySelectionUpdate(() => []);
}

export function selectIntersection(keys: string[] | null = null) {
	return applySelectionUpdate((m, sels) => intersectSelections(m, sels, keys));
}

export function selectUnion(keys: string[] | null = null) {
	return applySelectionUpdate((m, sels) => unionSelections(m, sels, keys));
}

export function selectInverse(keys: string[] | null = null) {
	return applySelectionUpdate((m, sels) => invertSelections(m, sels, keys));
}

export function toggleManualSelection(locationId: number) {
	return applySelectionUpdate((m, sels) => toggleManual(m, sels, locationId));
}

export function selectEverything() {
	return addSelection({ type: "Everything" });
}

export function selectUntagged() {
	return addSelection({ type: "Untagged" });
}

export function selectUnpanned() {
	return addSelection({ type: "Unpanned" });
}

export function selectPanoIds() {
	return addSelection({ type: "PanoIds" });
}

export function selectNotPanoIds() {
	return addSelection({ type: "NotPanoIds" });
}

export function selectDuplicates(distance: number) {
	return addSelection({ type: "Duplicates", distance });
}

export function selectTag(tagId: number) {
	return addSelection({ type: "Tag", tagId });
}

export function selectPolygon(polygon: PolygonGeometry, includeInformational = false) {
	return addSelection({ type: "Polygon", polygon, includeInformational });
}

export function selectFilter(
	field: string,
	op: import("./selections").FilterOp,
	value: unknown,
	value2?: unknown,
) {
	return addSelection({ type: "Filter", field, op, value, value2 });
}

export function setPolygonName(key: string, name: string) {
	return applySelectionUpdate((_m, sels) => renamePolygonSel(sels, key, name));
}

// TODO: debounce — color picker fires this on every drag tick, triggering a full
// store_sync_selections IPC each time. Laggy on large maps.
export function setSelectionColor(key: string, color: [number, number, number]) {
	applySelectionUpdate((_m, sels) => setSelColor(sels, key, color));
}

export function reorderSelection(fromKey: string, toKey: string, position: "before" | "after") {
	applySelectionUpdate((_m, sels) => reorderSelections(sels, fromKey, toKey, position));
}

export function composeSelections(
	dragKey: string,
	dropKey: string,
	mode: "intersection" | "union",
	dragParent: string | null,
	dropParent: string | null,
) {
	applySelectionUpdate((m, sels) => {
		if (dragParent && dropParent && dragParent === dropParent) {
			return composeSiblingsSel(m, sels, dragParent, dragKey, dropKey, mode);
		}
		const updated = dragParent ? decomposeChildSel(m, sels, dragParent, dragKey) : sels;
		if (dropParent) {
			return composeWithChildSel(m, updated, dragKey, dropParent, dropKey, mode);
		}
		return composeSels(m, updated, dragKey, dropKey, mode);
	});
}

export function decomposeChild(parentKey: string, childKey: string) {
	applySelectionUpdate((m, sels) => decomposeChildSel(m, sels, parentKey, childKey));
}

export function removeChildFromSelection(parentKey: string, childKey: string) {
	applySelectionUpdate((m, sels) => removeFromCompositeSel(m, sels, parentKey, childKey));
}

export function toggleTagSelection(tagId: number) {
	if (!currentMap) return;
	const key = `tag:${tagId}`;
	const exists = selections.some((s) => s.key === key);
	if (exists) removeSelection(key);
	else selectTag(tagId);
}

export function useSelectedTagIds() {
	useSyncExternalStore(subscribe, getMapSnapshot);
	const ids = new Set<number>();
	for (const s of selections) if (s.props.type === "Tag") ids.add(s.props.tagId);
	return ids;
}

/** Set the active location. Fetches from Rust, checks for nearby duplicates, and updates workArea. */
export async function setActiveLocation(id: number | null, checkDuplicates = true) {
	const t0 = performance.now();
	activeLocationId = id;
	cmd.storeSetActive(id).catch((e) =>
		log.error("[setActive] store_set_active failed:", e),
	);
	if (id) {
		const loc = await fetchViaFile<Location>(cmd.storeGetLocationFile(id));
		log.debug(`[setActive] store_get_location_file ipc=${(performance.now() - t0).toFixed(0)}ms`);
		if (checkDuplicates && loc) {
			//todo
			const nearby = await cmd.storeFindNearby(loc.lat, loc.lng, 2.0);
			if (nearby.length >= 2) {
				duplicateLocations = nearby;
				workArea = "duplicates";
				activeLocationId = null;
				cachedActiveLocation = null;
				mapVersion++;
				notify();
				log.debug(`[setActive] duplicates=${nearby.length} total=${(performance.now() - t0).toFixed(0)}ms`);
				return;
			}
		}
		cachedActiveLocation = loc ?? null;
		workArea = "location";
	} else {
		cachedActiveLocation = null;
		duplicateLocations = [];
		workArea = activePluginId ? "plugin" : "overview";
	}
	mapVersion++;
	notify();
	log.debug(`[setActive] total=${(performance.now() - t0).toFixed(0)}ms`);
}

export function openDuplicateLocation(loc: Location) {
	activeLocationId = loc.id;
	cachedActiveLocation = loc;
	workArea = "location";
	cmd.storeSetActive(loc.id).catch((e) =>
		log.error("[setActive] store_set_active failed:", e),
	);
	mapVersion++;
	notify();
}

export function removeDuplicate(id: number) {
	duplicateLocations = duplicateLocations.filter((l) => l.id !== id);
	mapVersion++;
	notify();
}

export function closeDuplicates() {
	duplicateLocations = [];
	activeLocationId = null;
	cachedActiveLocation = null;
	workArea = "overview";
	mapVersion++;
	notify();
}

export function setWorkArea(area: WorkArea) {
	workArea = area;
	if (area !== "location") activeLocationId = null;
	if (area !== "plugin") activePluginId = null;
	mapVersion++;
	notify();
}

// --- Plugin mode ---

export function useActivePluginId() {
	useSyncExternalStore(subscribe, getMapSnapshot);
	return activePluginId;
}

export function getWorkArea() {
	return workArea;
}

export function getActivePluginId() {
	return activePluginId;
}

export function setPluginMode(pluginId: string) {
	workArea = "plugin";
	activePluginId = pluginId;
	activeLocationId = null;
	mapVersion++;
	notify();
}

export function exitPluginMode() {
	workArea = "overview";
	activePluginId = null;
	mapVersion++;
	notify();
}

// --- Tag CRUD ---

function persistTags() {
	if (currentMapId && currentMap) cmd.storeSaveTags(currentMapId, currentMap.meta.tags);
}

// TODO: likely dead code - Rust reconcile_tags now handles import dedup, and no known path creates orphaned tag IDs
function reconcileTags() {
	if (!currentMap) return;
	const tags = currentMap.meta.tags;
	let patched = false;
	const newTags = { ...tags };
	for (const idStr of Object.keys(tagCounts)) {
		const id = Number(idStr);
		if (tagCounts[id] > 0) {
			if (!tags[id]) {
				newTags[id] = {
					id,
					name: `Tag ${id}`,
					color: `hsl(${(id * 137) % 360}, 60%, 50%)`,
					visible: true,
				};
				patched = true;
			} else if (!tags[id].visible) {
				newTags[id] = { ...tags[id], visible: true };
				patched = true;
			}
		}
	}
	if (patched) {
		currentMap = { ...currentMap, meta: { ...currentMap.meta, tags: newTags } };
		persistTags();
	}
}

export function addTags(tags: Tag[]) {
	if (!currentMapId || !currentMap || tags.length === 0) return;
	const newTags = { ...currentMap.meta.tags };
	for (const tag of tags) {
		if (!newTags[tag.id]) newTags[tag.id] = tag;
	}
	currentMap = { ...currentMap, meta: { ...currentMap.meta, tags: newTags } };
	mapVersion++;
	notify();
	persistTags();
}

export function updateTags(patches: { id: number; patch: Partial<Tag> }[]) {
	if (!currentMapId || !currentMap || patches.length === 0) return;
	const newTags = { ...currentMap.meta.tags };
	for (const { id, patch } of patches) {
		const existing = newTags[id];
		if (existing) newTags[id] = { ...existing, ...patch };
	}
	currentMap = { ...currentMap, meta: { ...currentMap.meta, tags: newTags } };
	mapVersion++;
	notify();
	persistTags();
}

export async function deleteTags(tagIds: number[]) {
	if (!currentMapId || !currentMap || tagIds.length === 0) return;
	await mutate(cmd.storeStripTags(tagIds));
	const newTags = { ...currentMap.meta.tags };
	for (const tagId of tagIds) {
		const existing = newTags[tagId];
		if (existing) newTags[tagId] = { ...existing, visible: false };
		removeSelection(`tag:${tagId}`);
	}
	currentMap = { ...currentMap, meta: { ...currentMap.meta, tags: newTags } };
	persistTags();
}

export async function deleteSelectedTags() {
	if (!currentMapId || !currentMap) return;
	const tagIds = selections.filter((s) => s.props.type === "Tag").map((s) => (s.props as { type: "Tag"; tagId: number }).tagId);
	await deleteTags(tagIds);
}

export async function reorderTags(orderedIds: number[]) {
	if (!currentMapId || !currentMap) return;
	const newTags = { ...currentMap.meta.tags };
	for (let i = 0; i < orderedIds.length; i++) {
		const id = orderedIds[i];
		if (newTags[id]) newTags[id] = { ...newTags[id], order: i };
	}
	currentMap = { ...currentMap, meta: { ...currentMap.meta, tags: newTags } };
	mapVersion++;
	notify();
	persistTags();
}

export async function bulkAddTag(tagId: number) {
	if (!currentMap || selectedLocationIds.size === 0) return;
	const ids = [...selectedLocationIds];
	const locs = await cmd.storeGetLocationsByIds(ids);
	const updates: [number, LocationPatch][] = locs
		.filter((l) => !l.tags.includes(tagId))
		.map((l) => [l.id, { tags: [...l.tags, tagId] }]);
	if (updates.length === 0) return;
	await mutate(cmd.storeUpdateLocations(updates, true));
}

export async function bulkRemoveTag(tagId: number, locationIds: number[]) {
	if (!currentMap || locationIds.length === 0) return;
	const locs = await cmd.storeGetLocationsByIds(locationIds);
	const updates: [number, LocationPatch][] = locs
		.filter((l) => l.tags.includes(tagId))
		.map((l) => [l.id, { tags: l.tags.filter((t: number) => t !== tagId) }]);
	if (updates.length === 0) return;
	await mutate(cmd.storeUpdateLocations(updates, true));
}

export async function removeTagFromAll(tagId: number) {
	if (!currentMap) return;
	const allWithTag = await cmd.storeResolveSelection({ type: "Tag", tagId });
	if (allWithTag.length > 0) await bulkRemoveTag(tagId, allWithTag);
}

export async function removeTagFromSelection(tagId: number) {
	if (!currentMap || selectedLocationIds.size === 0) return;
	const ids = [...selectedLocationIds];
	await bulkRemoveTag(tagId, ids);
}

export async function renameTagInSelection(tagId: number, newName: string) {
	if (!currentMap || selectedLocationIds.size === 0) return;
	const oldTag = currentMap.meta.tags[tagId];
	if (!oldTag) return;

	const existingTag = Object.values(currentMap.meta.tags).find(
		(t) => t.name.toLowerCase() === newName.toLowerCase() && t.id !== tagId,
	);
	const newTagId = existingTag?.id ?? (await cmd.storeAllocTagId());
	if (!existingTag) {
		addTags([{
			id: newTagId,
			name: newName,
			color: oldTag.color,
			visible: true,
			order: oldTag.order,
		}]);
	}

	const locs = await cmd.storeGetLocationsByIds([...selectedLocationIds]);
	const updates: [number, LocationPatch][] = locs
		.filter((l) => l.tags.includes(tagId))
		.map((l) => [l.id, { tags: [...l.tags.filter((t: number) => t !== tagId), newTagId] }]);
	if (updates.length > 0) {
		await mutate(cmd.storeUpdateLocations(updates, true));
	}
}

// --- Review ---

export async function beginReview(locationIds: number[]) {
	if (!currentMap || locationIds.length === 0) return;
	const existing = await cmd.storeGetLocationsByIds(locationIds);
	const valid = existing.map((l) => l.id);
	if (valid.length === 0) return;
	review = { locations: valid, index: 0 };
	workArea = "location";
	await setActiveLocation(valid[0]);
}

export function cancelReview() {
	if (!review) return;
	review = null;
	activeLocationId = null;
	cachedActiveLocation = null;
	workArea = "overview";
	mapVersion++;
	notify();
}

export async function reviewNext() {
	if (!review) return;
	for (let i = review.index + 1; i < review.locations.length; i++) {
		review = { ...review, index: i };
		await setActiveLocation(review.locations[i]);
		if (cachedActiveLocation) return;
	}
	review = null;
	await setActiveLocation(null);
}

export async function reviewPrev() {
	if (!review) return;
	for (let i = review.index - 1; i >= 0; i--) {
		review = { ...review, index: i };
		await setActiveLocation(review.locations[i]);
		if (cachedActiveLocation) return;
	}
	review = null;
	await setActiveLocation(null);
}

export async function reviewDelete() {
	if (!review || !currentMap) return;
	const currentLocId = review.locations[review.index];
	await mutate(cmd.storeRemoveLocations([currentLocId]));
	const remaining = review.locations.filter((id) => id !== currentLocId);
	if (remaining.length === 0 || review.index >= remaining.length) {
		review = null;
		await setActiveLocation(null);
	} else {
		review = { locations: remaining, index: review.index };
		await setActiveLocation(remaining[review.index]);
	}
	if (selections.length > 0) {
		applySelectionUpdate((_, sels) => sels);
	}
}

// --- Undo/redo ---

/** Shared undo/redo handler: call the IPC, reconcile orphaned tags, clear active if removed. */
async function undoRedo(which: () => Promise<MutationResult>) {
	if (!currentMap) return;
	try {
		const r = await mutate(which());
		reconcileTags();
		if (activeLocationId && r.delta.removed.some((e) => e.id === activeLocationId)) {
			activeLocationId = null;
			cachedActiveLocation = null;
			workArea = "overview";
		}
	} catch (e) {
		log.debug(`[${which.name}] nothing or failed:`, e);
	}
}

export function undo() {
	return undoRedo(cmd.storeUndo);
}
export function redo() {
	return undoRedo(cmd.storeRedo);
}

let undoRedoState = { canUndo: false, canRedo: false };

export function getUndoRedoState() {
	return undoRedoState;
}

export function useUndoRedo() {
	useSyncExternalStore(subscribe, getMapSnapshot);
	return undoRedoState;
}

// --- Version control ---

function formatDiffMessage(diff: {
	added: number;
	removed: number;
	modified: number;
}): string | undefined {
	const parts: string[] = [];
	if (diff.added > 0) parts.push(`+${diff.added}`);
	if (diff.removed > 0) parts.push(`-${diff.removed}`);
	if (diff.modified > 0) parts.push(`~${diff.modified}`);
	return parts.length > 0 ? parts.join(" ") : undefined;
}

/** Bake overlay, snapshot Arrow file, create a VCS commit. Resets undo stack. */
export async function commitMap(message?: string): Promise<string> {
	if (!currentMapId) throw new Error("No map open");
	const t0 = performance.now();
	await cmd.storeBakeAndSave();
	log.debug(`[commit] bake_and_save=${(performance.now() - t0).toFixed(0)}ms`);
	const t1 = performance.now();
	const diff = await computeCommitDiff();
	log.debug(`[commit] computeCommitDiff=${(performance.now() - t1).toFixed(0)}ms`);
	const t2 = performance.now();
	const autoMessage = message ?? formatDiffMessage(diff);
	const id = await cmd.storeCreateCommit(currentMapId, autoMessage ?? null, diff ?? null);
	log.debug(`[commit] createCommit=${(performance.now() - t2).toFixed(0)}ms`);
	const t3 = performance.now();
	await cmd.storeResetUndo();
	log.debug(
		`[commit] reset_undo=${(performance.now() - t3).toFixed(0)}ms total=${(performance.now() - t0).toFixed(0)}ms`,
	);
	undoRedoState = { canUndo: false, canRedo: false };
	cachedCommitDiff = { added: 0, removed: 0, modified: 0 };
	mapVersion++;
	notify();
	return id;
}

export async function checkoutCommit(commitId: string) {
	if (!currentMapId) return;
	await flushSave();
	try {
		await cmd.storeCloseMap();
		await cmd.storeCheckoutCommit(currentMapId, commitId);
		await cmd.storeOpenMap(currentMapId);
		await cmd.storeResetUndo();
		const msg = `Revert to ${commitId.slice(0, 7)}`;
		await cmd.storeCreateCommit(currentMapId, msg, null);
	} catch (e) {
		log.error("[checkout] restore failed:", e);
		throw e;
	}
	currentMap = await cmd.storeGetMap(currentMapId);
	selections = [];
	selectedLocationIds = new Set();
	activeLocationId = null;
	undoRedoState = { canUndo: false, canRedo: false };

	renderDeltaBus.emit({ added: [], updated: [], removed: [], colorPatches: [], fullReset: true });
	refreshAfterMutation();
	await invalidateMapList();
}
