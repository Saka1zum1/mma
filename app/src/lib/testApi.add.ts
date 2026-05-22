/* eslint-disable @typescript-eslint/no-explicit-any */
import { setSetting, getSettings } from "@/store/settings.add";
import {
	openMap,
	closeMap,
	addLocations,
	removeLocations,
	updateLocation,
	batchUpdateLocations,
	duplicateLocation,
	patchLocationExtra,
	getCurrentMap,
	getCurrentMapId,
	getSelections,
	getSelectedLocationIds,
	getActiveLocation,
	getDirtyCount,
	getWorkArea,
	flushSave,
	undo,
	redo,
	addSelection,
	removeSelection,
	resetSelections,
	selectIntersection,
	selectUnion,
	selectInverse,
	toggleManualSelection,
	selectEverything,
	selectUntagged,
	selectUnpanned,
	selectPanoIds,
	selectNotPanoIds,
	selectDuplicates,
	selectTag,
	selectPolygon,
	selectFilter,
	composeSelections,
	decomposeChild,
	removeChildFromSelection,
	addTags,
	updateTags,
	deleteTags,
	bulkAddTag,
	reorderTags,
	renameMap,
	renameFolder,
	moveMapToFolder,
	deleteFolder,
	updateMapMeta,
	updateMapExtraFields,
	// bulkImportMaps,
	setActiveLocation,
	beginReview,
	cancelReview,
	reviewNext,
	reviewPrev,
	reviewDelete,
	commitMap,
	checkoutCommit,
	invalidateMapList,
	fetchAllLocations,
	getUndoRedoState,
} from "@/store/useMapStore";
import {
	getSeenEntries,
	getSeenCount,
	clearSeen,
	type SeenEntry,
	type SeenFilter,
} from "@/lib/seen/seen.add";
import { loadSeenPano } from "@/components/editor/location/LocationPreview";
import { cmd, fetchViaFile } from "@/lib/commands";
import type { LocationPatch_Deserialize } from "@/bindings.gen";
import type { Location, Tag, MapMeta } from "@/types";
import { enrichAll, needsEnrichment } from "@/lib/sv/enrich.add";
import { bulkPinToPano } from "@/lib/sv/pinPano.add";
import { validateLocations } from "@/lib/sv/validate";

