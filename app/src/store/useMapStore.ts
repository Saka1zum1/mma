import { memoOnRefs } from "@/lib/util/memoOnRefs";
import type { WorkArea, MaybeLocation } from "@/types";
import {
	isVirtualLocation,
	isImportPreview,
	LocationFlag,
	locId,
	applyLocationPatch,
} from "@/types";
import type {
	Location,
	MapData,
	MapMeta,
	MapSettings,
	Tag,
	ExtraFieldDef,
} from "@/bindings.gen";
import { listen } from "@tauri-apps/api/event";
import { cmd } from "@/lib/commands";
import type {
	MutationResult,
	MapMetaPatch_Deserialize as MapMetaPatch,
	SelectionSync,
} from "@/bindings.gen";
import { emit as emitEvent, useEventValue } from "@/lib/events";
import { log, fireAndForget } from "@/lib/util/log";
import { hexToRgb } from "@/lib/util/color";
import { trace } from "@/lib/util/debug";
import { nowUnix } from "@/lib/util/format";
import { mmaBufUrl } from "@/lib/util/util";
import {
	setUserFieldDefs,
	mergeUserFieldDefs,
	resetForMapChange,
} from "@/lib/data/fieldDefRegistry";
import {
	planFieldMove,
	planFieldDelete,
	rewriteSelectionFields,
	type MergeWinner,
} from "@/lib/data/fieldOps";
import type { LocationPatch_Deserialize as LocationPatch, Update, TagPatch } from "@/bindings.gen";
import { SelectedIds, decodeSelectionBitmask, type ReadonlyIdSet } from "@/lib/render/CellManager";
import { resetImportState } from "./importStaging";
import { resetCommitDiffState, resetCommitDiffCounts } from "./commitDiff";
import { setCachedMapList, invalidateMapList, reloadMapList } from "./mapList";

import type { Selection, SelectionProps } from "@/bindings.gen";
import {
	type GroupType,
	addSelection as addSel,
	removeSelection as removeSel,
	intersectSelections,
	unionSelections,
	invertSelections,
	toggleManualSelection as toggleManual,
	setPolygonName as renamePolygonSel,
	setSelectionColors as setSelColor,
	reorderSelections,
	composeSelections as composeSels,
	composeWithChild as composeWithChildSel,
	decomposeChild as decomposeChildSel,
	removeFromComposite as removeFromCompositeSel,
	composeSiblings as composeSiblingsSel,
	replaceSelection as replaceSel,
	sampleIds,
	isolateGhostKeys,
} from "./selections";

// --- Map state ---
export interface MapState {
	mapId: string | null;
	/** Persisted identity slice (metadata + settings). Changes rarely. */
	map: MapData | null;
	locationCount: number;
	canUndo: boolean;
	canRedo: boolean;
	/** All tags by id, including soft-deleted ghosts (visible=false, kept for undo revival). */
	tags: Record<number, Tag>;
	/** Per-tag location counts for the open map, keyed by tag id. */
	tagCounts: Record<number, number>;
	/** Resolved count per selection node (top-level and nested), keyed by `Selection.key`.
	 *  The sole source for sidebar counts — refreshed wholesale from Rust on every sync. */
	selectionCounts: Record<string, number>;
	/** Extra-field keys known to exist in location data on the current map.
	 *  Populated from `StoreStatus.knownFieldKeys` on map open, extended
	 *  incrementally via `MutationResult.newFieldDefs`. */
	knownFieldKeys: ReadonlySet<string>;
	selections: Selection[];
	/** Keys of selections that are "ghosted": kept in the list but excluded from the
	 *  Rust sync, so they neither render nor count toward the selected set. Ephemeral. */
	ghostedSelections: ReadonlySet<string>;
	selectedLocationIds: SelectedIds;
	activeLocationId: number | null;
	/** The location open in the editor, or null. Virtual locations (staged
	 *  imports, seen previews) live here with negative ids. */
	activeLocation: Location | null;
	duplicateLocations: Location[];
	workArea: WorkArea;
	activePluginId: string | null;
}

const INITIAL_STATE: MapState = {
	mapId: null,
	map: null,
	locationCount: 0,
	canUndo: false,
	canRedo: false,
	tags: {},
	tagCounts: {},
	selectionCounts: {},
	knownFieldKeys: new Set(),
	selections: [],
	ghostedSelections: new Set(),
	selectedLocationIds: SelectedIds.EMPTY,
	activeLocationId: null,
	activeLocation: null,
	duplicateLocations: [],
	workArea: "overview",
	activePluginId: null,
};

let state: MapState = INITIAL_STATE;

/** Re-mint the state object with a shallow patch. Field values are hook
 *  snapshots: reassign, never mutate in place. */
function setState(patch: Partial<MapState>) {
	state = { ...state, ...patch };
}

/** Merge non-null fields into the state (JSON merge patch: null = unchanged). */
function mergeState(patch: { [K in keyof MapState]?: MapState[K] | null }) {
	const next = { ...state };
	for (const key of Object.keys(patch) as (keyof MapState)[]) {
		const v = patch[key];
		if (v != null) (next as Record<keyof MapState, unknown>)[key] = v;
	}
	state = next;
}

/** Reactive slice of the map state. Re-renders only when the selected value's
 *  reference changes (`Object.is`), so selectors must return state fields or
 *  cached derivations — never construct a value per call. */
export function useMapState<T>(selector: (s: MapState) => T): T {
	return useEventValue("store:changed", () => selector(state));
}