function buildTestApi() {
	return {
		ready: false as boolean,

		// --- Lifecycle ---
		createMap: (name: string, folder: string | null) => cmd.storeCreateMap(name, folder),
		openMap: (id: string) => openMap(id),
		closeMap: () => closeMap(),
		listMaps: () => cmd.storeListMaps(),
		deleteMap: (id: string) => cmd.storeDeleteMap(id),
		flushSave: () => flushSave(),
		getDirtyCount: () => getDirtyCount(),
		// Placeholder for save-failure injection. Real fault injection needs a Rust-side
		// test command (#[cfg(feature = "e2e")]); the JS path can't intercept Tauri invoke.
		interceptInvoke: (_command: string, _mode: string): void => {
			throw new Error("interceptInvoke not implemented (needs Rust e2e test command)");
		},

		// --- Location CRUD ---
		getCurrentMap,
		getCurrentMapId,
		addLocations: (locs: Location[]) => addLocations(locs),
		removeLocations: (ids: number[]) => removeLocations(new Set(ids)),
		updateLocation: (id: number, patch: Partial<Location>) => updateLocation(id, patch),
		batchUpdateLocations: (updates: { id: number; patch: Partial<Location> }[]) =>
			batchUpdateLocations(updates),
		duplicateLocation: (id: number) => duplicateLocation(id),
		patchLocationExtra: (id: number, extra: Record<string, unknown>, replace?: boolean) =>
			patchLocationExtra(id, extra, replace),
		fetchAllLocations: () => fetchAllLocations(),
		fetchLocation: (id: number) => fetchViaFile<Location>(cmd.storeGetLocationFile(id)),
		getLocationCount: () => cmd.storeLocationCount(),
		findNearby: (lat: number, lng: number, radiusM: number) => cmd.storeFindNearby(lat, lng, radiusM),

		// --- Undo/Redo ---
		undo,
		redo,
		getUndoRedoState,

		// --- Active location & work area ---
		setActiveLocation: (id: number | null, checkDuplicates?: boolean) =>
			setActiveLocation(id, checkDuplicates),
		getActiveLocation,
		getWorkArea,

		// --- Settings ---
		setSetting: (key: string, value: unknown) => setSetting(key as any, value as any),
		getSettings: () => ({ ...getSettings() }),

		// --- Review mode ---
		beginReview: (ids: number[]) => beginReview(ids),
		cancelReview,
		reviewNext,
		reviewPrev,
		reviewDelete,

		// --- Selections ---
		getSelections: () =>
			getSelections().map((s) => ({
				key: s.key,
				color: s.color,
				locationCount: s.count ?? 0,
				props: s.props,
			})),
		getSelectedLocationIds: () => [...getSelectedLocationIds()],
		addSelection: (props: any) => addSelection(props),
		removeSelection: (key: string) => removeSelection(key),
		resetSelections: () => resetSelections(),
		selectIntersection: (keys?: string[]) => selectIntersection(keys ?? null),
		selectUnion: (keys?: string[]) => selectUnion(keys ?? null),
		selectInverse: (keys?: string[]) => selectInverse(keys ?? null),
		toggleManualSelection: (id: number) => toggleManualSelection(id),
		selectEverything,
		selectUntagged,
		selectUnpanned,
		selectPanoIds,
		selectNotPanoIds,
		selectDuplicates: (distance: number) => selectDuplicates(distance),
		selectTag: (tagId: number) => selectTag(tagId),
		selectPolygon: (polygon: any, includeInformational?: boolean) =>
			selectPolygon(polygon, includeInformational),
		selectFilter: (field: string, op: string, value: unknown, value2?: unknown) =>
			selectFilter(field, op as any, value, value2),
		composeSelections: (
			dragKey: string,
			dropKey: string,
			mode: string,
			dragParent: string | null,
			dropParent: string | null,
		) =>
			composeSelections(dragKey, dropKey, mode as "intersection" | "union", dragParent, dropParent),
		decomposeChild: (parentKey: string, childKey: string) => decomposeChild(parentKey, childKey),
		removeChildFromSelection: (parentKey: string, childKey: string) =>
			removeChildFromSelection(parentKey, childKey),

		// --- Tags ---
		addTag: (tag: Tag) => addTags([tag]),
		updateTag: (id: number, patch: Partial<Tag>) => updateTags([{ id, patch }]),
		deleteTag: (id: number) => deleteTags([id]),
		bulkAddTag: (tagId: number) => bulkAddTag(tagId),
		reorderTags: (ids: number[]) => reorderTags(ids),
		resolveTagNames: (names: string[]) => cmd.storeResolveTagNames(names),

		// --- Map management ---
		renameMap: (id: string, name: string) => renameMap(id, name),
		renameFolder: (from: string, to: string) => renameFolder(from, to),
		moveMapToFolder: (mapId: string, folder: string | null) => moveMapToFolder(mapId, folder),
		deleteFolder: (name: string) => deleteFolder(name),
		updateMapMeta: (patch: Partial<MapMeta>) => updateMapMeta(patch),
		updateMapExtraFields: (fields: Record<string, any>) => updateMapExtraFields(fields),
		// bulkImportMaps: (entries: any[]) => bulkImportMaps(entries),

		// --- Version control ---
		commitMap: (message?: string) => commitMap(message),
		checkoutCommit: (commitId: string) => checkoutCommit(commitId),
		listCommits: (mapId: string) => cmd.storeListCommits(mapId),

		// --- Seen ---
		getSeenEntries: (limit?: number, offset?: number, filter?: SeenFilter) =>
			getSeenEntries(limit, offset, filter),
		getSeenCount: (filter?: SeenFilter) => getSeenCount(filter),
		clearSeen: () => clearSeen(),
		loadSeenPano: (entry: SeenEntry) => loadSeenPano(entry),

		// --- Bulk operations ---
		enrichAll: (opts?: any) => enrichAll(opts),
		bulkPinToPano: (opts?: any) => bulkPinToPano(opts),
		validateLocations: (locs: Location[], opts?: any) => validateLocations(locs, opts),
		needsEnrichment: (loc: Pick<Location, "extra">) => needsEnrichment(loc as Location),

		// --- Rust bulk import ---
		bulkImportPreview: (path: string) => cmd.bulkImportPreview(path),
		bulkImportConfirm: (path: string, selectedIndices: number[]) =>
			cmd.bulkImportConfirm(path, selectedIndices),
		invalidateMapList: () => invalidateMapList(),

		// --- Import/export ---
		exportJson: (opts: {
			exportZoom: boolean;
			exportUnpanned: boolean;
			exportExtras: boolean;
			scope: number[] | null;
			mapName: string;
			tagsJson: string;
			extraFieldsJson: string | null;
		}) => cmd.storeExportJson(opts),
		exportCsv: (scope: number[] | null) => cmd.storeExportCsv(scope),
		exportGeoJson: (scope: number[] | null, tagsJson: string) =>
			cmd.storeExportGeojson(scope, tagsJson),
		writeTempFile: (name: string, content: string) => cmd.writeTempFile(name, content),
		importPreview: (path: string) => cmd.storeImportPreview(path),
		importFile: (droppedFields: string[]) => cmd.storeImportFile(droppedFields),
		importPaste: (text: string) => cmd.storeImportPaste(text),

		// --- Low-level updates ---
		updateLocationNoUndo: (id: number, patch: Partial<Location>) => {
			const p: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(patch)) {
				if (k !== "id") p[k] = v;
			}
			return cmd.storeUpdateLocations([[id, p as LocationPatch_Deserialize]], false);
		},

		// --- Tag counts ---
		getTagCounts: () => cmd.storeTagCounts(),

		// --- Selection resolution ---
		resolveSelection: (props: any) => cmd.storeResolveSelection(props),
		syncSelections: async () => {
			const sels = getSelections().map((s) => ({ props: s.props, color: s.color }));
			if (sels.length === 0) return { ids: [] as number[], counts: [] };
			await cmd.storeSyncSelections(sels);
			const ids = await cmd.storeGetSelectedIdsList();
			return { ids };
		},

		// TODO: invoke interception for failure injection requires a Rust-side
		// test command behind #[cfg(feature = "e2e")] -- Tauri freezes
		// __TAURI_INTERNALS__ so JS-side patching is not possible.
	};
}

export type TestAPI = ReturnType<typeof buildTestApi>;

export function exposeTestApi() {
	(window as any).__TEST_API__ = buildTestApi();
}