/** Imperative snapshot of the map state. */
export function getMapState(): Readonly<MapState> {
	return state;
}

/** Tags that exist from the user's point of view. Raw `tags` also holds soft-deleted ghosts (count=0, visible=false, kept for undo revival) — almost nothing outside the undo/revival machinery should enumerate those. */
export const getVisibleTags: () => Tag[] = memoOnRefs(
	() => [state.tags] as const,
	(tags) => Object.values(tags).filter((t) => t.visible !== false),
);

/** Raw by-id tag lookup — includes soft-deleted ghosts so stale references
 *  (e.g. a selection whose tag just died) still resolve to a name. */
export function getTag(id: number): Tag | undefined {
	return state.tags[id];
}

// --- Autosave ---
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let inflightPersist: Promise<void> | null = null;
const AUTOSAVE_DELAY_MS = 2000;

/** Schedule an autosave shortly. Mutations call this automatically; debounced. */
export function scheduleSave() {
	if (autosaveTimer) clearTimeout(autosaveTimer);
	autosaveTimer = setTimeout(() => {
		autosaveTimer = null;
		doSave();
	}, AUTOSAVE_DELAY_MS);
}

export function cancelAutosave() {
	if (autosaveTimer) {
		clearTimeout(autosaveTimer);
		autosaveTimer = null;
	}
}

export function waitForInflightPersist() {
	return inflightPersist;
}

/** Background auto-commit after an import with autoCommit set. */
export function scheduleAutoCommit(mapId: string, importedCount: number) {
	inflightPersist = cmd
		.storeCommit(mapId, `Import ${importedCount} locations`)
		.then(() => {
			setState({ canUndo: false, canRedo: false });
			resetCommitDiffCounts();
		})
		.catch((e: unknown) => log.error("[import] background commit failed:", e))
		.finally(() => {
			inflightPersist = null;
			emitEvent("store:changed");
		});
}

async function doSave(): Promise<void> {
	if (!state.mapId || !state.map) return;
	await inflightPersist;

	const t = trace("save");
	inflightPersist = cmd
		.storeSaveDirty()
		.then(() => {
			t.end();
			invalidateMapList();
		})
		.catch((err) => {
			scheduleSave();
			log.error("Autosave failed, will retry:", err);
		})
		.finally(() => {
			inflightPersist = null;
		});
	await inflightPersist;
}

/** Save any unsaved changes now instead of waiting for the autosave timer. */
export async function flushSave(): Promise<void> {
	cancelAutosave();
	await doSave();
}

// --- Init (called once at startup) ---
/** One-time store startup. The app calls this; plugins never need to. */
export async function initStore() {
	setCachedMapList(await cmd.storeListMaps());
	emitEvent("store:changed");
	listen("map-list-changed", () => reloadMapList());
}

/** Cross-module stopwatch for map-open latency. */
export const mapOpen = {
	start: 0,
	seen: new Set<string>(),
	begin() {
		this.start = performance.now();
		this.seen.clear();
	},
	mark(phase: string) {
		if (!this.start || this.seen.has(phase)) return;
		this.seen.add(phase);
		log.info(`[map-open] ${phase}=${Math.round(performance.now() - this.start)}ms`);
	},
};

/** Reset all per-map editing state to its initial values. */
function clearEditState() {
	setState({
		selections: [],
		selectedLocationIds: SelectedIds.EMPTY,
		activeLocationId: null,
		activeLocation: null,
		workArea: "overview",
	});
	resetImportState();
	resetCommitDiffState();
}

// --- Actions ---
/** Open a map in this window, closing any currently open map first. */
export async function openMap(id: string) {
	mapOpen.begin();

	cancelAutosave();
	await inflightPersist;

	const t = trace("openMap");
	setState({ mapId: id, map: null });
	emitEvent("store:changed");
	const meta = await cmd.storeGetMap(id);
	t.step("getMap");

	if (meta) {
		try {
			const openResult = await cmd.storeOpenMap(id);
			t.step("store_open_map");
			mapOpen.mark("data");
			setState({
				map: meta,
				locationCount: meta.meta.locationCount,
				tags: meta.meta.tags,
				tagCounts: openResult.tagCounts ?? {},
				canUndo: openResult.canUndo,
				canRedo: openResult.canRedo,
				knownFieldKeys: new Set(openResult.knownFieldKeys),
			});
			setUserFieldDefs(meta.meta.extra?.fields ?? {});
		} catch (e) {
			log.error("[openMap] store_open_map failed:", e);
			setState({ mapId: null, map: null });
			emitEvent("store:changed");
			return;
		}
		cmd.storeTouchMapOpened(id);
	}

	clearEditState();
	emitEvent("store:changed");
	t.end();
	if (state.map) emitEvent("map:open", state.map);
}

/** Tear down all in-memory state for the open map. */
function resetMapState() {
	emitEvent("map:close");
	setState({ mapId: null, map: null });

	clearEditState();
	setState({ knownFieldKeys: new Set() });
	resetForMapChange();

	emitEvent("render:delta", { added: [], updated: [], removed: [], fullReset: true });
	setState({ canUndo: false, canRedo: false, tags: {}, tagCounts: {}, locationCount: 0 });
	emitEvent("store:changed");
}

/** Close the open map, saving unsaved changes first. */
export async function closeMap() {
	await flushSave();
	resetMapState();
	await cmd.storeCloseMap();
}

/** Drop the open map without persisting anything */
export function discardOpenMap() {
	cancelAutosave();
	resetMapState();
}

/** Fetch every location in the map. */
export async function fetchAllLocations(): Promise<Location[]> {
	const path = await cmd.storeGetAllLocations();
	const res = await fetch(mmaBufUrl(path));
	return res.json();
}

/** Fetch one location by id, or null if it doesn't exist. */
export async function fetchLocation(id: number): Promise<Location | null> {
	return cmd.storeGetLocation(id);
}

/** Fetch locations by id (missing ids are skipped). Prefer this over per-id fetches. */
export async function fetchLocationsByIds(ids: number[]): Promise<Location[]> {
	return cmd.storeGetLocationsByIds(ids);
}

/** Active (non-ghosted) selections, the default for any operational logic. */
export const getActiveSelections: () => Selection[] = memoOnRefs(
	() => [state.selections, state.ghostedSelections] as const,
	(sels, ghosts) => (ghosts.size === 0 ? sels : sels.filter((s) => !ghosts.has(s.key))),
);

/** Overwrite the selected-id set directly, bypassing selection resolution. Rarely what you want -- prefer `addSelections`. */
export function setSelectedLocationIds(ids: SelectedIds) {
	setState({ selectedLocationIds: ids });
}

/** Optimistically patch map meta, persist, and refresh the map list. */
async function patchMapMeta(id: string, patch: MapMetaPatch) {
	if (state.map && state.mapId === id) {
		const meta = { ...state.map.meta };
		if (patch.name != null) meta.name = patch.name;
		if (patch.description != null) meta.description = patch.description;
		if (patch.folder !== undefined) meta.folder = patch.folder;
		if (patch.settings != null) {
			// MapMetaPatch_Deserialize carries partial settings; merge onto the live map.
			meta.settings = {
				...meta.settings,
				...patch.settings,
				providers: {
					...meta.settings.providers,
					...patch.settings.providers,
				},
			} as MapSettings;
		}
		if (patch.scoreBounds != null) meta.scoreBounds = patch.scoreBounds;
		if (patch.extra != null) meta.extra = patch.extra;
		if (patch.labels != null) meta.labels = patch.labels;
		setState({ map: { ...state.map, meta } });
	}
	emitEvent("store:changed");
	await cmd.storeUpdateMapMeta(id, patch);
	await invalidateMapList();
}

export function renameMap(id: string, name: string) {
	return patchMapMeta(id, { name });
}

export function updateMapLabels(id: string, labels: string[]) {
	return patchMapMeta(id, { labels });
}

export function updateMapMeta(patch: MapMetaPatch) {
	if (!state.mapId) return;
	return patchMapMeta(state.mapId, patch);
}

/** Replace the map's extra-field definitions (types/labels for `Location.extra` keys). */
export async function setMapExtraFields(fields: Record<string, ExtraFieldDef>) {
	if (!state.mapId || !state.map) return;
	const current = state.map.meta.extra ?? {};
	const replaced = { ...current, fields };
	setState({ map: { ...state.map, meta: { ...state.map.meta, extra: replaced } } });
	setUserFieldDefs(fields);
	emitEvent("store:changed");
	await cmd.storeUpdateMapMeta(state.mapId, { extra: replaced } as Partial<MapMeta>);
}

/** Keys of tag selections whose tag just died (deleted or went invisible). */
function deadTagKeys(oldTags: Record<number, Tag>, newTags: Record<number, Tag>): string[] {
	const keys: string[] = [];
	for (const idStr of Object.keys(oldTags)) {
		const id = Number(idStr);
		const was = oldTags[id];
		const now = newTags[id];
		if (was && was.visible !== false && (!now || now.visible === false)) {
			keys.push(`tag:${id}`);
		}
	}
	return keys;
}

/** Merge a Rust MutationResult into the state: present fields are set, null
 *  fields were unchanged and are skipped (JSON-merge-patch semantics). */
function applyMutation(r: MutationResult) {
	if (!state.map) return;
	const oldTags = state.tags;
	mergeState({
		locationCount: r.locationCount,
		canUndo: r.canUndo,
		canRedo: r.canRedo,
		tagCounts: r.tagCounts,
		tags: r.tags,
		knownFieldKeys:
			r.newFieldDefs && new Set([...state.knownFieldKeys, ...Object.keys(r.newFieldDefs)]),
	});
	if (r.newFieldDefs) mergeUserFieldDefs(r.newFieldDefs);
	if (r.tags) removeSelections(deadTagKeys(oldTags, r.tags));
	if (r.selectionSync) applySelectionSync(r.selectionSync);
}

/** Decode the inline bitmask bytes from Rust and emit to the event bus. */
export function emitBitmask(bytes: number[]) {
	const { selColors, cellEntries } = decodeSelectionBitmask(bytes);
	emitEvent("render:selection", {
		selColors,
		cellEntries,
		setIds: (ids) => {
			setState({ selectedLocationIds: ids });
		},
	});
}

function applySelectionSync(sync: SelectionSync) {
	setState({ selectionCounts: sync.counts });
	if (sync.bitmask) emitBitmask(sync.bitmask);
}

const EMPTY_MUTATION: MutationResult = {
	delta: { added: [], updated: [], removed: [], fullReset: false },
	selectionSync: null,
	newFieldDefs: null,
	tags: null,
	version: 0,
	locationCount: 0,
	canUndo: false,
	canRedo: false,
	tagCounts: null,
	knownFieldKeys: [],
};

/** Run a mutation IPC, emit its render delta, sync JS state, and schedule a save. */
export async function mutate(fn: () => Promise<MutationResult>): Promise<MutationResult> {
	if (!state.map) return EMPTY_MUTATION;
	const r = await fn();
	await inflightPersist;
	emitEvent("render:delta", r.delta);
	applyMutation(r);
	emitEvent("store:changed");
	scheduleSave();
	return r;
}

/** Add locations to the map. Rust assigns real ids and they are written back into
 *  the passed objects -- build with `createLocation` (id 0) and read `loc.id` after. Undoable. */
export async function addLocations(locs: Location[]) {
	if (locs.length === 0) return;
	const t = trace("add");
	const r = await mutate(() => cmd.storeAddLocations(locs));
	t.end({ delta: `+${r.delta.added.length} -${r.delta.removed.length}` });
	for (let i = 0; i < r.delta.added.length && i < locs.length; i++) {
		locs[i].id = r.delta.added[i].id;
	}
	emitEvent("location:add", locs);
}

/** Clone a location in place and return the new id, or null if it doesn't exist. Undoable. */
export async function duplicateLocation(id: number): Promise<number | null> {
	if (!state.map || isVirtualLocation({ id })) return null;
	const loc = await cmd.storeGetLocation(id);
	if (!loc) return null;
	const now = nowUnix();
	const clone: Location = { ...loc, id: 0, createdAt: now, modifiedAt: now };
	await addLocations([clone]);
	return clone.id;
}

/** Remove locations by id. Undoable. */
export async function removeLocations(ids: ReadonlyIdSet) {
	if (ids.size === 0) return;
	if ([...ids].some((id) => isVirtualLocation({ id }))) {
		await setActiveLocation(null);
		return;
	}
	if (state.activeLocationId && ids.has(state.activeLocationId)) setWorkArea("overview");
	emitEvent("store:changed");
	await mutate(() => cmd.storeRemoveLocations([...ids])).catch((e) =>
		log.error("[delete] store_remove_locations failed:", e),
	);
	emitEvent("location:remove", [...ids]);
}

/** Patch locations by id. Only include the fields you're changing; `extra` merges
 *  per-key (null deletes a key). Undoable by default. */
export async function updateLocations(
	updates: Update<LocationPatch>[],
	opts?: { undoable?: boolean },
) {
	if (updates.length === 0) return;
	if (updates.some((u) => isVirtualLocation(u))) return;
	await mutate(() => cmd.storeUpdateLocations(updates, opts?.undoable ?? true));
	emitEvent("location:update", updates);
	if (state.activeLocation && updates.some((u) => u.id === state.activeLocationId)) {
		const activePatch = updates.find((u) => u.id === state.activeLocationId)?.patch;
		if (activePatch) {
			setState({ activeLocation: applyLocationPatch(state.activeLocation, activePatch) });
		}
		emitEvent("store:changed");
	}
}

// --- Bulk metadata-field operations ---

/** Rename or merge extra-field `from` into `to` across all locations, then migrate
 *  its definition and every selection that references it. Merge ≡ rename; `winner`
 *  decides the survivor only where a location already holds `to`. */
export async function renameField(from: string, to: string, winner: MergeWinner = "from") {
	if (!state.map || from === to || !to) return;
	const updates = planFieldMove(await fetchAllLocations(), from, to, winner);
	const nextKeys = new Set(state.knownFieldKeys);
	if (updates.length) {
		await updateLocations(updates, { undoable: false });
		nextKeys.add(to);
	}
	nextKeys.delete(from);
	setState({ knownFieldKeys: nextKeys });
	await migrateFieldReferences(from, to);
}

/** Delete extra-field `key` from every location, its definition, and references. */
export async function deleteField(key: string) {
	if (!state.map) return;
	const updates = planFieldDelete(await fetchAllLocations(), key);
	if (updates.length) {
		await updateLocations(updates, { undoable: false });
	}
	const nextKeys = new Set(state.knownFieldKeys);
	nextKeys.delete(key);
	setState({ knownFieldKeys: nextKeys });
	await migrateFieldReferences(key, null);
}

/** Migrate field definition + active selection references after a data move.
 *  Saved selections are deliberately NOT rewritten: they are global name-based
 *  rules resolved against whichever map is open, so a map-local rename/delete
 *  must not mutate them (the rule simply stops resolving here). */
async function migrateFieldReferences(from: string, to: string | null) {
	if (!state.map) return;
	const defs = { ...(state.map.meta.extra?.fields ?? {}) };
	if (defs[from]) {
		if (to && !defs[to]) defs[to] = defs[from];
		delete defs[from];
		await setMapExtraFields(defs);
	}
	await applySelectionUpdate((sels) => rewriteSelectionFields(sels, from, to));
}

// --- Selections ---

/** Resolve a selection's overlay color, substituting the live tag color for Tag selections. */
function selectionSyncColor(s: Selection): [number, number, number] {
	if (s.props.type === "Tag") {
		const tag = state.tags[s.props.tagId];
		if (tag) return hexToRgb(tag.color);
	}
	return s.color;
}

/** All selections, each flagged ghosted or not. Rust counts every one, renders/selects only non-ghosted. */
function buildSyncInputs() {
	return state.selections.map((s) => ({
		key: s.key,
		props: s.props,
		color: selectionSyncColor(s),
		ghosted: state.ghostedSelections.has(s.key),
	}));
}

/** Apply a pure selection transform, then IPC to Rust to resolve bitmasks and sync the overlay. */
async function applySelectionUpdate(updater: (sels: Selection[]) => Selection[]) {
	if (!state.map) return;
	const t = trace("selection", { summary: true });
	const selections = updater(state.selections);
	setState({
		selections,
		ghostedSelections: pruneGhosted(selections, state.ghostedSelections),
	});
	const sels = buildSyncInputs();
	const result = await cmd.storeSyncSelections(sels);
	t.step("ipc");
	applySelectionSync(result);
	emitEvent("store:changed");
	t.step("apply");
	t.end({ selected: result.selectedCount });
	emitEvent("selection:change", selections);
}

/** Drop ghosted keys that no longer correspond to a live selection. */
function pruneGhosted(selections: Selection[], ghosted: ReadonlySet<string>): ReadonlySet<string> {
	if (ghosted.size === 0) return ghosted;
	const live = new Set(selections.map((s) => s.key));
	const pruned = new Set([...ghosted].filter((k) => live.has(k)));
	return pruned.size !== ghosted.size ? pruned : ghosted;
}

/** Toggle a selection's ghosted state and re-sync (excludes/includes it from the overlay). */
export function toggleGhostSelection(key: string) {
	const next = new Set(state.ghostedSelections);
	if (next.has(key)) next.delete(key);
	else next.add(key);
	setState({ ghostedSelections: next });
	return applySelectionUpdate((sels) => sels);
}

/** "Solo" a selection: ghost every other top-level selection, keep this one visible.
 *  If it is already the only visible one, un-ghost everything (toggle back). */
export function isolateSelection(key: string) {
	setState({
		ghostedSelections: isolateGhostKeys(
			state.selections.map((s) => s.key),
			state.ghostedSelections,
			key,
		),
	});
	return applySelectionUpdate((sels) => sels);
}

/** Ghost every top-level selection; if all are already ghosted, un-ghost them all. */
export function toggleGhostAllSelections() {
	const keys = state.selections.map((s) => s.key);
	const allGhosted = keys.length > 0 && keys.every((k) => state.ghostedSelections.has(k));
	setState({
		ghostedSelections: allGhosted ? new Set() : new Set([...state.ghostedSelections, ...keys]),
	});
	return applySelectionUpdate((sels) => sels);
}

/** Add selections to the sidebar and highlight their locations. Same-key selections replace. */
export function addSelections(props: SelectionProps[]) {
	return applySelectionUpdate((sels) => {
		let result = sels;
		for (const p of props) result = addSel(result, p);
		return result;
	});
}

/** No-op (no sync) when none of the keys are live selections. */
export function removeSelections(keys: string[]) {
	const live = new Set(state.selections.map((s) => s.key));
	const present = keys.filter((k) => live.has(k));
	if (present.length === 0) return;
	return applySelectionUpdate((sels) => {
		let result = sels;
		for (const k of present) result = removeSel(result, k);
		return result;
	});
}

/** Clear all selections. */
export function resetSelections() {
	return applySelectionUpdate(() => []);
}

/** Combine selections into an AND composite. `keys` null combines all top-level selections. */
export function selectIntersection(keys: string[] | null = null) {
	return applySelectionUpdate((sels) => intersectSelections(sels, keys));
}

/** Combine selections into an OR composite. `keys` null combines all top-level selections. */
export function selectUnion(keys: string[] | null = null) {
	return applySelectionUpdate((sels) => unionSelections(sels, keys));
}

/** Wrap selections in an Invert composite (everything NOT in them). `keys` null inverts all. */
export function selectInverse(keys: string[] | null = null) {
	return applySelectionUpdate((sels) => invertSelections(sels, keys));
}

/** Add or remove one location from the Manual selection (creating it if needed). */
export function toggleManualSelection(locationId: number) {
	return applySelectionUpdate((sels) => toggleManual(sels, locationId));
}

/** Replace the current selection with a single Manual selection holding `count` ids picked
 *  at random from whatever is currently selected. `count` is clamped to the selection size.
 *  No-op when nothing is selected. Returns the number of ids actually picked. */
export function selectRandomFromSelection(count: number): number {
	const ids = Array.from(state.selectedLocationIds);
	const picked = sampleIds(ids, count);
	if (picked.length === 0) return 0;
	void applySelectionUpdate(() => addSel([], { type: "Manual", locations: picked }));
	return picked.length;
}

/** Replace the current selection with a single Manual selection of ids picked from the
 *  current selection, spaced apart in Rust: either `count` ids maximizing spacing, or as
 *  many as fit at `minDistanceM`. No-op when the pick returns nothing. */
export async function selectSpacedFromSelection(opts: {
	count?: number;
	minDistanceM?: number;
}): Promise<{ picked: number; distanceM: number }> {
	const result = await cmd.storePickSpaced(opts.count ?? null, opts.minDistanceM ?? null);
	if (result.ids.length === 0) return { picked: 0, distanceM: 0 };
	await applySelectionUpdate(() => addSel([], { type: "Manual", locations: result.ids }));
	return { picked: result.ids.length, distanceM: result.distanceM };
}

/** Read-only preview of transitive duplicate groups (size >= 2) within `distance` metres. */
export function previewDuplicateGroups(distance: number): Promise<number[][]> {
	return cmd.storeDuplicateGroups(distance);
}

/** Merge each transitive duplicate group into one survivor (tags unioned). One undoable edit. */
export async function mergeDuplicates(distance: number) {
	await mutate(() => cmd.storeMergeDuplicates(distance));
}

/**
 * Prune duplicates within a resolved selection: keeps the most relevant location per
 * cluster (<= 25m) or thins to enforce spacing (> 25m). Locations tagged "keep pano"
 * get a +5 score bonus. Returns the number pruned.
 */
export async function pruneDuplicates(props: SelectionProps, distance: number): Promise<number> {
	if (!state.map) return 0;
	const ids = await cmd.storeResolveSelection(props);
	if (ids.length === 0) return 0;
	const keepTagIds = getVisibleTags()
		.filter((t) => t.name === "keep pano")
		.map((t) => t.id);
	const r = await mutate(() => cmd.storePruneDuplicates(ids, distance, keepTagIds));
	return r.delta.removed.length;
}

/** Edit an existing filter (or any selection) in place by key, preserving its
 *  position inside any AND/OR/Invert composite. Carries ghost state to the new key. */
export function updateFilterSelection(oldKey: string, props: SelectionProps) {
	return applySelectionUpdate((sels) => {
		const next = replaceSel(sels, oldKey, props);
		// Carry a ghost flag across an in-place re-key. A collision instead merges into the
		// existing selection (shrinking the list); the survivor keeps its own ghost state and
		// pruneGhosted clears the old key, so only migrate when nothing was merged away.
		if (next.length === sels.length) {
			let migrated: Set<string> | null = null;
			for (let i = 0; i < sels.length; i++) {
				if (next[i].key !== sels[i].key && state.ghostedSelections.has(sels[i].key)) {
					migrated ??= new Set(state.ghostedSelections);
					migrated.delete(sels[i].key);
					migrated.add(next[i].key);
				}
			}
			if (migrated) setState({ ghostedSelections: migrated });
		}
		return next;
	});
}

/** Rename a polygon selection. */
export function setPolygonName(key: string, name: string) {
	return applySelectionUpdate((sels) => renamePolygonSel(sels, key, name));
}

/** Set the highlight color of selections, by key. */
export function setSelectionColors(entries: { key: string; color: [number, number, number] }[]) {
	applySelectionUpdate((sels) => {
		let result = sels;
		for (const { key, color } of entries) result = setSelColor(result, key, color);
		return result;
	});
}

/** Move a selection before/after another in the sidebar order. */
export function reorderSelection(fromKey: string, toKey: string, position: "before" | "after") {
	applySelectionUpdate((sels) => reorderSelections(sels, fromKey, toKey, position));
}

/** Nest existing selections under a new AND/OR/Invert composite. */
export function composeSelections(
	dragKey: string,
	dropKey: string,
	mode: GroupType,
	dragParent: string | null,
	dropParent: string | null,
) {
	applySelectionUpdate((sels) => {
		if (dragParent && dropParent && dragParent === dropParent) {
			return composeSiblingsSel(sels, dragParent, dragKey, dropKey, mode);
		}
		const updated = dragParent ? decomposeChildSel(sels, dragParent, dragKey) : sels;
		if (dropParent) {
			return composeWithChildSel(updated, dragKey, dropParent, dropKey, mode);
		}
		return composeSels(updated, dragKey, dropKey, mode);
	});
}

/** Pull a child out of a composite back to the top level. */
export function decomposeChild(parentKey: string, childKey: string) {
	applySelectionUpdate((sels) => decomposeChildSel(sels, parentKey, childKey));
}

/** Delete a child from a composite (without re-adding it at the top level). */
export function removeChildFromSelection(parentKey: string, childKey: string) {
	applySelectionUpdate((sels) => removeFromCompositeSel(sels, parentKey, childKey));
}

/** Toggle tag selections on/off for the given tags (used by tag-pill clicks). */
export function toggleTagSelections(tagIds: number[]) {
	if (!state.map || tagIds.length === 0) return;
	applySelectionUpdate((sels) => {
		let result = sels;
		for (const tagId of tagIds) {
			const key = `tag:${tagId}`;
			const exists = result.some((s) => s.key === key);
			if (exists) result = removeSel(result, key);
			else result = addSel(result, { type: "Tag", tagId });
		}
		return result;
	});
}

/** Tag ids that currently have a Tag selection (cached; keyed on the selection list,
 *  identity-stable while the set of ids is unchanged). */
export const getSelectedTagIds: () => ReadonlySet<number> = (() => {
	let prev: Set<number> | null = null;
	return memoOnRefs(
		() => [state.selections] as const,
		(sels) => {
			const ids = new Set<number>();
			for (const s of sels) if (s.props.type === "Tag") ids.add(s.props.tagId);
			if (prev && prev.size === ids.size && [...ids].every((id) => prev!.has(id))) return prev;
			prev = ids;
			return ids;
		},
	);
})();

let virtualIdSeq = 0;
/** Each preview gets a fresh negative id so its identity changes between previews (the pano viewer re-resolves on active-id change). */
const freshVirtualId = () => --virtualIdSeq;

/** Open a staged-import location read-only, "as if" it were active. The location becomes
 *  virtual (negative id; ImportPreview flag) so identity and mutate-guards derive from it. */
export async function openStagedLocation(index: number) {
	const loc = await cmd.storeImportStagedLocation(index);
	// Rust's active_id must not stay pinned to the previous real location.
	fireAndForget(cmd.storeSetActive(null), "stagedOpen:setActive");
	setState({
		activeLocationId: null,
		activeLocation: {
			...loc,
			id: freshVirtualId(),
			flags: loc.flags | LocationFlag.ImportPreview,
		},
		workArea: "location",
	});
	emitEvent("import-markers:changed");
	emitEvent("store:changed");
	emitEvent("active:change", null);
}

/** Open an arbitrary location read-only as a virtual seen-preview: loads its pano without
 *  adding anything to the map. The caller sets LoadAsPanoId so the exact pano resolves. */
export function previewVirtualLocation(loc: Location) {
	fireAndForget(cmd.storeSetActive(null), "virtualPreview:setActive");
	setState({
		activeLocationId: null,
		activeLocation: {
			...loc,
			id: freshVirtualId(),
			flags: loc.flags | LocationFlag.SeenOverlay,
		},
		workArea: "location",
	});
	emitEvent("store:changed");
	emitEvent("active:change", null);
}

/** Drop the active location, keeping Rust's `active_id` and `active:change` in step. */
function clearActiveLocation(): void {
	if (state.activeLocationId == null && state.activeLocation == null) return;
	if (state.activeLocationId != null) fireAndForget(cmd.storeSetActive(null), "clearActive");
	setState({ activeLocationId: null, activeLocation: null });
	emitEvent("active:change", null);
}

/** Materialize a `MaybeLocation`. */
export async function resolveLocation(m: MaybeLocation): Promise<Location | null> {
	return typeof m === "number" ? await cmd.storeGetLocation(m) : m;
}

/** Open a location in the editor (null closes it). With `checkDuplicates`, opening a spot
 *  with 2+ locations within 2m opens the duplicate-resolution panel instead. */
export async function setActiveLocation(target: MaybeLocation | null, checkDuplicates = true) {
	const t = trace("setActive");
	const id = target == null ? null : locId(target);
	if (state.activeLocation && isVirtualLocation(state.activeLocation)) {
		emitEvent("import-markers:changed");
		const wasStaged = isImportPreview(state.activeLocation);
		if (id == null) {
			clearActiveLocation();

			setState({
				workArea: wasStaged ? "import" : state.activePluginId ? "plugin" : "overview",
			});
			emitEvent("store:changed");
			t.end();
			return;
		}
	}
	setState({ activeLocationId: id });
	fireAndForget(cmd.storeSetActive(id), "setActive");
	if (id) {
		const loc = await resolveLocation(target!);
		t.step("ipc");
		if (checkDuplicates && loc) {
			const nearby = await cmd.storeFindNearby(loc.lat, loc.lng, 2.0);
			if (nearby.length >= 2) {
				setState({ duplicateLocations: nearby, workArea: "duplicates" });
				clearActiveLocation();
				emitEvent("store:changed");
				t.end({ duplicates: nearby.length });
				return;
			}
		}
		setState({ activeLocation: loc ?? null, workArea: "location" });
		emitEvent("store:changed");
		emitEvent("active:change", state.activeLocationId);
		t.end();
		return;
	}
	clearActiveLocation();
	setState({
		duplicateLocations: [],
		workArea: state.activePluginId ? "plugin" : "overview",
	});
	emitEvent("store:changed");
	t.end();
}

/** Open one location from the duplicate-resolution panel in the editor. */
export function openDuplicateLocation(loc: Location) {
	setState({ activeLocationId: loc.id, activeLocation: loc, workArea: "location" });
	fireAndForget(cmd.storeSetActive(loc.id), "setActive");
	emitEvent("store:changed");
}

/** Drop a location from the duplicate-resolution panel (does not delete it). */
export function removeDuplicate(id: number) {
	setState({ duplicateLocations: state.duplicateLocations.filter((l) => l.id !== id) });
	emitEvent("store:changed");
}

/** Close the duplicate-resolution panel and return to the overview. */
export function closeDuplicates() {
	setState({ duplicateLocations: [] });
	setWorkArea("overview");
}

/** Transition the editor pane, enforcing state invariants:
 *  leaving "location" clears the active location, leaving "plugin" clears the plugin id. */
export function setWorkArea(area: WorkArea) {
	setState({ workArea: area });
	if (area !== "location") clearActiveLocation();
	if (area !== "plugin") setState({ activePluginId: null });
	emitEvent("store:changed");
}

export function toggleProvidersMode() {
	if (state.workArea === "providers") {
		setState({ workArea: "overview" });
	} else {
		setState({ workArea: "providers", activePluginId: null, activeLocationId: null });
	}
	emitEvent("store:changed");
}

export function exitProvidersMode() {
	if (state.workArea === "providers") {
		setState({ workArea: "overview" });
		emitEvent("store:changed");
	}
}

// --- Plugin mode ---

/** Open a plugin's sidebar (switches the editor pane to "plugin"). */
export function setPluginMode(pluginId: string) {
	setState({ activePluginId: pluginId });
	setWorkArea("plugin");
}

/** Close the plugin sidebar and return to the overview. */
export function exitPluginMode() {
	setWorkArea("overview");
}

// --- Tag CRUD ---

/** Get-or-create tags by name. Returns the tag objects for use
 *  in subsequent location updates. Idempotent — existing tags are returned
 *  as-is, new names get auto-generated colors.
 *
 *  Pass `locationIds` to assign the tags in the same mutation. Prefer that over a follow-up
 *  `addTagToLocations`: it is one round trip instead of three, and the tag never renders at
 *  count 0 in between. */
export async function createTags(names: string[], locationIds: number[] = []): Promise<Tag[]> {
	if (names.length === 0) return [];
	await mutate(() => cmd.storeCreateTags(names, locationIds));
	const lower = new Set(names.map((n) => n.toLowerCase()));
	const created = Object.values(state.tags).filter((t) => lower.has(t.name.toLowerCase()));
	emitEvent("tag:add", created);
	return created;
}

/** Rename or recolor tags. If a rename collides with an existing tag name
 *  (case-insensitive), the two tags are merged — all locations are remapped
 *  to the survivor. */
export async function updateTags(updates: Update<TagPatch>[]) {
	if (updates.length === 0) return;
	await mutate(() => cmd.storeUpdateTags(updates));
	emitEvent("tag:update", updates);
	// ONLY resync on color change, everything else is resolved by Rust
	if (
		state.selections.some((s) => {
			const p = s.props;
			return p.type === "Tag" && updates.some((q) => q.id === p.tagId && q.patch.color != null);
		})
	) {
		applySelectionUpdate((sels) => sels);
	}
}

/** Delete tags and strip them from all locations. Undoable (the location
 *  changes are in the undo stack; visibility auto-restores on undo). */
export async function deleteTags(tagIds: number[]) {
	if (tagIds.length === 0) return;
	await mutate(() => cmd.storeDeleteTags(tagIds));
	emitEvent("tag:remove", tagIds);
}

/** Persist a new tag display order. */
export async function reorderTags(orderedIds: number[]) {
	await mutate(() => cmd.storeReorderTags(orderedIds));
}

/** Fetch locations, apply a tag transform, and mutate those that changed.
 *  `transform` returns null to skip a location (no change needed). */
async function modifyTagOnLocations(
	tagId: number,
	locationIds: number[],
	transform: (tags: number[], tagId: number) => number[] | null,
) {
	if (locationIds.length === 0) return;
	const locs = await cmd.storeGetLocationsByIds(locationIds);
	const updates: Update<LocationPatch>[] = [];
	for (const l of locs) {
		const next = transform(l.tags, tagId);
		if (next) updates.push({ id: l.id, patch: { tags: next } });
	}
	if (updates.length === 0) return;
	await mutate(() => cmd.storeUpdateLocations(updates, true));
}

/** Add a tag to locations (skips ones that already have it). Undoable. */
export function addTagToLocations(tagId: number, locationIds: number[]) {
	return modifyTagOnLocations(tagId, locationIds, (tags, id) =>
		tags.includes(id) ? null : [...tags, id],
	);
}

/** Remove a tag from the given locations. Undoable. */
export function removeTagFromLocations(tagId: number, locationIds: number[]) {
	return modifyTagOnLocations(tagId, locationIds, (tags, id) =>
		tags.includes(id) ? tags.filter((t) => t !== id) : null,
	);
}

/** Remove a tag from every location that has it. Undoable. */
export async function removeTagFromAllLocations(tagId: number) {
	if (!state.map) return;
	const allWithTag = await cmd.storeResolveSelection({ type: "Tag", tagId });
	if (allWithTag.length > 0) await removeTagFromLocations(tagId, allWithTag);
}

// --- Undo/redo ---

/** Shared undo/redo handler: call the IPC, clear active if removed. */
async function undoRedo(which: () => Promise<MutationResult>) {
	try {
		const r = await mutate(which);
		if (state.activeLocationId && r.delta.removed.some((e) => e.id === state.activeLocationId))
			setWorkArea("overview");
	} catch (e) {
		log.debug(`[${which.name}] nothing or failed:`, e);
	}
}

/** Undo the last edit. */
export function undo() {
	return undoRedo(cmd.storeUndo);
}
/** Redo the last undone edit. */
export function redo() {
	return undoRedo(cmd.storeRedo);
}

// --- Version control ---

/** Bake overlay, write the commit delta, create a VCS commit. Resets undo stack. */
export async function commitMap(message?: string): Promise<string> {
	if (!state.mapId) throw new Error("No map open");
	const t = trace("commit");
	cancelAutosave();
	await inflightPersist;

	const id = await cmd.storeCommit(state.mapId, message ?? null);
	t.step("commit");
	t.end();
	setState({ canUndo: false, canRedo: false });
	resetCommitDiffCounts();

	// Commit clears the overlay; commit-sensitive selections (e.g. Uncommitted) must
	// re-resolve against the new baseline instead of showing now-committed rows.
	if (state.selections.length > 0) {
		await applySelectionUpdate((s) => s);
	} else {
		emitEvent("store:changed");
	}
	return id;
}

/** Restore the map to a previous commit's state and reopen it. Clears undo/redo. */
export async function checkoutCommit(commitId: string) {
	if (!state.mapId) return;
	await flushSave();
	try {
		await cmd.storeCloseMap();
		await cmd.storeCheckoutCommit(state.mapId, commitId);
		await cmd.storeOpenMap(state.mapId);
		await cmd.storeResetUndo();
		const msg = `Revert to ${commitId.slice(0, 7)}`;
		await cmd.storeCommit(state.mapId, msg);
	} catch (e) {
		log.error("[checkout] restore failed:", e);
		throw e;
	}
	const map = await cmd.storeGetMap(state.mapId);
	setState({
		map,
		locationCount: map?.meta.locationCount ?? 0,
		tags: map?.meta.tags ?? {},
		selections: [],
		selectedLocationIds: SelectedIds.EMPTY,
		activeLocationId: null,
		canUndo: false,
		canRedo: false,
	});

	emitEvent("render:delta", { added: [], updated: [], removed: [], fullReset: true });
	emitEvent("store:changed");
	await invalidateMapList();
}
