/// <reference types="google.maps" />
/// <reference path="./google-maps.d.ts" />

import * as _tauri_apps_api_window from '@tauri-apps/api/window';
import * as _tauri_apps_api_webview from '@tauri-apps/api/webview';
import * as __TAURI_EVENT from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Command } from '@tauri-apps/plugin-shell';
import { open, save } from '@tauri-apps/plugin-dialog';
import * as react from 'react';
import { ComponentType, SetStateAction, ComponentPropsWithRef, ComponentProps, ReactNode, CSSProperties, ElementType, ReactElement } from 'react';
import { Dialog as Dialog$1 } from '@base-ui-components/react/dialog';
import { Layer, PickingInfo } from '@deck.gl/core';
import * as maplibregl from 'maplibre-gl';

/** Commands */
declare const commands$1: {
    /**
     *  Write arbitrary text content to a named temp file (`mma_{name}`). Returns the path.
     *  Used by JS to pass large payloads via file instead of IPC serialization.
     */
    writeTempFile: (name: string, content: string) => Promise<string>;
    /**  Read a file from disk as UTF-8 text. Used by JS to read temp files and plugin sources. */
    readFile: (path: string) => Promise<string>;
    appReady: () => Promise<number>;
    /**
     *  Reveal with the native open animation: a true first show() (DWM plays its pop-in),
     *  then maximize back-to-back while the shell is still blank. The show must come first:
     *  maximize on a hidden window reveals it without setting tao's visible flag, and the
     *  window gets re-hidden a frame later.
     */
    revealWindow: (maximized: boolean) => Promise<void>;
    /**  Return the platform-specific app data directory path (e.g., `%LOCALAPPDATA%/app.map-making.local`). */
    getAppDataDir: () => Promise<string>;
    /**  Report where map data is currently stored. */
    getDataLocation: () => Promise<DataLocation>;
    /**
     *  Set (`Some`) or clear (`None`) the data-folder override. Takes effect after relaunch.
     *  Does not move existing data -- the caller warns the user.
     */
    setDataLocation: (path: string | null) => Promise<null>;
    /**  Open the app data directory in the OS file explorer. */
    openDataFolder: () => Promise<null>;
    /**  Open the current log file in the OS default handler. */
    openLogFile: () => Promise<null>;
    /**
     *  First caller per app run wins the silent update pass. Every webview boots the
     *  plugin loader, so without this a restored editor window plus the map list run
     *  two full passes -- double registry fetches, double downloads, and interleaved
     *  install progress for the same plugin.
     */
    claimPluginUpdatePass: () => Promise<boolean>;
    /**  Scan the `plugins/` directory under app data and return manifests for all installed plugins. */
    listUserPlugins: () => Promise<PluginManifest[]>;
    /**
     *  Download a plugin from the GitHub plugin repository and install it to the local plugins directory.
     *  Fetches `manifest.json` and the main JS file specified in the manifest.
     */
    installPlugin: (id: string) => Promise<PluginManifest>;
    /**  Remove a plugin by deleting its directory from the local plugins folder. */
    uninstallPlugin: (id: string) => Promise<null>;
    /**
     *  Download a plugin's sidecar bundle from GitHub Releases and extract it under
     *  `{appData}/plugins/{plugin_id}/sidecar/`. Emits `sidecar-install-progress`.
     */
    sidecarInstall: (pluginId: string, name: string, version: string) => Promise<null>;
    /**  Installed sidecar version for a plugin (from `sidecar/version.txt`), or `None`. */
    sidecarInstalledVersion: (pluginId: string) => Promise<string | null>;
    /**
     *  Run one unit of work on a plugin's sidecar. Commands the manifest lists under
     *  `serve` go to the plugin's resident process; the rest get a one-shot child.
     *  Streams `sidecar-line` (one JSON object per unit) and `sidecar-log` (stderr),
     *  then exactly one `sidecar-done`, all keyed by the returned request id.
     */
    sidecarRequest: (pluginId: string, command: string, payload: string | null) => Promise<number>;
    /**
     *  Stop everything a plugin has running. Called when the plugin is disabled or
     *  uninstalled, so a resident process never outlives the plugin that wanted it.
     */
    sidecarStop: (pluginId: string) => Promise<null>;
    /**
     *  Stop every plugin's sidecar processes. Used when the editor tears all plugins
     *  down at once (map close), where nothing should still be running afterwards.
     */
    sidecarStopAll: () => Promise<null>;
    /**
     *  Kill the process behind a one-shot request (no-op if it already finished).
     *  Resident-served requests have no process of their own, so this does not
     *  interrupt them -- the caller simply stops listening.
     */
    sidecarCancel: (reqId: number) => Promise<null>;
    checkBorderFile: (level: string) => Promise<boolean>;
    downloadBorderFile: (level: string) => Promise<null>;
    borderLookup: (lat: number, lng: number, level: string) => Promise<PolygonGeometry | null>;
    /**
     *  Classify each `(lat, lng)` to the name of its containing feature at `level`
     *  (subdivision names for "adm1"). `None` for points outside every feature.
     *  Same bbox-prefiltered parallel scan as `tally_countries`, but per-point names.
     */
    borderClassify: (level: string, points: ([number, number])[]) => Promise<(string | null)[]>;
    /**
     *  Finds the nearest city/country for a coordinate. O(log n) k-d tree lookup.
     *  Always returns `Some` -- the GeoNames dataset covers every landmass.
     */
    reverseGeocode: (lat: number, lng: number) => Promise<GeoResult | null>;
    discordPresenceSet: (activity: PresenceActivity) => Promise<null>;
    discordPresenceClear: () => Promise<null>;
    /**
     *  Start (or re-key) the remote API server. Idempotent: a running server just
     *  picks up the new key. Returns the base URL.
     */
    remoteApiStart: (key: string) => Promise<string>;
    remoteApiStop: () => Promise<null>;
    /**
     *  Webview -> HTTP reply path: resolves the parked request for `id`.
     *  `payload` is JSON text, not a typed value -- specta cannot export the
     *  recursive `serde_json::Value` type (stack overflow at bindings export).
     */
    remoteApiRespond: (id: number, ok: boolean, payload: string) => Promise<void>;
    /**
     *  Load a map's Arrow data from disk, rebuild all indexes, and return initial state
     *  (tag counts, undo/redo availability). Must be called before any other store commands.
     */
    storeOpenMap: (mapId: string) => Promise<StoreStatus>;
    /**
     *  Close the current map: bake overlay, flush Arrow + tags + edit history to disk, then
     *  release all in-memory state (batch, mmap, indexes, selections, undo stacks).
     */
    storeCloseMap: () => Promise<null>;
    /**  Autosave uncommitted changes to the delta sidecar. No-op when nothing changed. */
    storeSaveDirty: () => Promise<SaveResult>;
    /**  Copy locations already stored in this map into another map. */
    storeCopyLocationsToMap: (targetMapId: string, selector: Selector) => Promise<CopyToMapResult>;
    /**
     *  Copy caller-supplied location data into another map. Tag ids are read against this
     *  map's tag table, so the values may differ from any row it holds -- that is how the
     *  editor sends the pano you are currently looking at rather than the one on disk.
     */
    storeAddLocationsToMap: (targetMapId: string, locations: Location[]) => Promise<CopyToMapResult>;
    /**  Lightweight status query: location count, version, and dirty flag. */
    storeGetSummary: () => Promise<SummaryResult>;
    /**  Return metadata for every map in the database. */
    storeListMaps: () => Promise<MapMeta[]>;
    /**  Fetch a single map's metadata by ID. Returns `None` if not found. */
    storeGetMap: (id: string) => Promise<MapData | null>;
    /**
     *  Create a new empty map with default settings. Returns the full metadata
     *  (including the generated UUID) so the frontend can navigate to it immediately.
     */
    storeCreateMap: (name: string, folder: string | null) => Promise<MapData>;
    /**  Delete a map and all its data: database rows and files on disk. */
    storeDeleteMap: (id: string) => Promise<null>;
    /**  Apply a partial update to a map's metadata; `None` fields are left unchanged. */
    storeUpdateMapMeta: (id: string, patch: MapMetaPatch_Deserialize) => Promise<null>;
    /**
     *  Update `last_opened_at` to the current timestamp. Used to sort the map
     *  list by recency in the dashboard.
     */
    storeTouchMapOpened: (mapId: string) => Promise<null>;
    /**  Rename a folder across all maps that reference it. */
    storeRenameFolder: (from: string, to: string) => Promise<null>;
    /**  Delete a folder by setting all its maps' folder to `NULL` (moves them to root). */
    storeDeleteFolder: (name: string) => Promise<null>;
    /**  List all user-created tables with their row counts. Excludes SQLite internals. */
    storeDbTableInfo: () => Promise<DbTableInfo[]>;
    /**
     *  Add new locations. IDs are allocated server-side (monotonic). Records an undo entry
     *  and clears the redo stack.
     */
    storeAddLocations: (locations: Location[]) => Promise<MutationResult>;
    /**  Remove locations by ID. Snapshots the full location data for undo before deleting. */
    storeRemoveLocations: (ids: number[]) => Promise<MutationResult>;
    /**
     *  Apply partial patches to existing locations. `record_undo` defaults to true;
     *  set to false for ephemeral updates (e.g., plugin-driven batch modifications
     *  that manage their own undo).
     */
    storeUpdateLocations: (updates: Update<LocationPatch_Deserialize>[], recordUndo: boolean | null) => Promise<MutationResult>;
    /**
     *  Set (or clear) the active location. Fire-and-forget from JS; no re-render triggered.
     *  JS patches the cell buffer synchronously to hide/show the active marker.
     */
    storeSetActive: (id: number | null) => Promise<null>;
    /**
     *  Set the default marker color used by the render delta path. Fire-and-forget from JS;
     *  the JS side recolors its cell buffers in place (no full rebuild).
     */
    storeSetMarkerColor: (color: [number, number, number]) => Promise<null>;
    /**
     *  Ids of every location the selector resolves to. Ranked roots emit rank order;
     *  every other selector answers ascending.
     */
    storeResolve: (selector: Selector) => Promise<number[]>;
    /**  How many locations the selector resolves to. Counts rows, never materializes them. */
    storeCount: (selector: Selector) => Promise<number>;
    /**  `n` ids drawn uniformly at random from the selected set, without replacement. */
    storeSample: (selector: Selector, n: number) => Promise<number[]>;
    /**
     *  An evenly spaced subset: exactly one of `target_count` (thin to N, maximizing
     *  spacing) or `min_distance_m` (keep as many as fit at that spacing).
     */
    storeSpaced: (selector: Selector, targetCount: number | null, minDistanceM: number | null) => Promise<SpacedPickResult>;
    /**  Group by a derived key, returning `{ key, ids, bin }` per group. */
    storeGroupBy: (selector: Selector, field: string, key: KeySpec) => Promise<PartitionBucket[]>;
    /**  Group by a derived key, returning counts only -- no member ids on the wire. */
    storeCountBy: (selector: Selector, field: string, key: KeySpec) => Promise<[string, number][]>;
    /**  Distinct values of `field` across the selected set, sorted. */
    storeValues: (selector: Selector, field: string) => Promise<string[]>;
    /**  How many rows carry each top-level `extra` key, key-sorted. */
    storeCoverage: (selector: Selector) => Promise<[string, number][]>;
    /**  Bounding box `[west, south, east, north]`, or `None` when the set is empty. */
    storeBounds: (selector: Selector) => Promise<[number, number, number, number] | null>;
    /**
     *  Full rows. The last resort -- prefer a projection. Every row is materialized in
     *  webview memory, so an `Everything` call costs O(map). Large answers are staged to a file
     *  rather than pushed through the IPC channel.
     */
    storeCollect: (selector: Selector) => Promise<Rows>;
    storeColumns: (selector: Selector, fields: string[]) => Promise<Columns>;
    storeApplyFieldOp: (selector: Selector, op: FieldOp, recordUndo: boolean | null) => Promise<FieldOpResult>;
    /**  The parse error for `src`, or nothing when it parses. For the dialog's live check. */
    fieldExprError: (src: string) => Promise<ExprError | null>;
    /**
     *  Start a procedure run. Returns immediately with the run id; the work continues
     *  on a background thread and reports through `procedure-progress`.
     */
    procedureRun: (providers: ProviderDecl[], force: boolean) => Promise<number>;
    /**  Stop a run before its next batch. Already-applied patches stay applied. */
    procedureCancel: (runId: number) => Promise<null>;
    /**
     *  Ask a procedure a read-only question. `input` and the result are whatever the
     *  module's `query` export agrees with its caller; the engine only carries the bytes.
     *  `cancel` is a token the caller may later hand to `procedure_query_cancel`.
     */
    procedureQuery: (entry: string, input: string, config: string | null, cancel: number | null) => Promise<string>;
    /**
     *  Decline every request a query still has to make. The query then answers whatever
     *  its module answers for declined requests, which the caller discards.
     */
    procedureQueryCancel: (cancel: number) => Promise<null>;
    /**  What the procedure engine is working on right now. */
    procedureActivity: () => Promise<ProcedureActivity>;
    /**
     *  Count locations by country (offline point-in-polygon). Returns unsorted (ISO-A2, count) pairs.
     *  `level` selects border precision, falling back to "light" if unavailable.
     */
    storeCountryDistribution: (selector: Selector, level: string) => Promise<[string, number][]>;
    /**  Find all locations within `radius_m` metres of (`lat`, `lng`). */
    storeFindNearby: (lat: number, lng: number, radiusM: number) => Promise<Location[]>;
    /**
     *  For each input point, whether any existing location lies within `radius_m` metres.
     *  Bulk form so callers probing many coordinates (e.g. the map generator skipping
     *  already-covered spots) pay one IPC round-trip, not one per point.
     */
    storeNearAny: (lats: number[], lngs: number[], radiusM: number) => Promise<boolean[]>;
    /**
     *  The points of a honeycomb about `spacingM` metres apart that fall inside the polygon,
     *  one entry per row of points.
     */
    honeycombPoints: (polygon: PolygonGeometry, spacingM: number) => Promise<HoneycombRun[]>;
    /**
     *  Up to `count` points drawn uniformly at random inside the polygon, as `[lng, lat]`
     *  pairs. Fewer come back when the polygon fills little of its bounding box.
     */
    polygonRandomPoints: (polygon: PolygonGeometry, count: number) => Promise<[number, number][]>;
    /**
     *  Points covering the polygon with no two closer than `spacingM` metres and no gap
     *  wider than about twice that, in random order.
     */
    polygonPoissonPoints: (polygon: PolygonGeometry, spacingM: number) => Promise<[number, number][]>;
    /**  Whether each of the points sits inside the polygon. */
    polygonContainsPoints: (polygon: PolygonGeometry, lats: number[], lngs: number[]) => Promise<boolean[]>;
    /**
     *  Bounding box `[west, south, east, north]` of the polygon itself, or `null` when it
     *  has no vertices. `west > east` means the box crosses the antimeridian.
     */
    polygonBounds: (polygon: PolygonGeometry) => Promise<[number, number, number, number] | null>;
    /**
     *  Create tags by name. Deduplicates case-insensitively: if a tag with the same name
     *  already exists, it is made visible instead of creating a duplicate.
     *
     *  `location_ids` assigns every resulting tag to those locations in the same mutation.
     *  Doing both here is not a convenience: creating and assigning as two commands leaves the
     *  tag visible at count 0 for the round trip in between, and makes the caller fetch every
     *  location into JS just to append an id Rust already has.
     */
    storeCreateTags: (names: string[], selector: Selector) => Promise<MutationResult>;
    /**
     *  Rename and/or recolor tags in one batch. Renaming onto an existing name (case-insensitive)
     *  merges the two tags.
     */
    storeUpdateTags: (updates: Update<TagPatch>[]) => Promise<MutationResult>;
    /**
     *  Strip tags from all locations. Tags stay in `store.tags` with count=0 /
     *  visible=false so undo can revive them. Returns MutationResult with `tags`.
     */
    storeDeleteTags: (tagIds: number[]) => Promise<MutationResult>;
    /**
     *  Persist tag ordering. `ordered_ids` specifies the desired order; each tag's
     *  `order` field is set to its index in the list.
     */
    storeReorderTags: (orderedIds: number[]) => Promise<MutationResult>;
    /**  Pop the undo stack and reverse the last edit. Pushes the entry onto the redo stack. */
    storeUndo: () => Promise<MutationResult>;
    /**  Pop the redo stack and replay the edit forward. Pushes the entry back onto undo. */
    storeRedo: () => Promise<MutationResult>;
    /**  Clear both undo and redo stacks. Called after a commit to start fresh. */
    storeResetUndo: () => Promise<null>;
    /**  The uncommitted changes since the last commit -- the same changeset `store_commit` will record. */
    storeCommitDiff: () => Promise<[number, number, number]>;
    /**
     *  Replace all selections, resolve bitmasks against current data, and write a binary
     *  patch file for JS to apply to the render overlay. Returns per-selection counts.
     */
    storeSyncSelections: (sels: SelectionInput[]) => Promise<SelectionSync>;
    /**
     *  Transitive spatial duplicate groups (connected components, size >= 2) within `distance`
     *  metres. Read-only; used to preview a merge. Returns groups of location IDs.
     */
    storeDuplicateGroups: (distance: number) => Promise<number[][]>;
    /**
     *  Merge each duplicate group within `distance` metres into one survivor location, unioning
     *  tags and extra fields. `score` is the map's duplicate preference expression; blank or
     *  absent uses the built-in ranking. One undoable edit.
     */
    storeMergeDuplicates: (distance: number, score: string | null) => Promise<MutationResult>;
    /**
     *  Thin duplicates among `ids` within `distance` metres, keeping the best location per
     *  cluster. Informational locations are never pruned. One undoable edit.
     */
    storePruneDuplicates: (selector: Selector, distance: number, score: string | null) => Promise<MutationResult>;
    /**
     *  Full render rebuild: single-pass over all alive locations, writes binary to a temp file.
     *  Returns the file path for JS to fetch via `mma-buf://`. Only called on map open or full reset.
     */
    storeFillRenderFile: (req: RenderRequest) => Promise<string>;
    /**
     *  Resolve a deck.gl pick result (cell key + index within cell) to a location ID.
     *  Called on marker click to map the GPU pick back to a logical location.
     */
    storeResolvePick: (cell: string, cellIndex: number) => Promise<number | null>;
    /**
     *  Parse a file (JSON or ZIP of JSONs) and return previews without persisting.
     *  Results are cached in `CACHED_PARSE` so `bulk_import_confirm` can skip re-parsing.
     *  ZIP files have each `.json` entry parsed in parallel via rayon.
     */
    bulkImportPreview: (path: string) => Promise<ImportPreviewEntry[]>;
    /**  Import the selected maps from a previously previewed file. Emits `bulk-import-progress` per map. */
    bulkImportConfirm: (path: string, selectedIndices: number[]) => Promise<ImportedMapInfo[]>;
    /**
     *  Drop the cached parse from `bulk_import_preview` when the user dismisses the
     *  import dialog without confirming, instead of holding it until the next preview.
     */
    bulkImportCancel: () => Promise<null>;
    /**
     *  Parse a file and return field-level statistics + preview positions for the editor
     *  import sidebar. Caches the parse result for `store_import_file` to consume on commit.
     */
    storeImportPreview: (path: string) => Promise<EditorImportPreview>;
    /**
     *  Parse pasted text (JSON or CSV) and stage it for preview, exactly like
     *  `store_import_preview` does for a file. Caches the parse for `store_import_file`.
     */
    storeImportPastePreview: (text: string) => Promise<EditorImportPreview>;
    /**
     *  Fetch one staged (not yet imported) location by its preview index, for read-only
     *  preview in the editor. Indexes follow the preview positions order.
     */
    storeImportStagedLocation: (index: number) => Promise<Location>;
    /**
     *  Commit a previously previewed editor import, optionally dropping fields and/or
     *  applying a bulk tag to every imported location. Consumes the cached parse from
     *  `store_import_preview`/`store_import_paste_preview`. Fields in `dropped_fields`
     *  (e.g. `"heading"`, `"extra.countryCode"`) are zeroed/removed.
     */
    storeImportFile: (droppedFields: string[], tagName: string | null) => Promise<EditorImportResult>;
    /**  The location a pasted Maps URL names, short links resolved. */
    parseMapsUrl: (input: string) => Promise<ParsedLocation | null>;
    /**  Export locations as a `{name, customCoordinates}` JSON file, including tags and field defs. */
    storeExportJson: (opts: ExportOpts) => Promise<string>;
    /**  Export locations as a minimal lat/lng CSV file. */
    storeExportCsv: (selector: Selector) => Promise<string>;
    /**
     *  Export locations as a GeoJSON FeatureCollection of Point features.
     *  Each feature carries its tag names in `properties.tags`.
     */
    storeExportGeojson: (selector: Selector, tagsJson: string) => Promise<string>;
    /**
     *  Copy a temp export file to the destination chosen via the native save dialog,
     *  then remove the temp source. `dest_path` comes from the frontend save dialog.
     */
    storeSaveExportFile: (srcPath: string, destPath: string) => Promise<null>;
    /**  Export every map in the database as a ZIP of JSON files. Duplicate map names get a numeric suffix. */
    storeExportBulkZip: () => Promise<string>;
    /**
     *  Create a temp session dir for binary uploads from the frontend. Files are
     *  written into it via `mma-buf://` POST, then packaged by [`store_upload_finish`].
     */
    storeUploadBegin: () => Promise<string>;
    /**
     *  Package an upload session and remove its dir: a single file is moved out
     *  as-is, multiple are packed into a Stored ZIP (entries like JPEG/PNG are
     *  already compressed). Returns a temp path for [`store_save_export_file`].
     */
    storeUploadFinish: (sessionDir: string) => Promise<string>;
    /**  Remove an abandoned upload session dir (e.g. cancelled operation). */
    storeUploadAbort: (sessionDir: string) => Promise<null>;
    /**
     *  Delete all rows from a table. Returns the number of deleted rows.
     *  Used in the debug panel for cache/history cleanup.
     */
    storeDbClearTable: (table: string) => Promise<number>;
    /**
     *  Compute aggregate database statistics (map/location/tag/commit counts,
     *  database file size, journal mode). Tag count is summed across all maps
     *  by parsing each map's tags JSON column.
     */
    storeDbStats: () => Promise<DbStats>;
    /**  Record a panorama visit. Oldest entries beyond `MAX_SEEN` are evicted. */
    storeSeenWrite: (entry: SeenWriteEntry) => Promise<null>;
    /**  Returns a page of seen entries, newest first, with optional filtering. */
    storeSeenList: (limit: number, offset: number, filter: SeenFilter | null, thumbnails: boolean) => Promise<SeenEntry[]>;
    /**  Returns the total number of seen entries matching the filter (for pagination). */
    storeSeenCount: (filter: SeenFilter | null) => Promise<number>;
    /**
     *  Returns all distinct country codes present in the seen table, sorted alphabetically.
     *  Used to populate the country filter dropdown.
     */
    storeSeenCountries: () => Promise<string[]>;
    /**
     *  Returns all distinct maps that have seen entries, with resolved display names.
     *  Returns maps that have seen entries. Only includes maps that still exist.
     */
    storeSeenMaps: () => Promise<SeenMapInfo[]>;
    /**  Deletes all seen history entries. */
    storeSeenClear: () => Promise<null>;
    storeReviewCreate: (session: ReviewCreate) => Promise<ReviewSession>;
    storeReviewGet: (mapId: string, sourceKey: string) => Promise<ReviewSession | null>;
    storeReviewList: (mapId: string, status: string | null) => Promise<ReviewSession[]>;
    storeReviewUpdate: (update: ReviewUpdate) => Promise<null>;
    storeReviewDelete: (id: string) => Promise<null>;
    storeListSavedSelections: () => Promise<SavedSelectionInfo[]>;
    storeGetSavedSelections: (ids: string[]) => Promise<SavedSelection[]>;
    storeSaveSelection: (name: string, selector: Selector, tagNames: { [key in number]: string; }, color: [number, number, number]) => Promise<SavedSelection>;
    storeDeleteSavedSelection: (id: string) => Promise<null>;
    storeImportLegacySavedSelections: (json: string) => Promise<number>;
    remoteMappingGet: (provider: string, mapId: string) => Promise<RemoteMappingRow[]>;
    remoteMappingUpsert: (provider: string, mapId: string, rows: RemoteMappingRow[]) => Promise<null>;
    remoteMappingDelete: (provider: string, mapId: string, localIds: number[]) => Promise<null>;
    remoteMappingClear: (provider: string, mapId: string) => Promise<null>;
    /**
     *  Reconcile a linked, open map against its remote. Snapshots local state under the store lock,
     *  drops the lock, then does all network + persistence off the async thread.
     */
    syncReconcile: (provider: string, mapId: string, remoteMapId: string, apiKey: string | null, firstSync: FirstSyncMode | null, resolutions: ([string, ResolutionSide])[] | null) => Promise<SyncReconcileResult>;
    /**
     *  Open the GeoGuessr sign-in window and wait for a `_ncfa` cookie to appear.
     *  Returns the signed-in nickname.
     */
    geoguessrLogin: () => Promise<string>;
    /**  The signed-in user, or `None` when there is no session (or it was rejected). */
    geoguessrMe: () => Promise<GgUser | null>;
    geoguessrLogout: () => Promise<null>;
    /**  Local-only check: is a token stored? Says nothing about its validity. */
    geoguessrHasSession: () => Promise<boolean>;
    /**  Local-only check: is a key stored? Says nothing about its validity. */
    mapMakingHasKey: () => Promise<boolean>;
    /**  Persist an API key in the OS keyring (replaces any previous key). */
    mapMakingSetKey: (apiKey: string) => Promise<null>;
    /**  Drop the stored API key. */
    mapMakingClearKey: () => Promise<null>;
    /**  Validate `api_key` (or the stored one when `None`) against `/api/user`. */
    mapMakingGetUser: (apiKey: string | null) => Promise<MmUser>;
    /**  Maps the stored key's owner can link to. Archived remotes are omitted. */
    mapMakingListMaps: () => Promise<MmRemoteMap[]>;
    /**
     *  Commit the map's uncommitted changes and return the new commit id.
     *  `message` None auto-generates a `+a -r ~m` summary.
     */
    storeCommit: (mapId: string, message: string | null) => Promise<string>;
    /**  List all commits for a map, newest first. */
    storeListCommits: (mapId: string) => Promise<CommitInfo[]>;
    /**
     *  Restore a map to the state captured by a previous commit. The caller must reopen
     *  the map afterwards (undo/redo is cleared).
     */
    storeCheckoutCommit: (mapId: string, commitId: string) => Promise<null>;
    /**  Read a single commit's delta (created/removed locations) for the diff viewer. */
    storeGetCommitDelta: (mapId: string, commitId: string) => Promise<CommitDelta>;
    /**
     *  Generate locations from a Vali map definition (JSON/JSONC text). Missing country
     *  data is auto-downloaded like the Vali CLI. Returns the generated locations.
     */
    valiGenerate: (definition: string) => Promise<ValiLocation[]>;
    /**  Download Vali coverage data. `country` = code/continent alias/None for all. */
    valiDownload: (country: string | null, full: boolean, updates: boolean) => Promise<null>;
    /**
     *  Download exactly the countries `vali_data_status` reports as behind. No-op when nothing
     *  is stale, so the caller can fire it without checking first.
     */
    valiDownloadStale: () => Promise<null>;
    /**  Cancel an in-flight vali generate or download. */
    valiCancel: () => Promise<void>;
    /**  Subdivision weights for a country (JSON text, same shape as `vali subdivisions`). */
    valiSubdivisions: (country: string) => Promise<string>;
    /**
     *  Countries whose downloaded coverage data is older than the remote copy. Object metadata
     *  only -- nothing is fetched. Errors while offline, which callers should read as "unknown"
     *  rather than "up to date".
     */
    valiDataStatus: () => Promise<ValiCountryStatus[]>;
    /**
     *  Country codes Vali has coverage data for, i.e. the set `vali download` iterates
     *  when no country is given. Display names are the caller's job.
     */
    valiCountries: () => Promise<string[]>;
    /**
     *  Look for an update at `endpoint` (a release's `latest.json`). `None` means the announced
     *  version is not newer than the running one, which is the plugin's own comparison.
     */
    updateCheck: (endpoint: string) => Promise<UpdateAvailable | null>;
    /**
     *  Download and install whatever the last [`update_check`] found. The installer replaces the
     *  running app, so nothing after this is guaranteed to run -- the caller saves its state first.
     */
    updateInstall: () => Promise<null>;
};
/** Events */
declare const events: {
    bulkExportProgress: ((target: _tauri_apps_api_webview.Webview | _tauri_apps_api_window.Window) => {
        listen: (cb: __TAURI_EVENT.EventCallback<ExportProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<ExportProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: ExportProgress) => Promise<void>;
    }) & {
        listen: (cb: __TAURI_EVENT.EventCallback<ExportProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<ExportProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: ExportProgress) => Promise<void>;
    };
    bulkImportProgress: ((target: _tauri_apps_api_webview.Webview | _tauri_apps_api_window.Window) => {
        listen: (cb: __TAURI_EVENT.EventCallback<ImportProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<ImportProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: ImportProgress) => Promise<void>;
    }) & {
        listen: (cb: __TAURI_EVENT.EventCallback<ImportProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<ImportProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: ImportProgress) => Promise<void>;
    };
    procedureProgress: ((target: _tauri_apps_api_webview.Webview | _tauri_apps_api_window.Window) => {
        listen: (cb: __TAURI_EVENT.EventCallback<ProcedureProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<ProcedureProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: ProcedureProgress) => Promise<void>;
    }) & {
        listen: (cb: __TAURI_EVENT.EventCallback<ProcedureProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<ProcedureProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: ProcedureProgress) => Promise<void>;
    };
    procedureResult: ((target: _tauri_apps_api_webview.Webview | _tauri_apps_api_window.Window) => {
        listen: (cb: __TAURI_EVENT.EventCallback<ProcedureResult>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<ProcedureResult>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: ProcedureResult) => Promise<void>;
    }) & {
        listen: (cb: __TAURI_EVENT.EventCallback<ProcedureResult>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<ProcedureResult>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: ProcedureResult) => Promise<void>;
    };
    sidecarDone: ((target: _tauri_apps_api_webview.Webview | _tauri_apps_api_window.Window) => {
        listen: (cb: __TAURI_EVENT.EventCallback<SidecarDone>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<SidecarDone>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: SidecarDone) => Promise<void>;
    }) & {
        listen: (cb: __TAURI_EVENT.EventCallback<SidecarDone>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<SidecarDone>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: SidecarDone) => Promise<void>;
    };
    sidecarInstallProgress: ((target: _tauri_apps_api_webview.Webview | _tauri_apps_api_window.Window) => {
        listen: (cb: __TAURI_EVENT.EventCallback<SidecarProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<SidecarProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: SidecarProgress) => Promise<void>;
    }) & {
        listen: (cb: __TAURI_EVENT.EventCallback<SidecarProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<SidecarProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: SidecarProgress) => Promise<void>;
    };
    sidecarLine: ((target: _tauri_apps_api_webview.Webview | _tauri_apps_api_window.Window) => {
        listen: (cb: __TAURI_EVENT.EventCallback<SidecarLine>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<SidecarLine>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: SidecarLine) => Promise<void>;
    }) & {
        listen: (cb: __TAURI_EVENT.EventCallback<SidecarLine>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<SidecarLine>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: SidecarLine) => Promise<void>;
    };
    sidecarLog: ((target: _tauri_apps_api_webview.Webview | _tauri_apps_api_window.Window) => {
        listen: (cb: __TAURI_EVENT.EventCallback<SidecarLog>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<SidecarLog>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: SidecarLog) => Promise<void>;
    }) & {
        listen: (cb: __TAURI_EVENT.EventCallback<SidecarLog>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<SidecarLog>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: SidecarLog) => Promise<void>;
    };
    storeExternalMutation: ((target: _tauri_apps_api_webview.Webview | _tauri_apps_api_window.Window) => {
        listen: (cb: __TAURI_EVENT.EventCallback<ExternalMutation>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<ExternalMutation>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: ExternalMutation) => Promise<void>;
    }) & {
        listen: (cb: __TAURI_EVENT.EventCallback<ExternalMutation>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<ExternalMutation>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: ExternalMutation) => Promise<void>;
    };
    storeWarning: ((target: _tauri_apps_api_webview.Webview | _tauri_apps_api_window.Window) => {
        listen: (cb: __TAURI_EVENT.EventCallback<StoreWarning>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<StoreWarning>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: StoreWarning) => Promise<void>;
    }) & {
        listen: (cb: __TAURI_EVENT.EventCallback<StoreWarning>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<StoreWarning>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: StoreWarning) => Promise<void>;
    };
    updateProgress: ((target: _tauri_apps_api_webview.Webview | _tauri_apps_api_window.Window) => {
        listen: (cb: __TAURI_EVENT.EventCallback<UpdateProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<UpdateProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: UpdateProgress) => Promise<void>;
    }) & {
        listen: (cb: __TAURI_EVENT.EventCallback<UpdateProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<UpdateProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: UpdateProgress) => Promise<void>;
    };
    valiProgress: ((target: _tauri_apps_api_webview.Webview | _tauri_apps_api_window.Window) => {
        listen: (cb: __TAURI_EVENT.EventCallback<ValiProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<ValiProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: ValiProgress) => Promise<void>;
    }) & {
        listen: (cb: __TAURI_EVENT.EventCallback<ValiProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        once: (cb: __TAURI_EVENT.EventCallback<ValiProgress>) => Promise<__TAURI_EVENT.UnlistenFn>;
        emit: (payload: ValiProgress) => Promise<void>;
    };
};
declare const BUILTIN_FIELDS: readonly [{
    readonly key: "lat";
    readonly label: "Latitude";
    readonly type: "number";
    readonly kind: "identity";
    readonly comparison: null;
}, {
    readonly key: "lng";
    readonly label: "Longitude";
    readonly type: "number";
    readonly kind: "identity";
    readonly comparison: null;
}, {
    readonly key: "heading";
    readonly label: "Heading";
    readonly type: "number";
    readonly kind: "writable";
    readonly comparison: {
        readonly type: "circular";
        readonly period: 360;
    };
}, {
    readonly key: "pitch";
    readonly label: "Pitch";
    readonly type: "number";
    readonly kind: "writable";
    readonly comparison: null;
}, {
    readonly key: "zoom";
    readonly label: "Zoom";
    readonly type: "number";
    readonly kind: "writable";
    readonly comparison: null;
}, {
    readonly key: "id";
    readonly label: "ID";
    readonly type: "number";
    readonly kind: "identity";
    readonly comparison: null;
}, {
    readonly key: "createdAt";
    readonly label: "Created";
    readonly type: "date";
    readonly kind: null;
    readonly comparison: null;
}, {
    readonly key: "modifiedAt";
    readonly label: "Modified";
    readonly type: "date";
    readonly kind: null;
    readonly comparison: null;
}, {
    readonly key: "panoId";
    readonly label: "Pano ID";
    readonly type: "string";
    readonly kind: null;
    readonly comparison: null;
}, {
    readonly key: "provider";
    readonly label: "Provider";
    readonly type: "string";
    readonly kind: null;
    readonly comparison: null;
}, {
    readonly key: "tagCount";
    readonly label: "Tag count";
    readonly type: "number";
    readonly kind: "virtual";
    readonly comparison: null;
}, {
    readonly key: "loadAsPanoId";
    readonly label: "Load as pano ID";
    readonly type: "number";
    readonly kind: "writable";
    readonly comparison: null;
}, {
    readonly key: "informational";
    readonly label: "Informational";
    readonly type: "number";
    readonly kind: "term";
    readonly comparison: null;
}];
declare const DEFAULT_DUPLICATE_SCORE: "tagCount + has(panoId) + loadAsPanoId + (heading != 0)";
declare const KNOWN_FIELDS: readonly [{
    readonly key: "altitude";
    readonly type: "number";
    readonly label: "Altitude";
    readonly values: readonly [];
    readonly labels: readonly [];
    readonly circularPeriod: null;
    readonly defaultOff: false;
}, {
    readonly key: "countryCode";
    readonly type: "string";
    readonly label: "Country code";
    readonly values: readonly [];
    readonly labels: readonly [];
    readonly circularPeriod: null;
    readonly defaultOff: false;
}, {
    readonly key: "cameraType";
    readonly type: "enum";
    readonly label: "Camera type";
    readonly values: readonly ["gen1", "gen2", "gen4", "badcam", "tripod", "trekker"];
    readonly labels: readonly [readonly ["gen1", "Gen 1"], readonly ["gen2", "Gen 2/3"], readonly ["gen4", "Gen 4"], readonly ["badcam", "Bad cam"], readonly ["tripod", "Tripod"], readonly ["trekker", "Trekker"]];
    readonly circularPeriod: null;
    readonly defaultOff: false;
}, {
    readonly key: "panoType";
    readonly type: "enum";
    readonly label: "Pano type";
    readonly values: readonly ["2", "3", "10"];
    readonly labels: readonly [readonly ["2", "Official"], readonly ["3", "Unknown"], readonly ["10", "User uploaded"]];
    readonly circularPeriod: null;
    readonly defaultOff: false;
}, {
    readonly key: "imageDate";
    readonly type: "month";
    readonly label: "Image date";
    readonly values: readonly [];
    readonly labels: readonly [];
    readonly circularPeriod: null;
    readonly defaultOff: false;
}, {
    readonly key: "datetime";
    readonly type: "date";
    readonly label: "Exact date";
    readonly values: readonly [];
    readonly labels: readonly [];
    readonly circularPeriod: null;
    readonly defaultOff: true;
}, {
    readonly key: "timezone";
    readonly type: "enum";
    readonly label: "Timezone";
    readonly values: readonly [];
    readonly labels: readonly [];
    readonly circularPeriod: null;
    readonly defaultOff: true;
}, {
    readonly key: "drivingDirection";
    readonly type: "number";
    readonly label: "Driving direction";
    readonly values: readonly [];
    readonly labels: readonly [];
    readonly circularPeriod: 360;
    readonly defaultOff: true;
}, {
    readonly key: "uploaderName";
    readonly type: "string";
    readonly label: "Uploader";
    readonly values: readonly [];
    readonly labels: readonly [];
    readonly circularPeriod: null;
    readonly defaultOff: true;
}, {
    readonly key: "coverageDates";
    readonly type: "array";
    readonly label: "Coverage dates";
    readonly values: readonly [];
    readonly labels: readonly [];
    readonly circularPeriod: null;
    readonly defaultOff: true;
}, {
    readonly key: "subdivision";
    readonly type: "string";
    readonly label: "Subdivision";
    readonly values: readonly [];
    readonly labels: readonly [];
    readonly circularPeriod: null;
    readonly defaultOff: true;
}];
declare const PROJECTIONS: readonly [{
    readonly id: "value";
    readonly appliesTo: readonly ["string", "enum", "number", "month"];
    readonly needsTz: false;
}, {
    readonly id: "year";
    readonly appliesTo: readonly ["date", "month"];
    readonly needsTz: true;
}, {
    readonly id: "yearMonth";
    readonly appliesTo: readonly ["date"];
    readonly needsTz: true;
}, {
    readonly id: "day";
    readonly appliesTo: readonly ["date"];
    readonly needsTz: true;
}, {
    readonly id: "monthOfYear";
    readonly appliesTo: readonly ["date", "month"];
    readonly needsTz: true;
}, {
    readonly id: "hourOfDay";
    readonly appliesTo: readonly ["date"];
    readonly needsTz: true;
}];
/**
 *  Map-level alternate basemap settings. Petal and Yandex are mutually exclusive
 *  (at most one `enabled: true` at a time); the frontend enforces that on write.
 */
type AltBasemapSettings = {
    petal?: AltBasemapSlot;
    yandex?: AltBasemapSlot;
};
/**  One alternate basemap provider slot (Petal or Yandex). */
type AltBasemapSlot = {
    enabled?: boolean;
    /**  Petal: `"en"` | `"zh"`. Yandex: `"ru_RU"` | `"en_RU"` | `"en_US"` | `"uk_UA"` | `"ru_UA"` | `"tr_TR"`. */
    language?: string;
};
/**
 *  Per-provider Street View settings (coverage overlay + click behavior).
 *  Shape is shared across alternate providers; omitted keys mean "use frontend defaults".
 */
/**
 *  Per-provider Street View settings (coverage overlay + click behavior).
 *  Shape is shared across alternate providers; omitted keys mean "use frontend defaults".
 */
type AltProviderSettings_Deserialize = {
    enabled?: boolean;
    preferred?: boolean;
    fallbackToGoogle?: boolean;
    showLines?: boolean;
    showPoints?: boolean;
    lineOpacity?: number;
    pointsOpacity?: number;
    lineColor?: string;
    trekkerLineColor?: string;
    pointFill?: string;
    pointStroke?: string;
    trekkerPointFill?: string;
    trekkerPointStroke?: string;
    lineWidthScale?: number;
    pointSizeScale?: number;
};
/**
 *  Per-provider Street View settings (coverage overlay + click behavior).
 *  Shape is shared across alternate providers; omitted keys mean "use frontend defaults".
 */
type AltProviderSettings = {
    enabled: boolean;
    preferred: boolean;
    fallbackToGoogle: boolean;
    showLines: boolean;
    showPoints: boolean;
    lineOpacity: number;
    pointsOpacity: number;
    lineColor: string;
    trekkerLineColor: string;
    pointFill: string;
    pointStroke: string;
    trekkerPointFill: string;
    trekkerPointStroke: string;
    lineWidthScale: number;
    pointSizeScale: number;
};
/**  How a page of rows is cut into procedure calls. */
type BatchMode = {
    mode: "chunk";
    size: number;
} | {
    mode: "perRow";
} | 
/**
 *  Group rows by a row field; the procedure sees one representative per distinct
 *  value and its patch fans back out to every row sharing it. v1 key: `panoId`.
 */
{
    mode: "dedupeBy";
    key: string;
};
type CameraType = "gen1" | "gen2" | "gen4" | "badcam" | "tripod" | "trekker";
/**
 *  A swap-removal from a render cell. JS must move the last element into `cell_index`
 *  and pop the array to mirror the Rust-side swap-remove.
 */
type CellRemoval = {
    cell: string;
    cellIndex: number;
    id: number;
};
/**  Values, never rows: the projection for a scan that reads fields across a set. */
type Columns = unknown[][];
/**
 *  A commit's delta, returned to the frontend for the per-commit diff viewer.
 *  An updated location appears in both `created` (new) and `removed` (old).
 */
type CommitDelta = {
    created: Location[];
    removed: Location[];
};
type CommitDiff = {
    added: number;
    removed: number;
    modified: number;
};
type CommitInfo = {
    id: string;
    mapId: string;
    parentId: string | null;
    message: string | null;
    treeHash: string | null;
    locationCount: number;
    createdAt: string;
} & CommitDiff;
/**
 *  How a field's values are compared when measuring how strongly it separates
 *  groups (selection disambiguation). The only un-inferrable property a field can
 *  declare is circularity (heading/azimuth=360, hour-of-day=24, month=12);
 *  everything else is inferred from `ExtraFieldType`.
 */
type ComparisonType = {
    type: "linear";
} | {
    type: "circular";
    period: number;
} | {
    type: "categorical";
};
type Conflict = {
    key: string;
    kind: ConflictKind;
    /**  Base value is not persisted (only its hash), so conflicts surface local vs remote. */
    local: NormalizedSyncLocation | null;
    remote: NormalizedSyncLocation | null;
};
type ConflictKind = 
/**  Both sides modified the same location differently. */
"update-update" | 
/**  One side deleted while the other modified. */
"delete-update" | 
/**  Both sides added the same identity with different content (hash collision only). */
"add-add";
/**  Result of a cross-map location copy. `target_name` feeds the toast. */
type CopyToMapResult = {
    copied: number;
    skipped: number;
    targetName: string;
};
/**  The active and default data-folder paths, plus whether a custom override is in effect. */
type DataLocation = {
    /**  Folder currently in use this session (default or override). */
    path: string;
    /**  OS default, ignoring any override -- used for the "reset" affordance. */
    default_path: string;
    /**  True when `path` differs from the OS default. */
    is_custom: boolean;
};
/**  A calendar component to group dates by. */
type DatePart = "year" | "yearMonth" | "day" | "monthOfYear" | "hourOfDay";
/**  Aggregate database statistics for the debug panel. */
type DbStats = {
    maps: number;
    locations: number;
    tags: number;
    commits: number;
    dbSizeBytes: number;
    locationSizeBytes: number;
    journalMode: string;
    foreignKeys: boolean;
};
/**  Row count for a single SQLite table, used in the debug diagnostics panel. */
type DbTableInfo = {
    name: string;
    rows: number;
};
/**
 *  Preview data for importing a file into the currently open map.
 *  Unlike bulk import, this shows per-field counts so the user can
 *  selectively drop fields (heading, panoId, etc.) before importing.
 */
type EditorImportPreview = {
    locationCount: number;
    tags: Tag[];
    fields: FieldCount[];
    warnings: string[];
    /**  Temp-file path to preview positions: interleaved LE f32 `[lng, lat]` pairs. */
    previewPositionsPath: string;
    /**  `[west, south, east, north]` bounding box of the import, for map auto-focus. */
    bounds: [number, number, number, number] | null;
    /**
     *  True when this import exceeds `IMPORT_AUTOCOMMIT_THRESHOLD` and will be
     *  committed automatically (not undoable). Drives the import warning modal.
     */
    willAutoCommit: boolean;
};
/**
 *  Combined result of an editor import: the mutation delta (for render pipeline)
 *  plus import-specific metadata.
 */
type EditorImportResult = {
    importedCount: number;
    warnings: string[];
    /**  True when the import was large enough to autocommit; the caller commits it. */
    autoCommit: boolean;
    /**  Settings carried by the import (`extra.settings`) */
    settings: {
        [key in string]: any;
    };
} & MutationResult;
/**
 *  Configuration for JSON export. Controls which fields are included and
 *  whether the export covers all locations or a specific selection.
 */
type ExportOpts = {
    exportZoom: boolean;
    exportUnpanned: boolean;
    exportExtras: boolean;
    /**  Which locations to export. */
    selector: Selector;
    mapName: string;
    /**
     *  Serialized `{id: {name, color}}` tag definitions from the store, used to
     *  convert numeric tag IDs back to human-readable names in the output.
     */
    tagsJson: string;
    extraFieldsJson: string | null;
};
/**
 *  Progress event emitted per-map during bulk export, consumed by the frontend
 *  to drive a progress indicator.
 */
type ExportProgress = {
    current: number;
    total: number;
    mapName: string;
};
/**  Why an expression failed to parse. The sentence is TS's to write. */
type ExprError = {
    kind: "invalidNumber";
    position: number;
} | {
    kind: "unterminatedString";
} | {
    kind: "unexpectedCharacter";
    character: string;
    position: number;
} | {
    kind: "expectedSymbol";
    symbol: string;
} | {
    kind: "chainedComparison";
} | {
    kind: "unexpectedEnd";
} | {
    kind: "missingLeftOperand";
} | {
    kind: "hasTakesFieldName";
} | {
    kind: "unknownFunction";
    name: string;
} | {
    kind: "wrongArgCount";
    name: string;
    expected: number;
} | {
    kind: "unexpectedToken";
    token: string;
} | {
    kind: "trailingToken";
    token: string;
};
/**  A mutation another window made to a map this window may have open, routed by `map_id`. */
type ExternalMutation = {
    mapId: string;
} & MutationResult;
/**
 *  Schema definition for a single `Location.extra` field. Stored in the map's
 *  `extra.fields` JSON. For enum types, `values` lists valid options and `labels`
 *  provides display names.
 */
type ExtraFieldDef = {
    type: ExtraFieldType;
    label?: string | null;
    values?: string[] | null;
    labels?: {
        [key in string]: string;
    } | null;
    /**
     *  Optional override for how this field is compared during disambiguation.
     *  `None` => inferred from `field_type` on the analysis side.
     */
    comparison?: ComparisonType | null;
};
/**
 *  Type discriminant for `Location.extra` field definitions.
 *  Determines how the field is displayed and filtered in the UI.
 */
type ExtraFieldType = "string" | "number" | "date" | "month" | "enum" | "array";
/**
 *  Field presence count for the editor import preview dialog, letting
 *  the user see which optional fields exist and decide which to keep/drop.
 */
type FieldCount = {
    key: string;
    count: number;
};
/**
 *  A field-wide rewrite of the `extra` map. Patches are derived *per row*, which is what
 *  separates these from `store_update_locations`' explicit patch list.
 */
type FieldOp = 
/**
 *  Rename `from` into `to`. Merge is the same operation -- rename is just the case
 *  where nothing holds `to` -- so `winner` decides only where a row holds both.
 */
{
    kind: "move";
    from: string;
    to: string;
    winner: MergeWinner;
} | 
/**  Drop `keys` from every row that has them. */
{
    kind: "delete";
    keys: string[];
} | 
/**
 *  Assign `value` to `key` on every row where it differs. A writable built-in key
 *  (`heading`, `pitch`, `zoom`) patches its column; anything else writes `extra`.
 */
{
    kind: "set";
    key: string;
    value: unknown;
} | 
/**
 *  Assign `key = expr(row)` per row. A row where the expression cannot evaluate (a
 *  missing or non-numeric field, a non-finite result) is skipped and counted.
 */
{
    kind: "expr";
    key: string;
    expr: string;
};
/**  The op's outcome for the caller: the mutation plus the counts its message needs. */
type FieldOpResult = {
    mutation: MutationResult;
    /**  Rows the op patched. */
    changed: number;
    /**  Rows an expression could not evaluate. */
    skipped: number;
};
/**
 *  Filter comparison operator. Single source of truth: specta renders the literal
 *  union, so the TS `FilterOp` type and `OP_LABELS` derive from this enum.
 */
type FilterOp = "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "between" | "between_anyyear" | "between_anytime" | "has" | "nothas" | "contains" | "notcontains";
/**
 *  First-sync seeding when both sides already have pins. Only meaningful on the first sync
 *  (empty mapping); afterwards it's plain three-way. `Merge` never deletes.
 */
type FirstSyncMode = "merge" | "mirrorFromRemote" | "mirrorFromLocal";
/**  Reverse geocode result: nearest populated place to a coordinate. */
type GeoResult = {
    city: string;
    /**  First-level administrative division (state, province, region). */
    admin: string;
    country: string;
    /**  ISO 3166-1 alpha-2 (e.g. "US", "FR"). */
    country_code: string;
};
/**  The signed-in GeoGuessr account. */
type GgUser = {
    id: string;
    nick: string;
    /**  Avatar pin path (e.g. `pin/<hash>.png`), served under `/images/` on geoguessr.com. */
    pin: string | null;
};
/**
 *  One row of honeycomb points: `count` points from `lng` eastward, each `lngStep` degrees
 *  apart.
 */
type HoneycombRun = {
    lat: number;
    lng: number;
    lngStep: number;
    count: number;
};
/**
 *  Summary of a single map found during bulk import preview.
 *  Shown in the import dialog so the user can select which maps to import.
 */
type ImportPreviewEntry = {
    name: string;
    folder: string | null;
    locationCount: number;
    tagCount: number;
    warnings: string[];
};
/**
 *  Progress event emitted per-map during bulk import, consumed by the frontend
 *  to drive a progress indicator.
 */
type ImportProgress = {
    current: number;
    total: number;
    mapName: string;
};
/**  Result returned per map after a successful bulk import. */
type ImportedMapInfo = {
    id: string;
    name: string;
    locationCount: number;
    tagCount: number;
};
/**  How a field value becomes a group key. Wire-mirrors the JS `KeySpec`. */
type KeySpec = 
/**  String value of the field (enum/string/month "YYYY-MM"/number). */
{
    kind: "value";
} | 
/**  Equal-width numeric bins. */
{
    kind: "numericBin";
    binning: NumericBinning;
} | 
/**  Calendar component of a date (epoch seconds) or month ("YYYY-MM") field. */
{
    kind: "datePart";
    part: DatePart;
    tzLocal: boolean;
};
/**
 *  A single Street View location on a map.
 *
 *  This is the atomic unit of data in the system. Locations are stored columnar
 *  in Arrow IPC on disk and addressed by `id` everywhere. The `id` is unique
 *  within a map and assigned by the store's monotonic allocator.
 */
type Location = {
    /**
     *  Monotonically increasing within a map. Zero is a sentinel meaning
     *  "not yet assigned" (used during import before IDs are allocated).
     */
    id: number;
    lat: number;
    lng: number;
    heading: number;
    pitch: number;
    zoom: number;
    panoId: string | null;
    /**
     *  Imagery provider discriminator (`"google"`, `"apple"`, ...).
     *  Defaults to `"google"`. Missing on deserialize (pre-provider maps / JSON) → `"google"`.
     */
    provider?: string | null;
    /**  See [`LocationFlags`]. */
    flags: number;
    /**  Tag IDs applied to this location. References `Tag.id`. */
    tags: number[];
    /**  Arbitrary key-value metadata */
    extra: any | null;
    /**  Unix timestamp (seconds) */
    createdAt: number;
    modifiedAt: number | null;
};
/**
 *  Partial location update from JS. `None` fields are unchanged; `Some(None)` on
 *  nullable fields (panoId, extra, modifiedAt) explicitly sets the field to null.
 *  `extra` is a JSON Merge Patch (RFC 7386): keys shallow-merge, null values delete.
 */
/**
 *  Partial location update from JS. `None` fields are unchanged; `Some(None)` on
 *  nullable fields (panoId, extra, modifiedAt) explicitly sets the field to null.
 *  `extra` is a JSON Merge Patch (RFC 7386): keys shallow-merge, null values delete.
 */
type LocationPatch_Deserialize = {
    lat?: number | null;
    lng?: number | null;
    heading?: number | null;
    pitch?: number | null;
    zoom?: number | null;
    panoId?: string | null;
    /**  Imagery provider discriminator (`"google"`, `"apple"`, …). */
    provider?: string | null;
    flags?: number | null;
    tags?: number[] | null;
    extra?: any | null;
    createdAt?: number | null;
    modifiedAt?: number | null;
};
/**
 *  Partial location update from JS. `None` fields are unchanged; `Some(None)` on
 *  nullable fields (panoId, extra, modifiedAt) explicitly sets the field to null.
 *  `extra` is a JSON Merge Patch (RFC 7386): keys shallow-merge, null values delete.
 */
type LocationPatch = {
    lat: number | null;
    lng: number | null;
    heading: number | null;
    pitch: number | null;
    zoom: number | null;
    panoId: string | null;
    /**  Imagery provider discriminator (`"google"`, `"apple"`, …). */
    provider: string | null;
    flags: number | null;
    tags: number[] | null;
    extra: any | null;
    createdAt: number | null;
    modifiedAt: number | null;
};
type MapData_Deserialize = {
    meta: MapMeta_Deserialize;
};
type MapData = {
    meta: MapMeta;
};
/**
 *  Top-level `extra` JSON blob on a map row. Currently only holds field definitions,
 *  but structured as an object to allow future extensions.
 */
type MapExtra = {
    fields?: {
        [key in string]: ExtraFieldDef;
    } | null;
};
/**
 *  Action performed by a per-map key binding on the active location.
 *  New action kinds (e.g. copy-to-map) are added as variants here.
 */
type MapKeyAction = {
    type: "applyTag";
    tagId: number;
} | {
    type: "copyToMap";
    mapId: string;
};
/**
 *  One user-defined per-map key binding. `key` is a combo string in the same
 *  canonical format as global hotkey bindings (e.g. "m", "Mod+Shift+x").
 */
type MapKeyBinding = {
    key: string;
    action: MapKeyAction;
};
/**
 *  Full metadata for a map, deserialized from the SQLite `maps` row.
 *  JSON columns (settings, tags, extra, etc.) are parsed into typed structs.
 */
/**
 *  Partial update for map metadata. Only non-`None` fields are written.
 *  `folder: Some(None)` explicitly unsets the folder (moves to root).
 */
/**
 *  Partial update for map metadata. Only non-`None` fields are written.
 *  `folder: Some(None)` explicitly unsets the folder (moves to root).
 */
type MapMetaPatch_Deserialize = {
    name?: string | null;
    description?: string | null;
    folder?: string | null;
    settings?: MapSettings_Deserialize | null;
    scoreBounds?: ScoreBounds | null;
    extra?: MapExtra | null;
    tags?: {
        [key in string]: Tag;
    } | null;
    labels?: string[] | null;
};
/**
 *  Partial update for map metadata. Only non-`None` fields are written.
 *  `folder: Some(None)` explicitly unsets the folder (moves to root).
 */
type MapMetaPatch = {
    name: string | null;
    description: string | null;
    folder: string | null;
    settings: MapSettings | null;
    scoreBounds: ScoreBounds | null;
    extra: MapExtra | null;
    tags: {
        [key in string]: Tag;
    } | null;
    labels: string[] | null;
};
/**
 *  Full metadata for a map, deserialized from the SQLite `maps` row.
 *  JSON columns (settings, tags, extra, etc.) are parsed into typed structs.
 */
type MapMeta_Deserialize = {
    id: string;
    name: string;
    description: string;
    folder: string | null;
    settings: MapSettings_Deserialize;
    scoreBounds: ScoreBounds;
    extra: MapExtra;
    tags: {
        [key in string]: Tag;
    };
    labels: string[];
    locationCount: number;
    createdAt: string;
    updatedAt: string;
    lastOpenedAt: string | null;
};
/**
 *  Full metadata for a map, deserialized from the SQLite `maps` row.
 *  JSON columns (settings, tags, extra, etc.) are parsed into typed structs.
 */
type MapMeta = {
    id: string;
    name: string;
    description: string;
    folder: string | null;
    settings: MapSettings;
    scoreBounds: ScoreBounds;
    extra: MapExtra;
    tags: {
        [key in string]: Tag;
    };
    labels: string[];
    locationCount: number;
    createdAt: string;
    updatedAt: string;
    lastOpenedAt: string | null;
};
/**
 *  Per-map editor preferences. Controls Street View lookup behavior (official vs
 *  unofficial, camera type filters), export defaults, and metadata enrichment.
 */
/**
 *  Per-map editor preferences. Controls Street View lookup behavior (official vs
 *  unofficial, camera type filters), export defaults, and metadata enrichment.
 */
type MapSettings_Deserialize = {
    pointAlongRoad?: boolean;
    preferDirection?: string | null;
    preferOfficial?: boolean;
    preferHigherQuality?: boolean;
    onlyOfficial?: boolean;
    cameraTypes?: string[] | null;
    defaultPanoId?: boolean;
    exportZoom?: boolean;
    exportUnpanned?: boolean;
    exportExtras?: boolean;
    searchRadius?: number | null;
    enrichMetadata?: boolean;
    enrichFields?: string[] | null;
    keyBindings?: MapKeyBinding[];
    /**  Virtual tag-tree nodes keyed by full slash path. Tree-view only. */
    virtualTags?: {
        [key in string]: VirtualTag;
    };
    /**
     *  Tag aliases: a second tree location (full slash path) -> the real tag id shown
     *  there. Tree-view only; clicking the alias leaf toggles the real tag.
     */
    aliases?: {
        [key in string]: number;
    };
    /**
     *  Which member of a duplicate group survives a merge: a `field_expr` scoring the
     *  location, highest wins. `None` (or blank) uses the built-in ranking.
     */
    duplicateScore?: string | null;
    /**
     *  Scores every location; a review pass walks them highest first. `None` (or blank)
     *  reviews them in the order the selection resolved.
     */
    reviewOrder?: string | null;
    /**  Alternate Street View providers (Apple Look Around, …). */
    providers?: ProvidersSettings_Deserialize;
};
/**
 *  Per-map editor preferences. Controls Street View lookup behavior (official vs
 *  unofficial, camera type filters), export defaults, and metadata enrichment.
 */
type MapSettings = {
    pointAlongRoad: boolean;
    preferDirection: string | null;
    preferOfficial: boolean;
    preferHigherQuality: boolean;
    onlyOfficial: boolean;
    cameraTypes: string[] | null;
    defaultPanoId: boolean;
    exportZoom: boolean;
    exportUnpanned: boolean;
    exportExtras: boolean;
    searchRadius: number | null;
    enrichMetadata: boolean;
    enrichFields: string[] | null;
    keyBindings: MapKeyBinding[];
    /**  Virtual tag-tree nodes keyed by full slash path. Tree-view only. */
    virtualTags: {
        [key in string]: VirtualTag;
    };
    /**
     *  Tag aliases: a second tree location (full slash path) -> the real tag id shown
     *  there. Tree-view only; clicking the alias leaf toggles the real tag.
     */
    aliases: {
        [key in string]: number;
    };
    /**
     *  Which member of a duplicate group survives a merge: a `field_expr` scoring the
     *  location, highest wins. `None` (or blank) uses the built-in ranking.
     */
    duplicateScore: string | null;
    /**
     *  Scores every location; a review pass walks them highest first. `None` (or blank)
     *  reviews them in the order the selection resolved.
     */
    reviewOrder: string | null;
    /**  Alternate Street View providers (Apple Look Around, …). */
    providers: ProvidersSettings;
};
/**  When a move target already holds a value, which side survives. */
type MergeWinner = "from" | "to";
/**  A remote map the signed-in user can link to. */
type MmRemoteMap = {
    id: number;
    name: string;
    locationCount: number | null;
};
/**  The signed-in map-making.app account. */
type MmUser = {
    id: number;
    username: string;
};
/**
 *  Unified response for every mutation IPC. Bundles the store status, render delta,
 *  optional selection sync, optional newly-discovered extra-field keys, and optional
 *  updated tags. JS applies all of these atomically to stay in sync with the Rust state.
 *  `new_field_defs` carries the inferred/known field definitions for extra-field keys
 *  discovered for the first time in this mutation. JS merges them straight into the
 *  field-def registry, so field metadata is live without a reload.
 */
type MutationResult = {
    delta: RenderDelta;
    selectionSync: SelectionSync | null;
    newFieldDefs: {
        [key in string]: ExtraFieldDef;
    } | null;
    tags: {
        [key in number]: Tag;
    } | null;
} & StoreStatus;
/**
 *  The syncable contract: the only fields that participate in diffing. Everything else is
 *  owned by exactly one side and would register as a phantom change.
 */
type NormalizedSyncLocation = {
    lat: number;
    lng: number;
    heading: number;
    pitch: number;
    zoom: number;
    panoId: string | null;
    /**  Remote-meaningful bits only; virtual bits are stripped. */
    flags: number;
    /**  Tag names, deduped and sorted. Empty for providers with no tag support. */
    tags: string[];
};
/**  Equal-width bin sizing. `count` derives the width from the data range; `width` fixes it. */
type NumericBinning = {
    by: "count";
    n: number;
} | {
    by: "width";
    w: number;
};
/**  A single location parsed out of a pasted Maps URL. */
type ParsedLocation = {
    lat: number;
    lng: number;
    heading: number;
    pitch: number;
    zoom: number;
    panoId: string | null;
    flags: number;
    /**  Tag names. */
    tags: string[];
    /**  Imagery provider. Google Maps URLs always produce `"google"`. */
    provider: string | null;
};
/**
 *  One partition group: a stable key, the ids it holds, and (numeric bins only) the
 *  `[lo, hi]` bounds so JS can rebuild a live Filter for whole-map gradients.
 */
type PartitionBucket = {
    key: string;
    ids: number[];
    bin: [number, number] | null;
};
/**  Metadata for a user-installed plugin, read from `plugins/{id}/manifest.json`. */
/**  Metadata for a user-installed plugin, read from `plugins/{id}/manifest.json`. */
type PluginManifest_Deserialize = {
    id?: string;
    name?: string;
    description?: string;
    icon?: string;
    main?: string;
    version?: string;
    experimental?: boolean;
    comingSoon?: boolean;
    minAppVersion?: string | null;
    sidecar?: PluginSidecar_Deserialize | null;
};
/**  Metadata for a user-installed plugin, read from `plugins/{id}/manifest.json`. */
type PluginManifest = {
    id: string;
    name: string;
    description: string;
    icon: string;
    main: string;
    version: string;
    experimental?: boolean;
    comingSoon?: boolean;
    minAppVersion?: string | null;
    sidecar?: PluginSidecar | null;
};
/**  A plugin's declared sidecar binary (downloaded from GitHub Releases on install). */
/**  A plugin's declared sidecar binary (downloaded from GitHub Releases on install). */
type PluginSidecar_Deserialize = {
    name: string;
    version: string;
    /**  Expected SHA-256 hex digest of the platform-specific zip archive. */
    sha256: string | null;
};
/**  A plugin's declared sidecar binary (downloaded from GitHub Releases on install). */
type PluginSidecar = {
    name: string;
    version: string;
    /**  Expected SHA-256 hex digest of the platform-specific zip archive. */
    sha256?: string | null;
};
/**
 *  GeoJSON-like polygon geometry. `coordinates` is the primary polygon (outer ring +
 *  optional holes). `extra_polygons` allows multipolygon selections (e.g., from GeoJSON import).
 */
type PolygonGeometry = {
    coordinates: (([number, number])[])[];
    extraPolygons?: ((([number, number])[])[])[] | null;
    properties?: any | null;
};
type PresenceActivity = {
    details: string | null;
    state: string | null;
    largeImage: string | null;
    largeText: string | null;
    smallImage: string | null;
    smallText: string | null;
    /**  Unix seconds; Discord renders an "elapsed" timer counting up from here. */
    start: number | null;
};
/**  Everything the procedure engine has in flight at one instant. */
type ProcedureActivity = {
    /**  The providers working right now. */
    runs: ProviderActivity[];
    /**  The procedures answering a question right now. */
    queries: QueryActivity[];
    /**  Requests answered per second over the last few seconds, across everything running. */
    requestsPerSecond: number;
};
type ProcedureProgress = {
    runId: number;
    providerId: string;
    done: number;
    total: number;
    failed: number;
    /**
     *  Rows counted as done without being worked, because they already held every field
     *  the provider produces. Callers subtract these to report what a run actually did.
     */
    skipped: number;
    finished: boolean;
};
/**
 *  What one page hands back to the caller: a `Collect` provider's answers, delivered
 *  instead of being written, and for every sink the rows that failed. Emitted only when
 *  there is something in it.
 */
type ProcedureResult = {
    runId: number;
    providerId: string;
    entries: ResultEntry[];
    /**  Rows the procedure failed, or every row of a batch whose call failed. */
    failed: number[];
};
/**  One provider working its share of a run. */
type ProviderActivity = {
    /**  The run this provider belongs to. */
    runId: number;
    /**  The provider's id. */
    providerId: string;
    /**  The provider's display name, where it has one. */
    label: string | null;
    /**  Locations the provider was handed. */
    total: number;
    /**  Locations it has finished. */
    done: number;
    /**  Locations it could not work. */
    failed: number;
    /**  Locations that already held everything it produces. */
    skipped: number;
    /**  Copies of the procedure working its queue. */
    instances: number;
    /**  Requests outstanding at this instant. */
    inflight: number;
    /**  The most requests the provider may keep outstanding. */
    inflightLimit: number;
    /**  Requests parked until the provider's rate limit lets them through. */
    rateWaiting: number;
    /**  Requests retried so far in this run. */
    retries: number;
};
/**
 *  One provider as declared by the frontend. `fields` are the extra keys it produces
 *  and `requires` the keys it consumes; together they schedule dependency waves.
 */
type ProviderDecl = {
    id: string;
    label?: string | null;
    /**  The procedure module: an absolute path, or `res://<rel>` for one bundled with the app. */
    entry?: string | null;
    fields?: string[];
    requires?: string[];
    /**
     *  Extra keys to null when a written field's value actually changes, so dependents
     *  re-derive from the new input instead of keeping the old pano's answers.
     */
    invalidates?: {
        [key in string]: string[];
    };
    select: Selector;
    batch: BatchMode;
    sink?: Sink;
    rate?: RateSpec | null;
    retry?: RetrySpec | null;
    /**
     *  Re-derive this provider's fields even on a run that is not forced. For an
     *  operation whose whole point is to recompute one provider (pinning re-resolves the
     *  panorama) rather than to fill in what is missing.
     */
    force?: boolean | null;
    /**  Requests this provider may have in flight at once, summed over its instances. */
    inflight?: number | null;
    /**
     *  Instances this provider may run at once. Declared only when the procedure
     *  cannot run beside itself; throughput comes from `inflight`.
     */
    instances?: number | null;
    /**
     *  Provider-specific configuration, a JSON value as text. Passed through verbatim
     *  inside the object the procedure's `configure` receives.
     */
    config?: string | null;
};
/**
 *  Alternate Street View provider settings bag on a map.
 *  Google is the host default and is not configured here. Each key is optional so
 *  future providers can be added without migrating existing maps.
 */
/**
 *  Alternate Street View provider settings bag on a map.
 *  Google is the host default and is not configured here. Each key is optional so
 *  future providers can be added without migrating existing maps.
 */
type ProvidersSettings_Deserialize = {
    apple?: AltProviderSettings_Deserialize | null;
    baidu?: AltProviderSettings_Deserialize | null;
    tencent?: AltProviderSettings_Deserialize | null;
    yandex?: AltProviderSettings_Deserialize | null;
    /**  Shared Petal / Yandex basemap toggles (not per-provider). */
    altBasemapSettings?: AltBasemapSettings | null;
};
/**
 *  Alternate Street View provider settings bag on a map.
 *  Google is the host default and is not configured here. Each key is optional so
 *  future providers can be added without migrating existing maps.
 */
type ProvidersSettings = {
    apple: AltProviderSettings | null;
    baidu: AltProviderSettings | null;
    tencent: AltProviderSettings | null;
    yandex: AltProviderSettings | null;
    /**  Shared Petal / Yandex basemap toggles (not per-provider). */
    altBasemapSettings: AltBasemapSettings | null;
};
/**
 *  A remote-originated create for JS to apply. `remote_id` is the handle its mapping row must
 *  carry once created (a positional push reindexes to its desired-document position).
 */
type PullCreate = {
    fields: NormalizedSyncLocation;
    remoteId: number;
    hash: string;
};
/**  A remote-originated update for JS to apply to an existing local id. */
type PullUpdate = {
    localId: number;
    patch: SyncPatch;
};
/**  The questions one procedure is answering, taken together. */
type QueryActivity = {
    /**  The procedure answering. */
    entry: string;
    /**  Requests outstanding at this instant. */
    inflight: number;
    /**  The most requests it may keep outstanding. */
    inflightLimit: number;
    /**  Requests retried so far by the queries in flight. */
    retries: number;
};
/**
 *  What one attempt charges the bucket: the call itself, or one per row in its batch
 *  (for APIs that bill multi-row requests per row).
 */
type RateCost = "request" | "row";
/**  Token bucket: `units` calls per `per_ms` milliseconds, refilled continuously. */
type RateSpec = {
    units: number;
    perMs: number;
    cost?: RateCost;
};
/**  One mapping row. `hash` is the plugin's content fingerprint (opaque text to us). */
type RemoteMappingRow = {
    localId: number;
    /**  Remote ids can exceed u32 (observed ~1.2e10), so i64. */
    remoteId: number;
    hash: string;
};
/**
 *  Incremental render update sent to JS after a mutation: adds, patches, and removals.
 *  Every entry states the row's resulting selection state, so applying a delta is
 *  idempotent and the base cells and the selection overlay cannot drift apart.
 *  `full_reset` signals JS to discard all cell data and re-fetch via `store_fill_render_file`.
 */
type RenderDelta = {
    added: RenderEntry[];
    updated: RenderPatchEntry[];
    removed: CellRemoval[];
    fullReset: boolean;
};
/**  A marker appended to a render cell: position, heading, and selection state. */
type RenderEntry = {
    cell: string;
    id: number;
    lng: number;
    lat: number;
    heading: number;
    /**  `None` = drawn by the base layer, `Some(paint)` = drawn by the selection overlay. */
    sel: SelPaint | null;
    /**
     *  The slot this row vacated when it crossed cells. Present only for a move, so JS
     *  mirrors the swap-remove and carries the overlay entry across instead of inferring
     *  a move from an unrelated removed/added pair.
     */
    movedFrom: CellRemoval | null;
};
/**
 *  Update to an existing marker within its cell. Position and heading are `None` when
 *  unchanged; `sel` always states the row's current selection state, so a membership
 *  change with no movement is just a patch with no coordinates.
 */
type RenderPatchEntry = {
    cell: string;
    cellIndex: number;
    lng: number | null;
    lat: number | null;
    heading: number | null;
    sel: SelPaint | null;
};
/**
 *  Parameters for a full render rebuild. `marker_style` ("arrow" or "pin") determines
 *  whether heading angles are written. The bounding box fields are currently unused
 *  (no viewport culling -- all locations are rendered).
 */
type RenderRequest = {
    west?: number;
    south?: number;
    east?: number;
    north?: number;
    selectedIds?: number[] | null;
    markerStyle?: string;
    markerColor?: [number, number, number] | null;
};
/**  Which side won a resolved conflict; serialized as "local"/"remote". */
type ResolutionSide = "local" | "remote";
/**
 *  One location's answer from a `Collect` provider: whatever its module emitted for
 *  that row, carried as text exactly as a patch would be.
 */
type ResultEntry = {
    id: number;
    json: string;
};
/**  Retry only the listed HTTP statuses, up to `attempts` total tries. */
type RetrySpec = {
    attempts: number;
    on: number[];
};
/**
 *  Inbound payload for creating a session. `order` is the frozen worklist (must be non-empty);
 *  the cursor starts at its first id and `reviewed` starts empty.
 */
type ReviewCreate = {
    mapId: string;
    name: string;
    sourceKey: string;
    sourceProps: any;
    order: number[];
};
/**
 *  A review session as returned to the frontend. `order`/`reviewed` are decoded from the
 *  JSON-text columns; `source_props` is the originating `Selector` (opaque here).
 */
type ReviewSession = {
    id: string;
    mapId: string;
    name: string;
    sourceKey: string;
    sourceProps: any;
    order: number[];
    reviewed: number[];
    cursorId: number;
    status: string;
    createdAt: string;
    updatedAt: string;
};
/**
 *  Partial update. Any `Some` field is written; `None` leaves the column untouched.
 *  `ordering`/`reviewed` carry the full replacement arrays (used by reconciliation pruning).
 */
type ReviewUpdate = {
    id: string;
    name?: string | null;
    cursorId: number | null;
    reviewed: number[] | null;
    ordering: number[] | null;
    status: string | null;
};
/**
 *  How `store_collect` shipped its answer. A transport choice, not a projection: both
 *  variants carry the same rows, and callers take whichever arrives.
 */
type Rows = {
    kind: "inline";
    locations: Location[];
} | {
    kind: "file";
    path: string;
};
/**  Result of `store_save_dirty`: bytes written to the delta sidecar (0 = skipped). */
type SaveResult = {
    savedBytes: number;
};
type SavedSelection = {
    selector: Selector;
    /**  Tag id -> the name it carried when saved. What makes a map-local `Tag` leaf portable. */
    tagNames: {
        [key in number]: string;
    };
} & SavedSelectionInfo;
/**
 *  A rule's identity and label, with no tree attached. What the UI lists and holds; the
 *  body is a separate read because a single `Polygon` leaf can carry a country border's
 *  coordinates (~1.7MB of JSON at the heavy border detail).
 */
type SavedSelectionInfo = {
    id: string;
    name: string;
    color: [number, number, number];
    createdAt: string;
};
/**
 *  Score bounding box: either `"auto"` (computed from locations) or an
 *  explicit `[south, west, north, east]` rectangle.
 */
type ScoreBounds = string | [number, number, number, number];
/**  A panorama visit record as returned to the frontend. */
type SeenEntry = {
    id: number;
    panoId: string;
    lat: number;
    lng: number;
    heading: number;
    pitch: number;
    zoom: number;
    enteredAt: number;
    mapId: string | null;
    locationId: number | null;
    countryCode: string | null;
    address: string | null;
    thumbnail: string | null;
};
/**
 *  Optional filters for seen-history queries. All fields are AND-combined.
 *  `search` does a substring match on the `address` column.
 */
type SeenFilter = {
    country?: string | null;
    mapId?: string | null;
    search?: string | null;
};
/**
 *  Map id + display name pair for the "filter by map" dropdown.
 *  Name is resolved from the `maps` table when available, falling back to raw id.
 */
type SeenMapInfo = {
    id: string;
    name: string;
};
/**
 *  Inbound payload for recording a new panorama visit. Same shape as `SeenEntry`
 *  minus the auto-assigned `id`.
 */
type SeenWriteEntry = {
    panoId: string;
    lat: number;
    lng: number;
    heading: number;
    pitch: number;
    zoom: number;
    enteredAt: number;
    mapId: string | null;
    locationId: number | null;
    countryCode: string | null;
    address: string | null;
    thumbnail: string | null;
};
/**
 *  The selection drawing a row: its colour, and its index in `SelectionState::resolved`.
 *  The index is the draw order — a later selection overdraws an earlier one — so the
 *  overlay can be ordered by it instead of by whatever order rows happen to arrive in.
 *  Every marker sits at z=0 in one deck.gl layer, so buffer order is the only z there is.
 */
type SelPaint = {
    idx: number;
    color: [number, number, number];
};
/**
 *  A named, colored selection. `key` is deterministic (e.g., `"tag:5"`, `"polygon:abc"`)
 *  so JS can diff selections across syncs. `color` is the RGB overlay color.
 */
type Selection = {
    key: string;
    color: [number, number, number];
    selector: Selector;
};
/**  Input for `store_sync_selections`: selection criteria + display color. */
type SelectionInput = {
    /**  Deterministic selection key (e.g. `"tag:5"`), used to return per-node counts back keyed. */
    key: string;
    selector: Selector;
    color: [number, number, number];
    /**  Counted, but kept out of the overlay and the selected set. */
    ghosted?: boolean;
};
/**
 *  Selection bitmask sync payload. `bitmask` carries the packed per-cell bitmask bytes
 *  inline in the IPC response (no shared temp file → no clobber race under concurrent
 *  mutations). `None` when nothing changed. `counts` gives per-selection match counts.
 */
type SelectionSync = {
    /**  Resolved count per selection node, keyed by `Selection.key` (top-level and nested). */
    counts: {
        [key in string]: number;
    };
    bitmask: number[] | null;
    selectedCount: number;
};
/**
 *  Discriminated union of all selection types. Serialized with `{ "type": "..." }` tag
 *  for JS interop. Simple types (Tag, Untagged, PanoIds, etc.) resolve in O(N) with
 *   parallel batch scans. Composites (Intersection, Union, Invert) recursively resolve
 *  children. Duplicates uses a grid-accelerated spatial scan.
 */
type Selector = {
    type: "Locations";
    locations: number[];
    name: string | null;
} | {
    type: "Everything";
} | {
    type: "Polygon";
    polygon: PolygonGeometry;
    includeInformational: boolean;
} | {
    type: "Tag";
    tagId: number;
} | {
    type: "Untagged";
} | {
    type: "Unpanned";
} | {
    type: "PanoIds";
} | {
    type: "NotPanoIds";
} | {
    type: "Uncommitted";
} | {
    type: "Manual";
    locations: number[];
} | {
    type: "Duplicates";
    distance: number;
} | {
    type: "ValidationState";
    locations: number[];
    state: number;
} | {
    type: "Reviewed";
    locations: number[];
    sessionId: string;
    mode: string;
} | {
    type: "Intersection";
    selections: Selection[];
} | {
    type: "Union";
    selections: Selection[];
} | {
    type: "Invert";
    selections: Selection[];
} | {
    type: "Filter";
    field: string;
    op: FilterOp;
    value: any;
    value2?: any | null;
    tzLocal?: boolean;
} | 
/**
 *  Rank a selection by a `field_expr`, optionally keeping only the first `k`. Emits
 *  a ranked root in rank order, where every other selector answers ascending. With no
 *  `k` this selects its child unchanged and states only how to walk it. A member the
 *  expression cannot score ranks last, so ranking never drops anything.
 */
{
    type: "Ranked";
    /**  What to rank; `None` ranks the whole map. */
    selection: Selection | null;
    expr: string;
    k: number | null;
    ascending: boolean;
};
type SideCounts = {
    create: number;
    update: number;
    delete: number;
};
type SidecarDone = {
    reqId: number;
    error: string | null;
};
type SidecarLine = {
    reqId: number;
    line: string;
};
/**  Same shape as [`SidecarLine`]; distinct so the two event channels can't be cross-wired. */
type SidecarLog = {
    reqId: number;
    line: string;
};
type SidecarProgress = {
    pluginId: string;
    downloaded: number;
    total: number;
};
/**
 *  Where a provider's results go. `Patch` applies them to the locations they name;
 *  `Collect` delivers them to the caller and writes nothing. The declaration decides
 *  this, never the contents of a result.
 */
type Sink = "patch" | "collect";
/**
 *  `pick_spaced`'s answer: the picked ids plus the spacing achieved (count mode) or
 *  enforced (distance mode).
 */
type SpacedPickResult = {
    ids: number[];
    distanceM: number;
};
/**
 *  Metadata snapshot returned to JS after every mutation. JS uses `version` to
 *  detect stale responses and `canUndo`/`canRedo` for toolbar button state.
 *  `known_field_keys` lists every extra-field key that exists in location data
 *  on this map. Add-only within a session; seeded from `MapMeta.extra.fields`
 *  on map open.
 */
type StoreStatus = {
    version: number;
    locationCount: number;
    canUndo: boolean;
    canRedo: boolean;
    /**
     *  `None` when the mutation did not change any tag count (`finish_mutation`
     *  strips it), so JS keeps its reference and consumers skip re-rendering.
     */
    tagCounts: {
        [key in number]: number;
    } | null;
    knownFieldKeys: string[];
};
/**  A warning the store raised. The sentence is TypeScript's to write. */
type StoreWarning = {
    kind: "deltaSetAside";
};
/**  Lightweight status for polling: count, version, and whether unsaved changes exist. */
type SummaryResult = {
    locationCount: number;
    version: number;
    dirtyCount: number;
};
/**
 *  Only the fields a pull genuinely changes. A field the provider cannot represent reads as empty
 *  on the remote side and must not overwrite local data, so absent fields are left untouched.
 *  `pano_id` applies only when `pano_id_set` is true (a cleared panoId is a real change to `null`).
 */
type SyncPatch = {
    lat: number | null;
    lng: number | null;
    heading: number | null;
    pitch: number | null;
    zoom: number | null;
    panoIdSet: boolean;
    panoId: string | null;
    flags: number | null;
    tags: string[] | null;
};
/**  Everything the reconcile settled to, for the JS side. Every array is empty on an unchanged map. */
type SyncReconcileResult = {
    /**  Remote-applied counts; mirror-from-local deletes fold into `delete`. */
    pushed: SideCounts;
    /**  Local-applied counts; mirror-from-remote deletes fold into `delete`. */
    pulled: SideCounts;
    adopted: number;
    conflicts: Conflict[];
    neededTags: string[];
    pullCreates: PullCreate[];
    pullUpdates: PullUpdate[];
    pullDeleteIds: number[];
    mirrorLocalDeleteIds: number[];
};
/**
 *  A user-defined label that can be applied to any number of locations.
 *
 *  Tags are stored in `MapMeta` and referenced by id in each `Location.tags`.
 *  The `count` field is maintained by callers during batch mutations, not by
 *  the overlay add/remove methods.
 */
type Tag = {
    id: number;
    name: string;
    /**
     *  Hex color string (e.g. "#3a7fc2"). Generated deterministically from
     *  the tag name via `util::color_for_name` when not explicitly set.
     */
    color: string;
    visible?: boolean;
    /**
     *  Display order in the sidebar tag list. `None` for legacy tags
     *  that predate ordered insertion.
     */
    order?: number | null;
    /**
     *  Number of locations currently carrying this tag. Denormalized for
     *  fast sidebar display -- kept in sync by callers after batch edits.
     */
    count?: number;
    /**
     *  Document links from the map JSON's `extra.tags[name].doclinks` --
     *  URLs into external docs (e.g. Google Docs heading links). Read-only
     *  in the app; round-trips through import/export.
     */
    doclinks?: string[];
};
/**  Patchable fields of a `Tag`. Subset by design: id/count/visible aren't editable here. */
type TagPatch = {
    name?: string | null;
    color?: string | null;
    /**  Full replacement for the tag's doclink URLs (empty vec clears). */
    doclinks?: string[] | null;
};
/**
 *  Generic `{id, patch}` update envelope, parameterized by the patch type. Specta
 *  has no `Partial<T>`, and a patch is a deliberate *subset* of patchable fields, so
 *  each entity names its own patch struct (e.g. `TagPatch`) rather than deriving one.
 */
type Update<P> = {
    id: number;
    patch: P;
};
type UpdateAvailable = {
    version: string;
    currentVersion: string;
    notes: string | null;
};
/**  Download progress, emitted per chunk. `total` is absent when the server sends no length. */
type UpdateProgress = {
    downloaded: number;
    total: number | null;
};
/**  How far behind one country's downloaded coverage data is. */
type ValiCountryStatus = {
    countryCode: string;
    files: number;
    bytes: number;
};
type ValiLocation_Deserialize = {
    lat: number;
    lng: number;
    heading: number;
    zoom: number | null;
    pitch: number | null;
    panoId: string | null;
    tags: string[];
};
type ValiLocation = {
    lat: number;
    lng: number;
    heading: number;
    zoom?: number | null;
    pitch?: number | null;
    panoId?: string | null;
    tags: string[];
};
type ValiProgress = {
    kind: "workItems";
    total: number;
} | {
    kind: "workItemDone";
    countryCode: string;
    subdivisionCode: string | null;
    done: number;
    total: number;
} | {
    kind: "countryDownloadStarted";
    countryCode: string;
    files: number;
    bytes: number;
    updates: boolean;
} | {
    kind: "fileDownloaded";
    countryCode: string;
    name: string;
    bytes: number;
};
/**
 *  Per-map config for a virtual tag-tree node — a folder node with no underlying
 *  tag (e.g. "a" when only "a/b" and "a/c" exist). Keyed by the node's full slash
 *  path in `MapSettings::virtual_tags`. Tree-view only; never creates a real tag.
 */
type VirtualTag = {
    color?: string | null;
};

/** Street View camera orientation (POV). */
export type LocationPOV = Pick<Location, "heading" | "pitch" | "zoom">;
/** The camera fields a Location and the live Street View viewer share. */
export type PanoCapture = LocationPOV & Pick<Location, "lat" | "lng" | "panoId">;
export type LatLng = google.maps.LatLngLiteral;
export type Bounds = google.maps.LatLngBoundsLiteral;
declare function isWorldBounds(b: Bounds): boolean;
declare function scoreTupleToBounds([s, w, n, e]: [number, number, number, number]): Bounds;
declare function bboxTupleToBounds(t: [number, number, number, number] | null): Bounds | null;
declare function boundsToScoreTuple(b: Bounds): [number, number, number, number];
declare const enum LocationFlag {
    None = 0,
    LoadAsPanoId = 1,
    Informational = 2,
    ImportPreview = 4,
    SeenOverlay = 8
}
/** Mask of the virtual-only kind bits, to clear when turning a preview into a real location. */
declare const VIRTUAL_FLAGS: number;
/** Panorama source type from Google's internal metadata. */
declare const enum PanoType {
    Official = 2,
    Unknown = 3,
    UserUploaded = 10
}
/** Outcome of a Street View coverage check, as `validate` answers it per row. */
declare enum ValidationState {
    Ok = 0,
    UpdateAvailable = 1,
    UpdateApplied = 2,
    NotFound = 3,
    PanoIdBroke = 4,
    Unofficial = 5,
    GoodcamAvailable = 6
}
/** The `extra` fields an enrichment run derives for a pano, from `panoFields`. */
export interface PanoExtra {
    altitude: number;
    panoType: PanoType;
    /** Null when the tile height matches no known generation. */
    cameraType: CameraType | null;
    countryCode: string | null;
    uploaderName: string | null;
    /** Capture-time driving direction in degrees (0-360), per Google. */
    drivingDirection: number | null;
    /** Capture month as `YYYY-MM`; null when the pano carries no date. */
    imageDate: string | null;
    /** Every capture month in the pano's timeline, ascending. */
    coverageDates: string[];
}
/** One decoded GetMetadata image: flat, plain JSON, no live objects. This is the app's
 *  panorama, not a transcription of the Maps JS API's. Anything derivable from these
 *  fields is a function in `@/lib/sv/getMetadata`, not a field here. */
export interface Pano {
    /** This image's own pano id, "" when the response carries no key. */
    pano: string;
    /** Which imagery collection the id belongs to; also what `extra.panoType` stores. */
    panoFrontend: PanoType;
    lat: number;
    lng: number;
    altitude: number;
    /** The camera's orientation. The Maps JS API builds its whole tile frame out of this. */
    pov: {
        heading: number;
        tilt: number;
        roll: number;
    } | null;
    worldSize: {
        width: number;
        height: number;
    };
    tileSize: {
        width: number;
        height: number;
    };
    copyright: string;
    /** `description.description[].text`, joined with ", ". */
    description: string;
    /** The first of those parts alone, which is what the Maps JS API calls the short description. */
    shortDescription: string;
    uploaderName: string | null;
    countryCode: string | null;
    /** Non-null marks an indoor/tripod pano; a level carrying no id still counts. */
    levelId: number | null;
    /** Neighbouring panos, resolved to ids. */
    links: {
        pano: string;
        heading: number;
    }[];
    /** Capture timeline, ascending. `date` is the civil day, `YYYY-MM-DD`. */
    time: {
        pano: string;
        date: string;
    }[];
    /** This image's own capture date; month and day are 0 when absent. */
    date: {
        year: number;
        month: number;
        day: number;
    } | null;
    /** "launch" = car, "scout" = the special-collects pipeline. */
    source: string | null;
}
declare function hasLoadAsPanoId(loc: Location): boolean;
declare function isInformational(loc: Location): boolean;
declare function isPinnedToPano(loc: Location): boolean;
/** Virtual locations exist only ephemerally as the single active-location preview — never in
 *  the map. They display like real locations but every mutate path no-ops. Identity is a unique
 *  negative id (so id-only checks work); the kind rides in `flags` (read where you hold the
 *  full Location). */
declare function isVirtualLocation(loc: {
    id: number;
}): boolean;
/** A location you already hold in full, or just its id to fetch on demand.
 *  Lets the pick -> activate path carry "materialized or not" as plain data;
 *  `resolveLocation` (in the store) fetches only the id case. */
export type MaybeLocation = Location | number;
declare function locId(m: MaybeLocation): number;
declare function isImportPreview(loc: Location): boolean;
declare function isSeenPreview(loc: Location): boolean;
/** Build a Location from lat/lng plus overrides. `id` stays 0 until `addLocations`
 *  writes the real id back into the object. */
declare function createLocation(partial: Partial<Location> & LatLng): Location;
/** A new Location at the viewer's live camera, carrying `source`'s flags, provider, and
 *  the given tags. `extra` describes the pano it was fetched for, so it only survives a
 *  drop that stayed on that pano. */
declare function dropLocation(source: Location, live: PanoCapture, panoId: string | null, tags: number[]): Location;
/** Apply a LocationPatch JS-side, mirroring Rust's `overlay_update`: `extra` is a
 *  JSON Merge Patch (RFC 7386) — keys shallow-merge, a null value deletes its key,
 *  and a null patch clears extra entirely. */
declare function applyLocationPatch(loc: Location, patch: LocationPatch_Deserialize): Location;
export type SortMode = "name" | "created" | "opened" | "amount";
export type TagSortMode = "default" | "name" | "amount";
export type WorkArea = "overview" | "location" | "duplicates" | "import" | "plugin" | "providers" | "diff";
/** Hex like "#1098ad"; legacy stored prefs may hold an Open Props ramp name. */
export type SvColor = string;
export type MapTypeKey = "map" | "satellite" | "osm" | "vector";
export type SvCoverageType = "official" | "unofficial" | "default";
export type SvThickness = "default" | "high";
export type MarkerStyle = "pin" | "circle" | "arrow";

export type types_Bounds = Bounds;
export type types_LatLng = LatLng;
export type types_LocationFlag = LocationFlag;
declare const types_LocationFlag: typeof LocationFlag;
export type types_LocationPOV = LocationPOV;
export type types_MapTypeKey = MapTypeKey;
export type types_MarkerStyle = MarkerStyle;
export type types_MaybeLocation = MaybeLocation;
export type types_Pano = Pano;
export type types_PanoCapture = PanoCapture;
export type types_PanoExtra = PanoExtra;
export type types_PanoType = PanoType;
declare const types_PanoType: typeof PanoType;
export type types_SortMode = SortMode;
export type types_SvColor = SvColor;
export type types_SvCoverageType = SvCoverageType;
export type types_SvThickness = SvThickness;
export type types_TagSortMode = TagSortMode;
declare const types_VIRTUAL_FLAGS: typeof VIRTUAL_FLAGS;
export type types_ValidationState = ValidationState;
declare const types_ValidationState: typeof ValidationState;
export type types_WorkArea = WorkArea;
declare const types_applyLocationPatch: typeof applyLocationPatch;
declare const types_bboxTupleToBounds: typeof bboxTupleToBounds;
declare const types_boundsToScoreTuple: typeof boundsToScoreTuple;
declare const types_createLocation: typeof createLocation;
declare const types_dropLocation: typeof dropLocation;
declare const types_hasLoadAsPanoId: typeof hasLoadAsPanoId;
declare const types_isImportPreview: typeof isImportPreview;
declare const types_isInformational: typeof isInformational;
declare const types_isPinnedToPano: typeof isPinnedToPano;
declare const types_isSeenPreview: typeof isSeenPreview;
declare const types_isVirtualLocation: typeof isVirtualLocation;
declare const types_isWorldBounds: typeof isWorldBounds;
declare const types_locId: typeof locId;
declare const types_scoreTupleToBounds: typeof scoreTupleToBounds;
declare namespace types {
  export { types_LocationFlag as LocationFlag, types_PanoType as PanoType, types_VIRTUAL_FLAGS as VIRTUAL_FLAGS, types_ValidationState as ValidationState, types_applyLocationPatch as applyLocationPatch, types_bboxTupleToBounds as bboxTupleToBounds, types_boundsToScoreTuple as boundsToScoreTuple, types_createLocation as createLocation, types_dropLocation as dropLocation, types_hasLoadAsPanoId as hasLoadAsPanoId, types_isImportPreview as isImportPreview, types_isInformational as isInformational, types_isPinnedToPano as isPinnedToPano, types_isSeenPreview as isSeenPreview, types_isVirtualLocation as isVirtualLocation, types_isWorldBounds as isWorldBounds, types_locId as locId, types_scoreTupleToBounds as scoreTupleToBounds };
  export type { types_Bounds as Bounds, types_LatLng as LatLng, types_LocationPOV as LocationPOV, types_MapTypeKey as MapTypeKey, types_MarkerStyle as MarkerStyle, types_MaybeLocation as MaybeLocation, types_Pano as Pano, types_PanoCapture as PanoCapture, types_PanoExtra as PanoExtra, types_SortMode as SortMode, types_SvColor as SvColor, types_SvCoverageType as SvCoverageType, types_SvThickness as SvThickness, types_TagSortMode as TagSortMode, types_WorkArea as WorkArea };
}

/** Per-cell, per-selection membership: a dense bitmask or a sparse selected-index list. */
export type SelEntry = {
    kind: "mask";
    mask: Uint8Array;
} | {
    kind: "idx";
    indices: Uint32Array;
};
export interface SelCellEntry {
    cellChar: string;
    locCount: number;
    sels: SelEntry[];
}
/** The read-only id-membership surface shared by `Set<number>` and `SelectedIds`, for code
 *  that only needs `size` / `has` / iteration over either. */
export interface ReadonlyIdSet extends Iterable<number> {
    readonly size: number;
    has(id: number): boolean;
}
/**
 * Membership set of selected location ids, backed by a bit array indexed by id rather than a
 * hash `Set`. Location ids are dense u32s, so a bitset makes the build ~10x cheaper than 1M
 * `Set.add`s (a typed-array OR vs hashing), with O(1) `has`/`size`. Iteration yields the
 * selected ids from the overlay's id array. Exposes the Set-like surface its consumers use.
 */
declare class SelectedIds {
    private readonly bits;
    /** Count of distinct selected ids (not overlay entries — an id selected by N
     *  overlapping selections still counts once). */
    readonly size: number;
    /** Shared empty selection (no map open / cleared). */
    static readonly EMPTY: SelectedIds;
    constructor(bits: Uint8Array, 
    /** Count of distinct selected ids (not overlay entries — an id selected by N
     *  overlapping selections still counts once). */
    size: number);
    has(id: number): boolean;
    /** Yields each selected id once, ascending. Scans the bit array, so it's O(maxId/8);
     *  used by deliberate bulk consumers (export, bulk-tag, delete), not the per-frame path. */
    [Symbol.iterator](): Iterator<number>;
}
/**
 * The markers drawn by the selection overlay, keyed by location id.
 *
 * Sole authority on "is this row drawn by the overlay rather than the base layer" — the
 * base cells hold no selection state, they derive their visibility byte from `has`.
 * Presence is a bit array and id -> slot is a plain `Uint32Array`, so nothing here
 * hashes: a bulk rebuild costs one extra store per marker over writing the draw arrays
 * alone, and every by-id operation is O(1).
 *
 * Writes swap-remove, so slots land unordered — but the overlay is one deck.gl layer and
 * every marker sits at z=0, which makes slot order the only z-stacking there is. `order()`
 * puts the slots back in selection order, and the batch entry points call it once they
 * settle. Nothing else may hand these arrays to a layer.
 */
declare class SelectionOverlay {
    positions: Float32Array<ArrayBuffer>;
    colors: Uint8Array<ArrayBuffer>;
    angles: Float32Array<ArrayBuffer>;
    ids: Uint32Array<ArrayBuffer>;
    /** Per-entry index of the selection drawing it, and the sort key `order()` uses.
     *  CPU-side bookkeeping like `ids` — never an attribute, never uploaded. */
    sel: Uint32Array<ArrayBuffer>;
    count: number;
    version: number;
    private capacity;
    private bits;
    /** id -> slot. Only meaningful where `bits` is set, so it needs no empty sentinel. */
    private slot;
    /** Scratch for `order()`: entry -> destination slot. Reused across calls. */
    private dest;
    has(id: number): boolean;
    /** Add `id` to the overlay, or restate an existing entry. `selIdx` is the drawing
     *  selection's index — the sort key `order()` needs, which no caller can recover from
     *  the colour alone once two selections share one. */
    set(id: number, lng: number, lat: number, heading: number, color: readonly [number, number, number], selIdx: number): void;
    /** Follow a row that moved. No-op when the row isn't in the overlay. */
    move(id: number, lng?: number, lat?: number, heading?: number): void;
    delete(id: number): void;
    clear(): void;
    /**
     * Sort the entries by selection index, so a later selection's markers overdraw an
     * earlier one's everywhere rather than wherever slot order happens to favour them.
     *
     * Counting sort: the key is a small dense integer, so it is two O(n) passes and an
     * array sized by the selection count. The leading scan makes the cases that need no
     * work — already ordered, or one selection in play — a single pass with no allocation,
     * which covers a plain single-selection map entirely.
     */
    order(): void;
    /** Exchange two slots, keeping `slot` pointing at where each id actually lives. */
    private swap;
    /** Snapshot of the selected ids. Copies the bit array so later edits can't mutate it. */
    selectedIds(): SelectedIds;
    /** Replace every entry with arrays sliced straight out of Rust's render binary, which
     *  ships them in emission order, then put them in selection order. */
    load(positions: Float32Array<ArrayBuffer>, colors: Uint8Array<ArrayBuffer>, angles: Float32Array<ArrayBuffer>, ids: Uint32Array<ArrayBuffer>, sel: Uint32Array<ArrayBuffer>, maxId: number): void;
    /** Size up front for a rebuild of known size, so `set` never reallocates mid-loop. */
    reserve(n: number, maxId: number): void;
    /** Grow the draw arrays to hold `n` entries and the id-keyed arrays to cover `maxId`. */
    private ensure;
}
/**
 * Typed-array backed buffer for one geohash cell's marker data.
 * Grows by doubling. Removals use swap-remove (O(1), order not preserved).
 * Versioned per-attribute so deck.gl can skip unchanged layers.
 */
declare class CellBuffer {
    ids: number[];
    idToIndex: Map<number, number>;
    positions: Float32Array;
    /** Per-marker visibility, 255 draws and 0 hides. Every base marker is drawn in the one
     *  global marker colour, which the layer supplies as a constant, so the only per-marker
     *  colour fact is whether a selection or the active highlight is covering it. */
    visible: Uint8Array;
    angles: Float32Array;
    count: number;
    capacity: number;
    positionVersion: number;
    colorVersion: number;
    constructor(capacity?: number);
    /** Append a marker, growing the buffer if needed. Visibility is corrected by the
     *  caller's `syncVisible` once the overlay knows about the row. */
    append(entry: RenderEntry): void;
    /** O(1) removal by swapping with the last element. Mirrors Rust's cell_remove_render. */
    swapRemove(index: number): void;
    patchPosition(index: number, lng?: number, lat?: number, heading?: number): void;
    /** Show (255) or hide (0) one marker in the base layer. */
    patchVisible(index: number, visible: number): void;
    private ensureCapacity;
}
/**
 * Owns all marker render data as 32 geohash-cell CellBuffers plus a selection overlay.
 * Initialized from a binary blob built by Rust (`initFromBinary`), then kept in sync
 * via incremental deltas (`applyDelta`) and selection bitmasks (`applySelectionBitmasks`).
 * deck.gl layers read the typed arrays directly — no JSON serialization in the render loop.
 */
declare class CellManager {
    cells: Map<string, CellBuffer>;
    totalCount: number;
    version: number;
    /** Largest location id seen — sizes the selection bitset. Monotonic (never shrinks on
     *  removal; an overestimate just over-allocates a few bytes). */
    maxId: number;
    /** The rows the selection overlay draws, and the only record of which rows are selected. */
    readonly overlay: SelectionOverlay;
    /** The row the active-location layer draws, hidden in its base cell. */
    private activeId;
    /** Parse the full render binary from Rust. Replaces all cells and the selection overlay. */
    initFromBinary(buf: ArrayBuffer): void;
    /** Scratch for `applySelectionBitmasks`: per-row winning selection index, reused across
     *  cells so a full sync does not allocate one array per cell. */
    private selWinner;
    /**
     * Apply an incremental delta. Every entry states the row's resulting selection state,
     * so the base cells and the overlay are written from one fact rather than inferred
     * from each other. Returns the affected cell keys.
     */
    applyDelta(delta: RenderDelta): Set<string>;
    /** Put the row at `cb[i]` in or out of the selection overlay and set its base visibility.
     *  Idempotent, so restating a row's current state costs nothing but is always safe.
     *  Takes the buffer and index the caller already has — `syncVisible` is for the
     *  active-location path, which only knows an id. */
    private setSelection;
    /** Set the active location, whose marker the active layer draws instead of the base cell.
     *  Returns whether the active row actually moved. */
    setActive(id: number | null): boolean;
    /**
     * A base row is hidden exactly when something else is drawing it: the selection overlay
     * or the active-location layer. The only place `visible` is decided for a single row, so
     * "selected" and "active" never have to negotiate over the byte.
     */
    private syncVisible;
    /** Map a deck.gl pick (cell + index) back to a location ID. */
    resolvePickFromCell(cellKey: string, cellIndex: number): number | null;
    /** Selected-id set, snapshotted from the overlay. */
    selectedIds(): SelectedIds;
    /** Walk every live row's id and lng/lat. Heatmap and similar overlays use this
     *  instead of re-fetching locations from the store. */
    forEachPosition(fn: (id: number, lng: number, lat: number) => void): void;
    /**
     * Decode per-cell bitmasks from Rust into the selection overlay. Selected rows are drawn
     * by the overlay in their selection's color and hidden in their base cell.
     *
     * Partial updates are supported: only the cells named in `cellEntries` are restated,
     * and overlay entries for every other cell survive untouched.
     */
    applySelectionBitmasks(selColors: [number, number, number][], cellEntries: SelCellEntry[]): SelectedIds;
    clear(): void;
}

/** Pure selection transforms. These only manipulate the JS selection tree; Rust resolves the actual bitmasks. */

/** Variants that wrap children — derived as exactly those carrying a `selections` array. */
export type CompositeType = Extract<Selector, {
    selections: Selection[];
}>["type"];
/** Composite variants that wrap exactly one child (operators, not bags). They never collapse — a
 *  one-child group is degenerate, but one child is a unary node's only valid arity. */
export type UnaryType = "Invert";
/** Composite variants that are flat n-ary groups. */
export type GroupType = Exclude<CompositeType, UnaryType>;

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
    /** Extra-field keys known to exist in location data on the current map. A mirror of
     *  Rust's registry: refreshed wholesale from `StoreStatus.knownFieldKeys` on open and
     *  on every mutation (plus that mutation's `newFieldDefs`), never maintained JS-side. */
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
/** Reactive slice of the map state. Re-renders only when the selected value's
 *  reference changes (`Object.is`), so selectors must return state fields or
 *  cached derivations — never construct a value per call. */
declare function useMapState<T>(selector: (s: MapState) => T): T;
/** Imperative snapshot of the map state. */
declare function getMapState(): Readonly<MapState>;
/** Tags that exist from the user's point of view. Raw `tags` also holds soft-deleted ghosts (count=0, visible=false, kept for undo revival) — almost nothing outside the undo/revival machinery should enumerate those. */
declare const getVisibleTags: () => Tag[];
/** Raw by-id tag lookup — includes soft-deleted ghosts so stale references
 *  (e.g. a selection whose tag just died) still resolve to a name. */
declare function getTag(id: number): Tag | undefined;
/** Defer autosave until the returned release runs. A bulk run that lands many mutations
 *  would otherwise re-serialize the whole overlay on each one; one save at the end is enough. */
declare function holdAutosave(): () => void;
/** Schedule an autosave shortly. Mutations call this automatically; debounced. */
declare function scheduleSave(): void;
declare function cancelAutosave(): void;
declare function waitForInflightPersist(): Promise<void> | null;
/** Background auto-commit after an import with autoCommit set. */
declare function scheduleAutoCommit(mapId: string, importedCount: number): void;
/** Save any unsaved changes now instead of waiting for the autosave timer. */
declare function flushSave(): Promise<void>;
/** One-time store startup. The app calls this; plugins never need to. */
declare function initStore(): Promise<void>;
/** Cross-module stopwatch for map-open latency. */
declare const mapOpen: {
    start: number;
    seen: Set<string>;
    begin(): void;
    mark(phase: string): void;
};
/** Open a map in this window, closing any currently open map first. */
declare function openMap$1(id: string): Promise<void>;
/** Close the open map, saving unsaved changes first. */
declare function closeMap$1(): Promise<void>;
/** Drop the open map without persisting anything */
declare function discardOpenMap(): void;
/** Ids of every location the selector resolves to. */
declare function resolveIds(selector: Selector): Promise<number[]>;
/** How many locations the selector resolves to, without shipping any of them. */
declare function countIn(selector: Selector): Promise<number>;
/** Bounding box `[west, south, east, north]`, or null when the selector is empty.
 *  The whole-map box is an O(1) cache hit in Rust; narrower ones scan. */
declare function fetchBounds(selector: Selector): Promise<[number, number, number, number] | null>;
/** `n` ids drawn uniformly at random, without replacement. */
declare function sampleFrom(selector: Selector, n: number): Promise<number[]>;
/** Distinct values of `field`, sorted. */
declare function fieldValues(selector: Selector, field: string): Promise<string[]>;
/** Group by a derived key and count, without shipping member ids. */
declare function countBy(selector: Selector, field: string, key: KeySpec): Promise<[string, number][]>;
/** How many locations carry each `extra` key, key-sorted. */
declare function fieldCoverage(selector: Selector): Promise<[string, number][]>;
/** Group the selected location set by a derived key - entirely in Rust, no locations fetched.
 *  Numeric bins arrive in bound order; projection keys are sorted naturally for display. */
declare function partition(field: string, key: KeySpec, selector: Selector): Promise<PartitionBucket[]>;
/** Materialize a selector's location rows -- by id, by selection, or the whole map.
 *  Rust picks the transport (inline vs staged file) by size. Missing ids are skipped.
 *  The heaviest read there is: every other projection answers without shipping rows.
 *
 *  Every row lands in webview memory, so an unscoped call costs O(map) -- at millions of
 *  locations that is the tab's whole heap. Prefer a projection, or an enrichment
 *  procedure that runs beside the data. Trusted, not policed: selector it yourself. */
declare function fetchLocations(selector: Selector): Promise<Location[]>;
/** Active (non-ghosted) selections, the default for any operational logic. */
declare const getActiveSelections: () => Selection[];
/** The live selection as a `Selector`: the union of the active selection nodes. What
 *  every "operate on the selection" call site sends -- Rust holds no notion of "selected",
 *  so the tree JS already has is the definition. */
declare function currentSelection(): Selector;
/** Overwrite the selected-id set directly, bypassing selection resolution. Rarely what you want -- prefer `addSelections`. */
declare function setSelectedLocationIds(ids: SelectedIds): void;
declare function renameMap(id: string, name: string): Promise<void>;
declare function updateMapLabels(id: string, labels: string[]): Promise<void>;
declare function updateMapMeta(patch: MapMetaPatch_Deserialize): Promise<void> | undefined;
/** Replace the map's extra-field definitions (types/labels for `Location.extra` keys). */
declare function setMapExtraFields(fields: Record<string, ExtraFieldDef>): Promise<void>;
/** Decode the inline bitmask bytes from Rust and emit to the event bus. */
declare function emitBitmask(bytes: number[]): void;
/** Run a mutation IPC, emit its render delta, sync JS state, and schedule a save. */
declare function mutate(fn: () => Promise<MutationResult>): Promise<MutationResult>;
/** Add locations to the map. Rust assigns real ids and they are written back into
 *  the passed objects -- build with `createLocation` (id 0) and read `loc.id` after. Undoable. */
declare function addLocations(locs: Location[]): Promise<void>;
/** Clone a location in place and return the new id, or null if it doesn't exist. Undoable. */
declare function duplicateLocation(id: number): Promise<number | null>;
/** Remove locations by id. Undoable. */
declare function removeLocations(ids: ReadonlyIdSet): Promise<void>;
/** Patch locations by id. Only include the fields you're changing; `extra` merges
 *  per-key (null deletes a key). Undoable by default. */
declare function updateLocations(updates: Update<LocationPatch_Deserialize>[], opts?: {
    undoable?: boolean;
}): Promise<void>;
/** Rename or merge extra-field `from` into `to` across all locations, then migrate
 *  its definition and every selection that references it. Merge ≡ rename; `winner`
 *  decides the survivor only where a location already holds `to`. */
declare function renameField(from: string, to: string, winner?: MergeWinner): Promise<void>;
/** Delete extra-field `key` from every location, its definition, and references. */
declare function deleteField(key: string): Promise<void>;
/** Rewrite a field across `selector` in Rust. */
declare function applyFieldOp(selector: Selector, op: FieldOp, recordUndo?: boolean): Promise<FieldOpResult>;
/** Toggle a selection's ghosted state and re-sync (excludes/includes it from the overlay). */
declare function toggleGhostSelection(key: string): Promise<void>;
/** "Solo" a selection: ghost every other top-level selection, keep this one visible.
 *  If it is already the only visible one, un-ghost everything (toggle back). */
declare function isolateSelection(key: string): Promise<void>;
/** Ghost every top-level selection; if all are already ghosted, un-ghost them all. */
declare function toggleGhostAllSelections(): Promise<void>;
/** Add selections to the sidebar and highlight their locations. Same-key selections replace. */
declare function addSelections(selector: Selector[]): Promise<void>;
/** No-op (no sync) when none of the keys are live selections. */
declare function removeSelections(keys: string[]): Promise<void> | undefined;
/** Clear all selections. */
declare function resetSelections(): Promise<void>;
/** Combine selections into an AND composite. `keys` null combines all top-level selections. */
declare function selectIntersection(keys?: string[] | null): Promise<void>;
/** Combine selections into an OR composite. `keys` null combines all top-level selections. */
declare function selectUnion(keys?: string[] | null): Promise<void>;
/** Wrap selections in an Invert composite (everything NOT in them). `keys` null inverts all. */
declare function selectInverse(keys?: string[] | null): Promise<void>;
/** Add or remove one location from the Manual selection (creating it if needed). */
declare function toggleManualSelection(locationId: number): Promise<void>;
/** Replace the current selection with a single Manual selection holding `count` ids picked
 *  at random from whatever is currently selected. `count` is clamped to the selection size.
 *  With `perSelection` it is a per-bucket cap: up to `count` ids from each active selection,
 *  unioned. No-op when nothing is selected. Returns the number of ids actually picked. */
declare function selectRandomFromSelection(count: number, perSelection?: boolean): Promise<number>;
/** Replace the current selection with a single Manual selection of ids picked from the
 *  current selection, spaced apart in Rust: either `count` ids maximizing spacing, or as
 *  many as fit at `minDistanceM`. With `perSelection` each active selection is picked from
 *  separately and the results unioned. No-op when the pick returns nothing. */
declare function selectSpacedFromSelection(opts: {
    count?: number;
    minDistanceM?: number;
}, perSelection?: boolean): Promise<{
    picked: number;
    distanceM: number;
}>;
/** Read-only preview of transitive duplicate groups (size >= 2) within `distance` metres. */
declare function previewDuplicateGroups(distance: number): Promise<number[][]>;
/** Merge each transitive duplicate group into one survivor (tags unioned), ranked by the
 *  map's duplicate preference. One undoable edit. */
declare function mergeDuplicates(distance: number): Promise<void>;
/**
 * Prune duplicates within a resolved selection: keeps the most relevant location per
 * cluster (<= 25m) or thins to enforce spacing (> 25m). Returns the number pruned.
 */
declare function pruneDuplicates(selector: Selector, distance: number): Promise<number>;
/** Edit an existing filter (or any selection) in place by key, preserving its
 *  position inside any AND/OR/Invert composite. Carries ghost state to the new key. */
declare function updateFilterSelection(oldKey: string, selector: Selector): Promise<void>;
/** Rename a polygon selection. */
declare function setPolygonName(key: string, name: string): Promise<void>;
/** Set the highlight color of selections, by key. */
declare function setSelectionColors(entries: {
    key: string;
    color: [number, number, number];
}[]): void;
/** Move a selection before/after another in the sidebar order. */
declare function reorderSelection(fromKey: string, toKey: string, position: "before" | "after"): void;
/** Nest existing selections under a new AND/OR/Invert composite. */
declare function composeSelections(dragKey: string, dropKey: string, mode: GroupType, dragParent: string | null, dropParent: string | null): void;
/** Pull a child out of a composite back to the top level. */
declare function decomposeChild(parentKey: string, childKey: string): void;
/** Delete a child from a composite (without re-adding it at the top level). */
declare function removeChildFromSelection(parentKey: string, childKey: string): void;
/** Toggle tag selections on/off for the given tags (used by tag-pill clicks). */
declare function toggleTagSelections(tagIds: number[]): void;
/** Tag ids that currently have a Tag selection (cached; keyed on the selection list,
 *  identity-stable while the set of ids is unchanged). */
declare const getSelectedTagIds: () => ReadonlySet<number>;
/** Tag ids of every Tag leaf in the active selection tree, in list order --
 *  composite children included, ghosted selections excluded, ids may repeat.
 *  Deep counterpart of getSelectedTagIds (top-level only, as a set). */
declare const getSelectedTagIdsDeep: () => readonly number[];
/** Open a staged-import location read-only, "as if" it were active. The location becomes
 *  virtual (negative id; ImportPreview flag) so identity and mutate-guards derive from it. */
declare function openStagedLocation(index: number): Promise<void>;
/** Open an arbitrary location read-only as a virtual seen-preview: loads its pano without
 *  adding anything to the map. The caller sets LoadAsPanoId so the exact pano resolves. */
declare function previewVirtualLocation(loc: Location): void;
/** Materialize a `MaybeLocation`. */
declare function resolveLocation(m: MaybeLocation): Promise<Location | null>;
/** Open a location in the editor (null closes it). With `checkDuplicates`, opening a spot
 *  with 2+ locations within 2m opens the duplicate-resolution panel instead. */
declare function setActiveLocation(target: MaybeLocation | null, checkDuplicates?: boolean): Promise<void>;
/** Open one location from the duplicate-resolution panel in the editor. */
declare function openDuplicateLocation(loc: Location): void;
/** Drop a location from the duplicate-resolution panel (does not delete it). */
declare function removeDuplicate(id: number): void;
/** Close the duplicate-resolution panel and return to the overview. */
declare function closeDuplicates(): void;
/** Transition the editor pane, enforcing state invariants:
 *  leaving "location" clears the active location, leaving "plugin" clears the plugin id. */
declare function setWorkArea(area: WorkArea): void;
/** Open a plugin's sidebar (switches the editor pane to "plugin"). */
declare function setPluginMode(pluginId: string): void;
/** Close the plugin sidebar and return to the overview. */
declare function exitPluginMode(): void;
/** Toggle the alt-providers work area (Apple/Baidu/Tencent/Yandex settings). */
declare function toggleProvidersMode(): void;
declare function exitProvidersMode(): void;
/** Get-or-create tags by name. Returns the tag objects for use
 *  in subsequent location updates. Idempotent — existing tags are returned
 *  as-is, new names get auto-generated colors.
 *
 *  Pass `selector` to assign the tags to those locations in the same mutation. Prefer that
 *  over a follow-up `addTagToLocations`: it is one round trip instead of three, and the
 *  tag never renders at count 0 in between. The default assigns nothing. */
declare function createTags(names: string[], selector?: Selector): Promise<Tag[]>;
/** Rename or recolor tags. If a rename collides with an existing tag name
 *  (case-insensitive), the two tags are merged — all locations are remapped
 *  to the survivor. */
declare function updateTags(updates: Update<TagPatch>[]): Promise<void>;
/** Delete tags and strip them from all locations. Undoable (the location
 *  changes are in the undo stack; visibility auto-restores on undo). */
declare function deleteTags(tagIds: number[]): Promise<void>;
/** Persist a new tag display order. */
declare function reorderTags(orderedIds: number[]): Promise<void>;
/** Add a tag to locations (skips ones that already have it). Undoable. */
declare function addTagToLocations(tagId: number, locationIds: number[]): Promise<void>;
/** Remove a tag from the given locations. Undoable. */
declare function removeTagFromLocations(tagId: number, locationIds: number[]): Promise<void>;
/** Remove a tag from every location that has it. Undoable. */
declare function removeTagFromAllLocations(tagId: number): Promise<void>;
/** Undo the last edit. */
declare function undo(): Promise<void>;
/** Redo the last undone edit. */
declare function redo(): Promise<void>;
/** Bake overlay, write the commit delta, create a VCS commit. Resets undo stack. */
declare function commitMap(message?: string): Promise<string>;
/** Restore the map to a previous commit's state and reopen it. Clears undo/redo. */
declare function checkoutCommit(commitId: string): Promise<void>;

export type store_MapState = MapState;
declare const store_addLocations: typeof addLocations;
declare const store_addSelections: typeof addSelections;
declare const store_addTagToLocations: typeof addTagToLocations;
declare const store_applyFieldOp: typeof applyFieldOp;
declare const store_cancelAutosave: typeof cancelAutosave;
declare const store_checkoutCommit: typeof checkoutCommit;
declare const store_closeDuplicates: typeof closeDuplicates;
declare const store_commitMap: typeof commitMap;
declare const store_composeSelections: typeof composeSelections;
declare const store_countBy: typeof countBy;
declare const store_countIn: typeof countIn;
declare const store_createTags: typeof createTags;
declare const store_currentSelection: typeof currentSelection;
declare const store_decomposeChild: typeof decomposeChild;
declare const store_deleteField: typeof deleteField;
declare const store_deleteTags: typeof deleteTags;
declare const store_discardOpenMap: typeof discardOpenMap;
declare const store_duplicateLocation: typeof duplicateLocation;
declare const store_emitBitmask: typeof emitBitmask;
declare const store_exitPluginMode: typeof exitPluginMode;
declare const store_exitProvidersMode: typeof exitProvidersMode;
declare const store_fetchBounds: typeof fetchBounds;
declare const store_fetchLocations: typeof fetchLocations;
declare const store_fieldCoverage: typeof fieldCoverage;
declare const store_fieldValues: typeof fieldValues;
declare const store_flushSave: typeof flushSave;
declare const store_getActiveSelections: typeof getActiveSelections;
declare const store_getMapState: typeof getMapState;
declare const store_getSelectedTagIds: typeof getSelectedTagIds;
declare const store_getSelectedTagIdsDeep: typeof getSelectedTagIdsDeep;
declare const store_getTag: typeof getTag;
declare const store_getVisibleTags: typeof getVisibleTags;
declare const store_holdAutosave: typeof holdAutosave;
declare const store_initStore: typeof initStore;
declare const store_isolateSelection: typeof isolateSelection;
declare const store_mapOpen: typeof mapOpen;
declare const store_mergeDuplicates: typeof mergeDuplicates;
declare const store_mutate: typeof mutate;
declare const store_openDuplicateLocation: typeof openDuplicateLocation;
declare const store_openStagedLocation: typeof openStagedLocation;
declare const store_partition: typeof partition;
declare const store_previewDuplicateGroups: typeof previewDuplicateGroups;
declare const store_previewVirtualLocation: typeof previewVirtualLocation;
declare const store_pruneDuplicates: typeof pruneDuplicates;
declare const store_redo: typeof redo;
declare const store_removeChildFromSelection: typeof removeChildFromSelection;
declare const store_removeDuplicate: typeof removeDuplicate;
declare const store_removeLocations: typeof removeLocations;
declare const store_removeSelections: typeof removeSelections;
declare const store_removeTagFromAllLocations: typeof removeTagFromAllLocations;
declare const store_removeTagFromLocations: typeof removeTagFromLocations;
declare const store_renameField: typeof renameField;
declare const store_renameMap: typeof renameMap;
declare const store_reorderSelection: typeof reorderSelection;
declare const store_reorderTags: typeof reorderTags;
declare const store_resetSelections: typeof resetSelections;
declare const store_resolveIds: typeof resolveIds;
declare const store_resolveLocation: typeof resolveLocation;
declare const store_sampleFrom: typeof sampleFrom;
declare const store_scheduleAutoCommit: typeof scheduleAutoCommit;
declare const store_scheduleSave: typeof scheduleSave;
declare const store_selectIntersection: typeof selectIntersection;
declare const store_selectInverse: typeof selectInverse;
declare const store_selectRandomFromSelection: typeof selectRandomFromSelection;
declare const store_selectSpacedFromSelection: typeof selectSpacedFromSelection;
declare const store_selectUnion: typeof selectUnion;
declare const store_setActiveLocation: typeof setActiveLocation;
declare const store_setMapExtraFields: typeof setMapExtraFields;
declare const store_setPluginMode: typeof setPluginMode;
declare const store_setPolygonName: typeof setPolygonName;
declare const store_setSelectedLocationIds: typeof setSelectedLocationIds;
declare const store_setSelectionColors: typeof setSelectionColors;
declare const store_setWorkArea: typeof setWorkArea;
declare const store_toggleGhostAllSelections: typeof toggleGhostAllSelections;
declare const store_toggleGhostSelection: typeof toggleGhostSelection;
declare const store_toggleManualSelection: typeof toggleManualSelection;
declare const store_toggleProvidersMode: typeof toggleProvidersMode;
declare const store_toggleTagSelections: typeof toggleTagSelections;
declare const store_undo: typeof undo;
declare const store_updateFilterSelection: typeof updateFilterSelection;
declare const store_updateLocations: typeof updateLocations;
declare const store_updateMapLabels: typeof updateMapLabels;
declare const store_updateMapMeta: typeof updateMapMeta;
declare const store_updateTags: typeof updateTags;
declare const store_useMapState: typeof useMapState;
declare const store_waitForInflightPersist: typeof waitForInflightPersist;
declare namespace store {
  export { store_addLocations as addLocations, store_addSelections as addSelections, store_addTagToLocations as addTagToLocations, store_applyFieldOp as applyFieldOp, store_cancelAutosave as cancelAutosave, store_checkoutCommit as checkoutCommit, store_closeDuplicates as closeDuplicates, closeMap$1 as closeMap, store_commitMap as commitMap, store_composeSelections as composeSelections, store_countBy as countBy, store_countIn as countIn, store_createTags as createTags, store_currentSelection as currentSelection, store_decomposeChild as decomposeChild, store_deleteField as deleteField, store_deleteTags as deleteTags, store_discardOpenMap as discardOpenMap, store_duplicateLocation as duplicateLocation, store_emitBitmask as emitBitmask, store_exitPluginMode as exitPluginMode, store_exitProvidersMode as exitProvidersMode, store_fetchBounds as fetchBounds, store_fetchLocations as fetchLocations, store_fieldCoverage as fieldCoverage, store_fieldValues as fieldValues, store_flushSave as flushSave, store_getActiveSelections as getActiveSelections, store_getMapState as getMapState, store_getSelectedTagIds as getSelectedTagIds, store_getSelectedTagIdsDeep as getSelectedTagIdsDeep, store_getTag as getTag, store_getVisibleTags as getVisibleTags, store_holdAutosave as holdAutosave, store_initStore as initStore, store_isolateSelection as isolateSelection, store_mapOpen as mapOpen, store_mergeDuplicates as mergeDuplicates, store_mutate as mutate, store_openDuplicateLocation as openDuplicateLocation, openMap$1 as openMap, store_openStagedLocation as openStagedLocation, store_partition as partition, store_previewDuplicateGroups as previewDuplicateGroups, store_previewVirtualLocation as previewVirtualLocation, store_pruneDuplicates as pruneDuplicates, store_redo as redo, store_removeChildFromSelection as removeChildFromSelection, store_removeDuplicate as removeDuplicate, store_removeLocations as removeLocations, store_removeSelections as removeSelections, store_removeTagFromAllLocations as removeTagFromAllLocations, store_removeTagFromLocations as removeTagFromLocations, store_renameField as renameField, store_renameMap as renameMap, store_reorderSelection as reorderSelection, store_reorderTags as reorderTags, store_resetSelections as resetSelections, store_resolveIds as resolveIds, store_resolveLocation as resolveLocation, store_sampleFrom as sampleFrom, store_scheduleAutoCommit as scheduleAutoCommit, store_scheduleSave as scheduleSave, store_selectIntersection as selectIntersection, store_selectInverse as selectInverse, store_selectRandomFromSelection as selectRandomFromSelection, store_selectSpacedFromSelection as selectSpacedFromSelection, store_selectUnion as selectUnion, store_setActiveLocation as setActiveLocation, store_setMapExtraFields as setMapExtraFields, store_setPluginMode as setPluginMode, store_setPolygonName as setPolygonName, store_setSelectedLocationIds as setSelectedLocationIds, store_setSelectionColors as setSelectionColors, store_setWorkArea as setWorkArea, store_toggleGhostAllSelections as toggleGhostAllSelections, store_toggleGhostSelection as toggleGhostSelection, store_toggleManualSelection as toggleManualSelection, store_toggleProvidersMode as toggleProvidersMode, store_toggleTagSelections as toggleTagSelections, store_undo as undo, store_updateFilterSelection as updateFilterSelection, store_updateLocations as updateLocations, store_updateMapLabels as updateMapLabels, store_updateMapMeta as updateMapMeta, store_updateTags as updateTags, store_useMapState as useMapState, store_waitForInflightPersist as waitForInflightPersist };
  export type { store_MapState as MapState };
}

/** Saved selection rules: global, name-based, stored in SQLite.
 *
 *  A rule is one `Selector` tree plus the names its `Tag` leaves carried at save time.
 *  Tag ids are map-local, so the names are what makes a rule portable -- the tree itself
 *  is stored verbatim and re-resolved against whatever map is open. */

/** Selection types bound to the open map (raw location ids, review sessions): a rule
 *  built from them would be a frozen snapshot, so they are never saved. */
declare const MAP_LOCAL_TYPES: readonly ["Locations", "Manual", "ValidationState", "Reviewed"];
/** Saveable only if the whole tree is portable: one map-local leaf anywhere would freeze
 *  the rule to the map it was built on. */
declare function isSaveable(selector: Selector): boolean;
/** One part of a saved rule: what its chip reads as, and what it resolves to here. The
 *  label comes from the tree as saved, so a tag this map doesn't have still reads by the
 *  name it was saved under. */
export interface SavedPart {
    label: string;
    color: [number, number, number];
    selector: Selector;
}
/** A rule's parts: its top-level `Union` is the list it was saved from, anything else is
 *  a single part. */
declare function savedParts(saved: SavedSelection): SavedPart[];
/** The rules that exist, as identity only. Empty until the index arrives -- the first
 *  call starts the read and `saved-selections:changed` announces it. */
declare function getSavedSelectionIndex(): SavedSelectionInfo[];
declare function useSavedSelectionIndex(): SavedSelectionInfo[];
/** Bodies for `ids`, fetching only the ones not already held. */
declare function loadSavedSelections(ids: string[]): Promise<SavedSelection[]>;
/** Every rule with its body. */
declare function loadAllSavedSelections(): Promise<SavedSelection[]>;
/** A saved rule as a single `Selector`, resolved against the open map. Matches nothing
 *  until the body arrives; fetching it emits `saved-selections:changed`, so a caller that
 *  re-reads on that event gets the real tree. */
declare function savedSelector(id: string): Selector;
/** Persists the saveable selections as one rule. False when none of them are saveable. */
declare function saveCurrentSelections(name: string, selections: Selection[]): Promise<boolean>;
declare function deleteSavedSelection(id: string): Promise<void>;
/** Adds the rule's parts to the sidebar, resolved against the open map. Returns how many
 *  were added. */
declare function applySavedSelection(saved: SavedSelection): number;

declare const savedSelections_MAP_LOCAL_TYPES: typeof MAP_LOCAL_TYPES;
export type savedSelections_SavedPart = SavedPart;
declare const savedSelections_applySavedSelection: typeof applySavedSelection;
declare const savedSelections_deleteSavedSelection: typeof deleteSavedSelection;
declare const savedSelections_getSavedSelectionIndex: typeof getSavedSelectionIndex;
declare const savedSelections_isSaveable: typeof isSaveable;
declare const savedSelections_loadAllSavedSelections: typeof loadAllSavedSelections;
declare const savedSelections_loadSavedSelections: typeof loadSavedSelections;
declare const savedSelections_saveCurrentSelections: typeof saveCurrentSelections;
declare const savedSelections_savedParts: typeof savedParts;
declare const savedSelections_savedSelector: typeof savedSelector;
declare const savedSelections_useSavedSelectionIndex: typeof useSavedSelectionIndex;
declare namespace savedSelections {
  export { savedSelections_MAP_LOCAL_TYPES as MAP_LOCAL_TYPES, savedSelections_applySavedSelection as applySavedSelection, savedSelections_deleteSavedSelection as deleteSavedSelection, savedSelections_getSavedSelectionIndex as getSavedSelectionIndex, savedSelections_isSaveable as isSaveable, savedSelections_loadAllSavedSelections as loadAllSavedSelections, savedSelections_loadSavedSelections as loadSavedSelections, savedSelections_saveCurrentSelections as saveCurrentSelections, savedSelections_savedParts as savedParts, savedSelections_savedSelector as savedSelector, savedSelections_useSavedSelectionIndex as useSavedSelectionIndex };
  export type { savedSelections_SavedPart as SavedPart };
}

/** A localStorage-backed blob declared with its defaults at the shape definition. */
export interface PersistedStore<T> {
    key: string;
    defaults: T;
}

/** Prompt for GeoJSON file(s) and add their polygons as selections. */
declare function loadGeoJSON(): Promise<void>;

declare const requiresMap: () => boolean;
declare const hasActiveLocation: () => boolean;
declare const hasSelection: () => boolean;
declare const hasAnySelections: () => boolean;
/** Every editor command (palette entries; all are hotkey-bindable in Settings). */
declare const COMMANDS: {
    save: {
        label: "Commit map";
        icon: string;
        group: "Map";
        defaultBinding: string;
        aliases: string[];
        execute: () => void;
        enabled: () => boolean;
    };
    basemapPrev: {
        label: "Previous basemap";
        icon: string;
        group: "Map";
        defaultBinding: string;
        execute: () => void;
        enabled: typeof requiresMap;
    };
    basemapNext: {
        label: "Next basemap";
        icon: string;
        group: "Map";
        defaultBinding: string;
        execute: () => void;
        enabled: typeof requiresMap;
    };
    import: {
        label: "Import file";
        icon: string;
        group: "Map";
        execute: () => void;
        enabled: typeof requiresMap;
    };
    copyToMap: {
        label: "Copy location to map via hotkeys...";
        icon: string;
        group: "Map";
        execute: () => void;
        enabled: typeof requiresMap;
    };
    quickCopyToMap: {
        label: "Copy location to map...";
        icon: string;
        group: "Map";
        execute: () => void;
        enabled: typeof hasActiveLocation;
    };
    undo: {
        label: "Undo";
        icon: string;
        group: "Map";
        defaultBinding: string;
        execute: typeof undo;
        enabled: () => boolean;
    };
    redo: {
        label: "Redo";
        icon: string;
        group: "Map";
        defaultBinding: string;
        execute: typeof redo;
        enabled: () => boolean;
    };
    export: {
        label: "Export";
        icon: string;
        group: "Map";
        execute: () => void;
        enabled: typeof requiresMap;
    };
    "open-history": {
        label: "Open version history";
        icon: string;
        group: "Map";
        execute: () => void;
        enabled: typeof requiresMap;
    };
    "open-seen": {
        label: "Open seen locations";
        icon: string;
        group: "Map";
        execute: () => void;
        enabled: typeof requiresMap;
    };
    "toggle-seen-overlay": {
        label: "Toggle seen locations overlay";
        icon: string;
        group: "Map";
        execute: () => void;
        enabled: typeof requiresMap;
    };
    selectAll: {
        label: "Select everything";
        icon: string;
        group: "Selections";
        defaultBinding: string;
        execute: () => Promise<void>;
    };
    "select-untagged": {
        label: "Select untagged locations";
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => Promise<void>;
    };
    "select-unpanned": {
        label: "Select unpanned locations";
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
    };
    "select-panoid": {
        label: "Select Pano ID locations";
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
    };
    "select-no-panoid": {
        label: "Select non-Pano ID locations";
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
    };
    "select-uncommitted": {
        label: "Select uncommitted locations";
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
    };
    "select-reviewed": {
        label: "Select reviewed locations";
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
        enabled: typeof requiresMap;
    };
    "invert-selection": {
        label: "Invert selection";
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
    };
    "intersect-selections": {
        label: "Intersect (AND) selections";
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
    };
    "union-selections": {
        label: "Union (OR) selections";
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
    };
    "load-geojson": {
        label: "Load shapes from GeoJSON as selection";
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: typeof loadGeoJSON;
    };
    "download-polygon-geojson": {
        label: "Download polygon selections as GeoJSON";
        icon: string;
        group: "Selections";
        enabled: () => boolean;
        execute: () => void;
    };
    deselectAll: {
        label: "Deselect everything";
        icon: string;
        group: "Selections";
        defaultBinding: string;
        execute: typeof resetSelections;
        enabled: typeof hasAnySelections;
    };
    "expand-sv-links": {
        label: "Expand Street View links";
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => void;
        enabled: () => boolean;
    };
    "find-duplicates": {
        label: "Find duplicates...";
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => void;
    };
    "merge-duplicates": {
        label: "Merge duplicates...";
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => void;
    };
    "filter-by-metadata": {
        label: "Filter by metadata...";
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => void;
    };
    "top-k": {
        label: "Select top/bottom K...";
        icon: string;
        group: "Selections";
        execute: () => void;
    };
    "review-selected": {
        label: "Review selected locations";
        icon: string;
        group: "Selections";
        enabled: typeof hasSelection;
        execute: () => void;
    };
    "review-sessions": {
        label: "Review sessions";
        icon: string;
        group: "Selections";
        execute: () => void;
    };
    "select-random": {
        label: "Pick random locations from selection";
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => void;
        enabled: typeof hasSelection;
    };
    "select-spaced": {
        label: "Pick evenly spaced locations from selection";
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => void;
        enabled: typeof hasSelection;
    };
    "ghost-selections": {
        label: "Ghost selections";
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => Promise<void>;
        enabled: typeof hasAnySelections;
    };
    "save-selections": {
        label: "Save current selections...";
        icon: string;
        group: "Selections";
        execute: () => void;
        enabled: typeof hasAnySelections;
    };
    "apply-saved-selection": {
        label: "Apply saved selection...";
        icon: string;
        group: "Selections";
        execute: () => void;
    };
    "selection-delete-locations": {
        label: "Delete selected locations";
        icon: string;
        group: "Selections";
        enabled: typeof hasSelection;
        execute: () => void;
    };
    "bulk-validate": {
        label: "Validate locations";
        icon: string;
        group: "Bulk Operations";
        aliases: string[];
        execute: () => void;
    };
    "bulk-enrich": {
        label: "Enrich metadata fields";
        icon: string;
        group: "Bulk Operations";
        aliases: string[];
        execute: () => void;
    };
    "bulk-set-field": {
        label: "Set metadata field value";
        icon: string;
        group: "Bulk Operations";
        aliases: string[];
        execute: () => void;
    };
    "bulk-clear-fields": {
        label: "Clear metadata fields";
        icon: string;
        group: "Bulk Operations";
        aliases: string[];
        execute: () => void;
    };
    "bulk-pin-pano": {
        label: "Pin or unpin locations to pano ID";
        icon: string;
        group: "Bulk Operations";
        aliases: string[];
        execute: () => void;
    };
    "bulk-heading-road": {
        label: "Pan headings along road";
        icon: string;
        group: "Bulk Operations";
        aliases: string[];
        execute: () => void;
    };
    "bulk-download-panoramas": {
        label: "Download panoramas";
        icon: string;
        group: "Bulk Operations";
        aliases: string[];
        execute: () => void;
    };
    "delete-selected-tags": {
        label: "Delete selected tags";
        icon: string;
        group: "Tags";
        execute: () => Promise<void>;
        enabled: () => boolean;
    };
    "tag-download-csv": {
        label: "Download tag counts as CSV";
        icon: string;
        group: "Tags";
        execute: () => void;
    };
    "copy-tags-count": {
        label: "Copy tags count";
        icon: string;
        group: "Tags";
        aliases: string[];
        execute: () => Promise<void>;
        enabled: typeof requiresMap;
    };
    "tag-find-replace": {
        label: "Find and replace in tag names";
        icon: string;
        group: "Tags";
        aliases: string[];
        execute: () => void;
        enabled: typeof requiresMap;
    };
    "apply-field-as-tags": {
        label: "Apply metadata as tags";
        icon: string;
        group: "Tags";
        aliases: string[];
        execute: () => void;
        enabled: typeof requiresMap;
    };
    "assign-doclinks": {
        label: "Assign document links...";
        icon: string;
        group: "Tags";
        aliases: string[];
        execute: () => void;
        enabled: typeof requiresMap;
    };
};
export type CommandId = keyof typeof COMMANDS;
export type PinnedEntry = CommandId | "---" | (string & {});

export type RGB = {
    r: number;
    g: number;
    b: number;
};
/** Parse "#rrggbb" to an [r, g, b] byte tuple. Single source for hex parsing. */
declare function hexToRgb(hex: string): [number, number, number];
declare function textColorFor(bg: string): string;
/** SV line colors were historically Open Props ramp names ("cyan"); stored
 *  prefs may still hold one. Hex passes through. */
declare function resolveSvColorHex(color: string): string;
/** The app accent follows the SV coverage line color. */
declare function applyAccentColor(hex: string): void;
declare function hexToHsl(hex: string): {
    h: number;
    s: number;
    l: number;
};
declare function hslToHex(h: number, s: number, l: number): string;
declare function hslToRgb(h: number, s: number, l: number): [number, number, number];
/**
 * Deterministic tag color from a name.
 */
declare function colorForName(name: string): string;
declare function rgbCss([r, g, b]: [number, number, number]): string;
declare function hexToRgbObj(hex: string): RGB;
/** Accept the live `{r,g,b}` shape or a leftover `[r,g,b]` tuple from an older persist. */
declare function asRgb(color: unknown): RGB | null;
declare function rgbToHex(color: RGB): string;
/** A label's color: a user override if set, else a deterministic color from its name. */
declare function labelColor(name: string, overrides: Record<string, string>): string;

export type colorUtils_RGB = RGB;
declare const colorUtils_applyAccentColor: typeof applyAccentColor;
declare const colorUtils_asRgb: typeof asRgb;
declare const colorUtils_colorForName: typeof colorForName;
declare const colorUtils_hexToHsl: typeof hexToHsl;
declare const colorUtils_hexToRgb: typeof hexToRgb;
declare const colorUtils_hexToRgbObj: typeof hexToRgbObj;
declare const colorUtils_hslToHex: typeof hslToHex;
declare const colorUtils_hslToRgb: typeof hslToRgb;
declare const colorUtils_labelColor: typeof labelColor;
declare const colorUtils_resolveSvColorHex: typeof resolveSvColorHex;
declare const colorUtils_rgbCss: typeof rgbCss;
declare const colorUtils_rgbToHex: typeof rgbToHex;
declare const colorUtils_textColorFor: typeof textColorFor;
declare namespace colorUtils {
  export { colorUtils_applyAccentColor as applyAccentColor, colorUtils_asRgb as asRgb, colorUtils_colorForName as colorForName, colorUtils_hexToHsl as hexToHsl, colorUtils_hexToRgb as hexToRgb, colorUtils_hexToRgbObj as hexToRgbObj, colorUtils_hslToHex as hslToHex, colorUtils_hslToRgb as hslToRgb, colorUtils_labelColor as labelColor, colorUtils_resolveSvColorHex as resolveSvColorHex, colorUtils_rgbCss as rgbCss, colorUtils_rgbToHex as rgbToHex, colorUtils_textColorFor as textColorFor };
  export type { colorUtils_RGB as RGB };
}

/** Language names stay in their own language, the way every language picker does it -- a reader
 *  looking for their own has to recognise it without already reading English.
 *  `en-XA` is the generated pseudolocale: accented and ~40% longer, so unextracted strings and
 *  layout overflow are visible without a translator. Offered in dev builds only. */
declare const LANGUAGES: {
    readonly en: "English";
    readonly de: "Deutsch";
    readonly es: "Español";
    readonly fr: "Français";
    readonly ja: "日本語";
    readonly pl: "Polski";
    readonly ru: "Русский";
    readonly "zh-Hans": "简体中文";
    readonly "en-XA": "Pseudolocale";
};
declare const MOVEMENT_MODES: {
    readonly moving: "Moving";
    readonly "no-move": "No Move";
    readonly nmpz: "NMPZ";
};
declare const SEEN_RESOLUTIONS: {
    readonly low: "Low (160x90)";
    readonly medium: "Medium (320x180)";
    readonly high: "High (640x360)";
};
declare const EXACT_DATE_FORMATS: {
    readonly date: "Date only";
    readonly datetime: "Date + time";
};
declare const DATE_TIMEZONES: {
    readonly location: "Location timezone";
    readonly utc: "UTC";
};
declare const MAP_LIST_FIELDS: {
    readonly locationCount: "Location count";
    readonly lastOpened: "Last opened";
    readonly created: "Date created";
};
declare const DISCORD_PRESENCE_MODES: {
    readonly off: "Off";
    readonly generic: "Generic (no map name)";
    readonly full: "Full (map name + count)";
};
declare const GEOCODE_PROVIDERS: {
    readonly local: "Local (offline)";
    readonly nominatim: "Nominatim";
    readonly google: "Google (from panorama)";
};
declare const GEOCODE_PROVIDER_LABELS: Record<keyof typeof GEOCODE_PROVIDERS, string>;
declare const TAG_VIEW_MODES: {
    readonly flat: "Flat";
    readonly tree: "Tree";
};
declare const TAG_FOLDER_COLOR_MODES: {
    readonly direct: "Fixed color";
    readonly firstChild: "Inherit first child";
    readonly random: "Random";
    readonly childGradient: "Child tag gradient";
};
declare const OPACITY_TOGGLE_MODES: {
    readonly previous: "Last used opacity";
    readonly full: "Full opacity";
};
declare const POLYGON_COLOR_MODES: {
    readonly random: "Random";
    readonly fixed: "Fixed color";
};
declare const BORDER_DETAILS: {
    readonly light: "Standard (bundled)";
    readonly medium: "High ({size})";
    readonly heavy: "Ultra ({size})";
};
/** On-disk size of each downloadable archive under `data/borders/`. */
declare const BORDER_ARCHIVE_BYTES: {
    readonly medium: 7460312;
    readonly heavy: 21514464;
    readonly adm1: 56891952;
};
declare const SUBDIVISION_DETAILS: {
    readonly off: "Off";
    readonly adm1: "States / provinces";
};
/** Tag-suggestion list cap stops (slider indices); 0 = unlimited ("All"). */
declare const TAG_SUGGESTION_LIMITS: readonly [5, 10, 25, 50, 0];
declare const PREVIEW_ASPECT_RATIOS: {
    readonly "4 / 3": "4:3";
    readonly "16 / 10": "16:10";
    readonly "16 / 9": "16:9";
    readonly "21 / 9": "21:9";
    readonly "32 / 9": "32:9";
    readonly free: "Free";
};
declare const UNIT_SYSTEMS: {
    readonly auto: "Automatic";
    readonly metric: "Metric (m / km)";
    readonly imperial: "Imperial (ft / mi)";
};
export type UnitSystem = keyof typeof UNIT_SYSTEMS;
export type Language = keyof typeof LANGUAGES;
export type MovementMode = keyof typeof MOVEMENT_MODES;
declare const MOVEMENT_CYCLE: MovementMode[];
export type ExactDateFormat = keyof typeof EXACT_DATE_FORMATS;
export type DateTimezone = keyof typeof DATE_TIMEZONES;
export type SeenResolution = keyof typeof SEEN_RESOLUTIONS;
export type MapListField = keyof typeof MAP_LIST_FIELDS;
export type DiscordPresenceMode = keyof typeof DISCORD_PRESENCE_MODES;
export type GeocodeProvider = keyof typeof GEOCODE_PROVIDERS;
export type TagViewMode = keyof typeof TAG_VIEW_MODES;
export type TagFolderColorMode = keyof typeof TAG_FOLDER_COLOR_MODES;
export type OpacityToggleMode = keyof typeof OPACITY_TOGGLE_MODES;
export type PolygonColorMode = keyof typeof POLYGON_COLOR_MODES;
export type BorderDetail = keyof typeof BORDER_DETAILS;
export type SubdivisionDetail = keyof typeof SUBDIVISION_DETAILS;
export type PreviewAspectRatio = keyof typeof PREVIEW_ASPECT_RATIOS;
declare const DEFAULTS: {
    showCameraBadges: boolean;
    showLinksControl: boolean;
    clickToGo: boolean;
    showRoadLabels: boolean;
    defaultMovementMode: MovementMode;
    showCar: boolean;
    showCrosshair: boolean;
    showCompass: boolean;
    showCompassTape: boolean;
    showZoom: boolean;
    showReturnToSpawn: boolean;
    showJumpButtons: boolean;
    showMapLinks: boolean;
    showCoordinateDisplay: boolean;
    showFullscreenButton: boolean;
    showScreenshotButton: boolean;
    showPanoMetadata: boolean;
    exactDateFormat: ExactDateFormat;
    dateTimezone: DateTimezone;
    showNavArrow: boolean;
    showGroundArrow: boolean;
    hidePanoUI: boolean;
    /** Hiding the pano UI also hides navigation: link arrows, ground arrow, click-to-go X. */
    hideNavWithUI: boolean;
    fullscreenMap: boolean;
    showFullscreenMapMeta: boolean;
    showFullscreenMiniLocationPreview: boolean;
    fullscreenMiniLocationScale: number;
    showFullscreenMinimap: boolean;
    fullscreenMinimapScale: number;
    /** Milliseconds the fullscreen minimap stays expanded after the pointer leaves it. */
    fullscreenMinimapCloseDelay: number;
    showFullscreenTagbar: boolean;
    /** Tag bar dropped down to a thin strip. Toggled from the bar itself, not Settings. */
    fullscreenTagbarCollapsed: boolean;
    showFullscreenDatePicker: boolean;
    showFullscreenReviewBar: boolean;
    showFullscreenGeocode: boolean;
    customCss: string;
    enableSeen: boolean;
    enableSeenThumbnails: boolean;
    seenResolution: SeenResolution;
    mapPanSpeed: number;
    panoLookSpeed: number;
    slowModifier: number;
    showFps: boolean;
    mapListFields: MapListField[];
    /** Read once at boot; changing it relaunches the app rather than re-rendering. */
    language: Language;
    /** Reopen the maps that were open when the session last ended (main window closed). */
    restoreSession: boolean;
    /** Discord Rich Presence: off, generic (no map name), or full (map name + count). */
    discordPresence: DiscordPresenceMode;
    /** Per-label color overrides (hex), keyed by lowercased label name. Shared across all maps. */
    labelColors: Record<string, string>;
    geocodeProvider: GeocodeProvider;
    nominatimApiKey: string;
    panToImported: boolean;
    /** With no location open, Enter shows a center crosshair and opens the location under it. */
    enterOpensCenter: boolean;
    /** Min half-extent (degrees) a single pasted/imported point is padded to before fitBounds */
    pastePadding: number;
    followActiveInReview: boolean;
    markerColor: RGB;
    activeLocationColor: RGB;
    importPreviewColor: RGB;
    svTrail: boolean;
    svTrailColor: RGB;
    svTrailPosition: boolean;
    panoDotColor: RGB;
    /** Color a newly drawn polygon selection starts with. `random` hashes it from the polygon's
     *  key; `fixed` uses polygonColor. Either way it's only the initial value -- recoloring a
     *  polygon by hand still wins. */
    /** What the layer opacity hotkeys restore a layer to when toggling it back on. */
    opacityToggleMode: OpacityToggleMode;
    polygonColorMode: PolygonColorMode;
    polygonColor: RGB;
    panoDotScaled: boolean;
    tagViewMode: TagViewMode;
    /** Render each tag as the shortest path suffix that's still unique among visible tags. */
    truncateTagPaths: boolean;
    /** Tree view: how a colorless folder row gets its color. `direct` uses tagFolderColor;
     *  `firstChild` inherits the first own-colored descendant in display order,
     *  with tagFolderColor as the fallback for colorless subtrees.
     *  `random` uses a deterministic color from the folder path; `childGradient` paints
     *  a gradient from descendant tag colors (fallback: tagFolderColor). */
    tagFolderColorMode: TagFolderColorMode;
    tagFolderColor: RGB;
    tagSortMode: TagSortMode;
    /** Gap between tag pills (px), shared by flat and tree views via `--tag-gap`. */
    tagGap: number;
    animateTagReorder: boolean;
    borderDetail: BorderDetail;
    subdivisionDetail: SubdivisionDetail;
    previewAspectRatio: PreviewAspectRatio;
    tagSuggestionLimit: number;
    /** Copy-to-map hotkeys that work in every map (assigned in the copy-to-map dialog);
     *  a map's own binding on the same key shadows them. */
    globalCopyBindings: MapKeyBinding[];
    /** Local REST transport for window.MMA (Settings > Advanced). */
    remoteApi: boolean;
    remoteApiKey: string;
    pinnedCommands: PinnedEntry[];
    /** Offer GitHub pre-releases in the in-app updater. */
    prereleaseUpdates: boolean;
    units: UnitSystem;
};
export type AppSettings = typeof DEFAULTS;
/** Settings holding private information that should not be exfiltrated. */
declare const PRIVATE_SETTINGS: ReadonlySet<keyof AppSettings>;
/** App settings mirrored to CSS custom properties on `:root`. Add an entry to expose a
 *  setting to CSS; `useCssVarSettings` (App.tsx) keeps them in sync reactively. */
declare const CSS_VAR_SETTINGS: ReadonlyArray<readonly [cssVar: string, value: (s: AppSettings) => string]>;
declare const APP_SETTINGS: PersistedStore<{
    showCameraBadges: boolean;
    showLinksControl: boolean;
    clickToGo: boolean;
    showRoadLabels: boolean;
    defaultMovementMode: MovementMode;
    showCar: boolean;
    showCrosshair: boolean;
    showCompass: boolean;
    showCompassTape: boolean;
    showZoom: boolean;
    showReturnToSpawn: boolean;
    showJumpButtons: boolean;
    showMapLinks: boolean;
    showCoordinateDisplay: boolean;
    showFullscreenButton: boolean;
    showScreenshotButton: boolean;
    showPanoMetadata: boolean;
    exactDateFormat: ExactDateFormat;
    dateTimezone: DateTimezone;
    showNavArrow: boolean;
    showGroundArrow: boolean;
    hidePanoUI: boolean;
    /** Hiding the pano UI also hides navigation: link arrows, ground arrow, click-to-go X. */
    hideNavWithUI: boolean;
    fullscreenMap: boolean;
    showFullscreenMapMeta: boolean;
    showFullscreenMiniLocationPreview: boolean;
    fullscreenMiniLocationScale: number;
    showFullscreenMinimap: boolean;
    fullscreenMinimapScale: number;
    /** Milliseconds the fullscreen minimap stays expanded after the pointer leaves it. */
    fullscreenMinimapCloseDelay: number;
    showFullscreenTagbar: boolean;
    /** Tag bar dropped down to a thin strip. Toggled from the bar itself, not Settings. */
    fullscreenTagbarCollapsed: boolean;
    showFullscreenDatePicker: boolean;
    showFullscreenReviewBar: boolean;
    showFullscreenGeocode: boolean;
    customCss: string;
    enableSeen: boolean;
    enableSeenThumbnails: boolean;
    seenResolution: SeenResolution;
    mapPanSpeed: number;
    panoLookSpeed: number;
    slowModifier: number;
    showFps: boolean;
    mapListFields: MapListField[];
    /** Read once at boot; changing it relaunches the app rather than re-rendering. */
    language: Language;
    /** Reopen the maps that were open when the session last ended (main window closed). */
    restoreSession: boolean;
    /** Discord Rich Presence: off, generic (no map name), or full (map name + count). */
    discordPresence: DiscordPresenceMode;
    /** Per-label color overrides (hex), keyed by lowercased label name. Shared across all maps. */
    labelColors: Record<string, string>;
    geocodeProvider: GeocodeProvider;
    nominatimApiKey: string;
    panToImported: boolean;
    /** With no location open, Enter shows a center crosshair and opens the location under it. */
    enterOpensCenter: boolean;
    /** Min half-extent (degrees) a single pasted/imported point is padded to before fitBounds */
    pastePadding: number;
    followActiveInReview: boolean;
    markerColor: RGB;
    activeLocationColor: RGB;
    importPreviewColor: RGB;
    svTrail: boolean;
    svTrailColor: RGB;
    svTrailPosition: boolean;
    panoDotColor: RGB;
    /** Color a newly drawn polygon selection starts with. `random` hashes it from the polygon's
     *  key; `fixed` uses polygonColor. Either way it's only the initial value -- recoloring a
     *  polygon by hand still wins. */
    /** What the layer opacity hotkeys restore a layer to when toggling it back on. */
    opacityToggleMode: OpacityToggleMode;
    polygonColorMode: PolygonColorMode;
    polygonColor: RGB;
    panoDotScaled: boolean;
    tagViewMode: TagViewMode;
    /** Render each tag as the shortest path suffix that's still unique among visible tags. */
    truncateTagPaths: boolean;
    /** Tree view: how a colorless folder row gets its color. `direct` uses tagFolderColor;
     *  `firstChild` inherits the first own-colored descendant in display order,
     *  with tagFolderColor as the fallback for colorless subtrees.
     *  `random` uses a deterministic color from the folder path; `childGradient` paints
     *  a gradient from descendant tag colors (fallback: tagFolderColor). */
    tagFolderColorMode: TagFolderColorMode;
    tagFolderColor: RGB;
    tagSortMode: TagSortMode;
    /** Gap between tag pills (px), shared by flat and tree views via `--tag-gap`. */
    tagGap: number;
    animateTagReorder: boolean;
    borderDetail: BorderDetail;
    subdivisionDetail: SubdivisionDetail;
    previewAspectRatio: PreviewAspectRatio;
    tagSuggestionLimit: number;
    /** Copy-to-map hotkeys that work in every map (assigned in the copy-to-map dialog);
     *  a map's own binding on the same key shadows them. */
    globalCopyBindings: MapKeyBinding[];
    /** Local REST transport for window.MMA (Settings > Advanced). */
    remoteApi: boolean;
    remoteApiKey: string;
    pinnedCommands: PinnedEntry[];
    /** Offer GitHub pre-releases in the in-app updater. */
    prereleaseUpdates: boolean;
    units: UnitSystem;
}>;
declare function getSettings$1(): AppSettings;
/** True while the pano-UI toggle covers the navigation visuals too. */
declare function navHiddenWithUI(s: AppSettings): boolean;
/** Effective StreetViewPanorama options: how the movement mode, per-control toggles,
 *  and the hide-UI toggle compose. Sole authority for both pano creation and updates. */
declare function panoDisplayOptions(s: AppSettings): {
    linksControl: boolean;
    clickToGo: boolean;
    showRoadLabels: boolean;
    scrollwheel: boolean;
};
declare function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;
declare function resetSettings(): void;
declare function useSettings(): AppSettings;
declare function useSetting<K extends keyof AppSettings>(key: K): AppSettings[K];

declare const settings_APP_SETTINGS: typeof APP_SETTINGS;
export type settings_AppSettings = AppSettings;
declare const settings_BORDER_ARCHIVE_BYTES: typeof BORDER_ARCHIVE_BYTES;
declare const settings_BORDER_DETAILS: typeof BORDER_DETAILS;
export type settings_BorderDetail = BorderDetail;
declare const settings_CSS_VAR_SETTINGS: typeof CSS_VAR_SETTINGS;
declare const settings_DATE_TIMEZONES: typeof DATE_TIMEZONES;
declare const settings_DEFAULTS: typeof DEFAULTS;
declare const settings_DISCORD_PRESENCE_MODES: typeof DISCORD_PRESENCE_MODES;
export type settings_DateTimezone = DateTimezone;
export type settings_DiscordPresenceMode = DiscordPresenceMode;
declare const settings_EXACT_DATE_FORMATS: typeof EXACT_DATE_FORMATS;
export type settings_ExactDateFormat = ExactDateFormat;
declare const settings_GEOCODE_PROVIDERS: typeof GEOCODE_PROVIDERS;
declare const settings_GEOCODE_PROVIDER_LABELS: typeof GEOCODE_PROVIDER_LABELS;
export type settings_GeocodeProvider = GeocodeProvider;
declare const settings_LANGUAGES: typeof LANGUAGES;
export type settings_Language = Language;
declare const settings_MAP_LIST_FIELDS: typeof MAP_LIST_FIELDS;
declare const settings_MOVEMENT_CYCLE: typeof MOVEMENT_CYCLE;
declare const settings_MOVEMENT_MODES: typeof MOVEMENT_MODES;
export type settings_MapListField = MapListField;
export type settings_MovementMode = MovementMode;
declare const settings_OPACITY_TOGGLE_MODES: typeof OPACITY_TOGGLE_MODES;
export type settings_OpacityToggleMode = OpacityToggleMode;
declare const settings_POLYGON_COLOR_MODES: typeof POLYGON_COLOR_MODES;
declare const settings_PREVIEW_ASPECT_RATIOS: typeof PREVIEW_ASPECT_RATIOS;
declare const settings_PRIVATE_SETTINGS: typeof PRIVATE_SETTINGS;
export type settings_PolygonColorMode = PolygonColorMode;
export type settings_PreviewAspectRatio = PreviewAspectRatio;
declare const settings_SEEN_RESOLUTIONS: typeof SEEN_RESOLUTIONS;
declare const settings_SUBDIVISION_DETAILS: typeof SUBDIVISION_DETAILS;
export type settings_SeenResolution = SeenResolution;
export type settings_SubdivisionDetail = SubdivisionDetail;
declare const settings_TAG_FOLDER_COLOR_MODES: typeof TAG_FOLDER_COLOR_MODES;
declare const settings_TAG_SUGGESTION_LIMITS: typeof TAG_SUGGESTION_LIMITS;
declare const settings_TAG_VIEW_MODES: typeof TAG_VIEW_MODES;
export type settings_TagFolderColorMode = TagFolderColorMode;
export type settings_TagViewMode = TagViewMode;
declare const settings_UNIT_SYSTEMS: typeof UNIT_SYSTEMS;
export type settings_UnitSystem = UnitSystem;
declare const settings_navHiddenWithUI: typeof navHiddenWithUI;
declare const settings_panoDisplayOptions: typeof panoDisplayOptions;
declare const settings_resetSettings: typeof resetSettings;
declare const settings_setSetting: typeof setSetting;
declare const settings_useSetting: typeof useSetting;
declare const settings_useSettings: typeof useSettings;
declare namespace settings {
  export { settings_APP_SETTINGS as APP_SETTINGS, settings_BORDER_ARCHIVE_BYTES as BORDER_ARCHIVE_BYTES, settings_BORDER_DETAILS as BORDER_DETAILS, settings_CSS_VAR_SETTINGS as CSS_VAR_SETTINGS, settings_DATE_TIMEZONES as DATE_TIMEZONES, settings_DEFAULTS as DEFAULTS, settings_DISCORD_PRESENCE_MODES as DISCORD_PRESENCE_MODES, settings_EXACT_DATE_FORMATS as EXACT_DATE_FORMATS, settings_GEOCODE_PROVIDERS as GEOCODE_PROVIDERS, settings_GEOCODE_PROVIDER_LABELS as GEOCODE_PROVIDER_LABELS, settings_LANGUAGES as LANGUAGES, settings_MAP_LIST_FIELDS as MAP_LIST_FIELDS, settings_MOVEMENT_CYCLE as MOVEMENT_CYCLE, settings_MOVEMENT_MODES as MOVEMENT_MODES, settings_OPACITY_TOGGLE_MODES as OPACITY_TOGGLE_MODES, settings_POLYGON_COLOR_MODES as POLYGON_COLOR_MODES, settings_PREVIEW_ASPECT_RATIOS as PREVIEW_ASPECT_RATIOS, settings_PRIVATE_SETTINGS as PRIVATE_SETTINGS, settings_SEEN_RESOLUTIONS as SEEN_RESOLUTIONS, settings_SUBDIVISION_DETAILS as SUBDIVISION_DETAILS, settings_TAG_FOLDER_COLOR_MODES as TAG_FOLDER_COLOR_MODES, settings_TAG_SUGGESTION_LIMITS as TAG_SUGGESTION_LIMITS, settings_TAG_VIEW_MODES as TAG_VIEW_MODES, settings_UNIT_SYSTEMS as UNIT_SYSTEMS, getSettings$1 as getSettings, settings_navHiddenWithUI as navHiddenWithUI, settings_panoDisplayOptions as panoDisplayOptions, settings_resetSettings as resetSettings, settings_setSetting as setSetting, settings_useSetting as useSetting, settings_useSettings as useSettings };
  export type { settings_AppSettings as AppSettings, settings_BorderDetail as BorderDetail, settings_DateTimezone as DateTimezone, settings_DiscordPresenceMode as DiscordPresenceMode, settings_ExactDateFormat as ExactDateFormat, settings_GeocodeProvider as GeocodeProvider, settings_Language as Language, settings_MapListField as MapListField, settings_MovementMode as MovementMode, settings_OpacityToggleMode as OpacityToggleMode, settings_PolygonColorMode as PolygonColorMode, settings_PreviewAspectRatio as PreviewAspectRatio, settings_SeenResolution as SeenResolution, settings_SubdivisionDetail as SubdivisionDetail, settings_TagFolderColorMode as TagFolderColorMode, settings_TagViewMode as TagViewMode, settings_UnitSystem as UnitSystem };
}

/** Parsed-but-not-committed import shown while `workArea === "import"`. */
export interface ImportStaging {
    preview: EditorImportPreview;
    source: "file" | "paste";
}
declare function getImportPreviewPositions(): Float32Array<ArrayBufferLike>;
declare function getImportStaging(): ImportStaging | null;
/** Reset import state (called when map edit state is cleared). */
declare function resetImportState(): void;
/** Import from a known file path. Used by file picker and drag-and-drop. */
declare function beginImportFromPath(path: string): Promise<void>;
/** Stage pasted text for preview. Throws if no locations are found. */
declare function beginImportPaste(text: string): Promise<void>;
/** Commit the staged import, optionally dropping fields and applying a bulk tag. */
declare function confirmImport(droppedFields: string[], tagName?: string): Promise<EditorImportResult | null>;
/** Discard the staged import without committing. */
declare function cancelImport(): void;

export type importStaging_ImportStaging = ImportStaging;
declare const importStaging_beginImportFromPath: typeof beginImportFromPath;
declare const importStaging_beginImportPaste: typeof beginImportPaste;
declare const importStaging_cancelImport: typeof cancelImport;
declare const importStaging_confirmImport: typeof confirmImport;
declare const importStaging_getImportPreviewPositions: typeof getImportPreviewPositions;
declare const importStaging_getImportStaging: typeof getImportStaging;
declare const importStaging_resetImportState: typeof resetImportState;
declare namespace importStaging {
  export { importStaging_beginImportFromPath as beginImportFromPath, importStaging_beginImportPaste as beginImportPaste, importStaging_cancelImport as cancelImport, importStaging_confirmImport as confirmImport, importStaging_getImportPreviewPositions as getImportPreviewPositions, importStaging_getImportStaging as getImportStaging, importStaging_resetImportState as resetImportState };
  export type { importStaging_ImportStaging as ImportStaging };
}

declare function hasCommitDiff(): boolean;
/** Zero the cached counts (a commit just cleared the overlay). */
declare function resetCommitDiffCounts(): void;
declare function useCommitDiff(): CommitDiff;
/** Ephemeral commit-diff overlay shown while `workArea === "diff"`. Position arrays are
 *  interleaved `[lng, lat]` f32; `diff-markers:changed` fires to rebuild the layers. */
export interface CommitDiffPreview {
    commitId: string;
    hash: string;
    counts: CommitDiff;
    added: Float32Array;
    removed: Float32Array;
    modified: Float32Array;
}
declare function getCommitDiffPreview(): CommitDiffPreview | null;
/** Reset diff state (called when map edit state is cleared). */
declare function resetCommitDiffState(): void;
/** Interleave `[lng, lat]` pairs into an f32 buffer for deck.gl. */
declare function diffPositions(locs: LatLng[]): Float32Array;
/** Split a commit delta into added / removed / modified. An updated location appears in
 *  both `created` (new) and `removed` (old), keyed by id. */
declare function categorizeCommitDelta(delta: CommitDelta): {
    added: Location[];
    removed: Location[];
    modified: Location[];
};
/** Fetch a commit's delta and overlay its added/removed/modified locations on the map,
 *  temporarily replacing the regular markers. */
declare function beginCommitDiffPreview(commit: CommitInfo): Promise<void>;
/** Leave commit-diff preview and restore the regular markers. */
declare function endCommitDiffPreview(): void;

export type commitDiff_CommitDiffPreview = CommitDiffPreview;
declare const commitDiff_beginCommitDiffPreview: typeof beginCommitDiffPreview;
declare const commitDiff_categorizeCommitDelta: typeof categorizeCommitDelta;
declare const commitDiff_diffPositions: typeof diffPositions;
declare const commitDiff_endCommitDiffPreview: typeof endCommitDiffPreview;
declare const commitDiff_getCommitDiffPreview: typeof getCommitDiffPreview;
declare const commitDiff_hasCommitDiff: typeof hasCommitDiff;
declare const commitDiff_resetCommitDiffCounts: typeof resetCommitDiffCounts;
declare const commitDiff_resetCommitDiffState: typeof resetCommitDiffState;
declare const commitDiff_useCommitDiff: typeof useCommitDiff;
declare namespace commitDiff {
  export { commitDiff_beginCommitDiffPreview as beginCommitDiffPreview, commitDiff_categorizeCommitDelta as categorizeCommitDelta, commitDiff_diffPositions as diffPositions, commitDiff_endCommitDiffPreview as endCommitDiffPreview, commitDiff_getCommitDiffPreview as getCommitDiffPreview, commitDiff_hasCommitDiff as hasCommitDiff, commitDiff_resetCommitDiffCounts as resetCommitDiffCounts, commitDiff_resetCommitDiffState as resetCommitDiffState, commitDiff_useCommitDiff as useCommitDiff };
  export type { commitDiff_CommitDiffPreview as CommitDiffPreview };
}

/** What the selector picker offers. Not a location set -- `selectorForPick` turns it
 *  into a `Selector`. */
export type SelectorPick = {
    pick: "all";
} | {
    pick: "selection";
} | {
    pick: "saved";
    id: string;
};
export interface SelectorPickController {
    /** The picked locations. Hand it straight to any `Selector` consumer. */
    selector: Selector;
    /** The picker's own state. Persist this, not `selector`: it tracks the live selection. */
    choice: SelectorPick;
    setChoice(c: SelectorPick): void;
    allCount: number;
    selectionCount: number;
    /** Opt-in: the picker additionally offers saved selections. */
    saved?: boolean;
}
declare function selectorForPick(choice: SelectorPick): Selector;
/** Reactive selector state + live counts, owned by the calling React component. Defaults to
 *  the current selection when one exists at mount, else all locations. Use this for plugins
 *  whose selector lives entirely in a React sidebar; reach for `createSelectorPick` when an imperative
 *  renderer (e.g. a deck.gl overlay) outside React also needs to read the selector. */
declare function useSelectorPick(initial?: SelectorPick): SelectorPickController;
/** A per-consumer selector store that lives outside React, so an imperative renderer can read it
 *  synchronously and subscribe to changes while a React sidebar drives it via `use()`.
 *  Isolated per call - one consumer's choice never leaks into another's. */
export interface SelectorPickHandle {
    get(): Selector;
    getChoice(): SelectorPick;
    set(choice: SelectorPick): void;
    subscribe(listener: () => void): () => void;
    /** React view of this handle: re-renders on change, with live counts. */
    use(): SelectorPickController;
}
/** A standalone "all locations vs current selection" switch, for features that operate on a subset. */
declare function createSelectorPick(initial?: SelectorPick): SelectorPickHandle;

export type picker_SelectorPick = SelectorPick;
export type picker_SelectorPickController = SelectorPickController;
export type picker_SelectorPickHandle = SelectorPickHandle;
declare const picker_createSelectorPick: typeof createSelectorPick;
declare const picker_selectorForPick: typeof selectorForPick;
declare const picker_useSelectorPick: typeof useSelectorPick;
declare namespace picker {
  export { picker_createSelectorPick as createSelectorPick, picker_selectorForPick as selectorForPick, picker_useSelectorPick as useSelectorPick };
  export type { picker_SelectorPick as SelectorPick, picker_SelectorPickController as SelectorPickController, picker_SelectorPickHandle as SelectorPickHandle };
}

/** Reactive list of all maps (metadata only). */
declare function useMapList(): MapMeta[];
/** The list of all maps (metadata only). */
declare function getMapList(): MapMeta[];
declare function reloadMapList(): Promise<void>;
/** Re-fetch the map list from the database. */
declare function invalidateMapList(): Promise<void>;
/** Set the cached map list directly (used by initStore). */
declare function setCachedMapList(list: MapMeta[]): void;
/** Create a new empty map and return its metadata. */
declare function createMap(name: string, folder?: string | null): Promise<MapMeta>;
/** Permanently delete a map and all its data. Not undoable. */
declare function deleteMap$1(id: string): Promise<void>;
declare function renameFolder(from: string, to: string): Promise<void>;
declare function moveMapToFolder(mapId: string, folder: string | null): Promise<void>;
declare function deleteFolder(name: string): Promise<void>;

declare const mapList_createMap: typeof createMap;
declare const mapList_deleteFolder: typeof deleteFolder;
declare const mapList_getMapList: typeof getMapList;
declare const mapList_invalidateMapList: typeof invalidateMapList;
declare const mapList_moveMapToFolder: typeof moveMapToFolder;
declare const mapList_reloadMapList: typeof reloadMapList;
declare const mapList_renameFolder: typeof renameFolder;
declare const mapList_setCachedMapList: typeof setCachedMapList;
declare const mapList_useMapList: typeof useMapList;
declare namespace mapList {
  export {
    mapList_createMap as createMap,
    mapList_deleteFolder as deleteFolder,
    deleteMap$1 as deleteMap,
    mapList_getMapList as getMapList,
    mapList_invalidateMapList as invalidateMapList,
    mapList_moveMapToFolder as moveMapToFolder,
    mapList_reloadMapList as reloadMapList,
    mapList_renameFolder as renameFolder,
    mapList_setCachedMapList as setCachedMapList,
    mapList_useMapList as useMapList,
  };
}

export interface PruneResult {
    session: ReviewSession | null;
    cursorMoved: boolean;
}
/** Remove `removed` ids from a session's worklist + reviewed set. The cursor only
 *  moves if the cursor id itself was removed (advancing to the next survivor by old
 *  position). Returns the same session reference untouched if nothing overlapped. */
declare function pruneSession(s: ReviewSession, removed: Set<number>): PruneResult;
/** Mark the current cursor reviewed and step forward. `done` when the cursor was the
 *  last item (status flips to "done"). */
declare function advance(s: ReviewSession): {
    session: ReviewSession;
    done: boolean;
};
/** Step backward without marking anything reviewed. Null when already at the start. */
declare function retreat(s: ReviewSession): ReviewSession | null;
/** Position of the session cursor within its review order. */
declare function reviewIndex(s: ReviewSession): number;
/** Union of reviewed ids across sessions, de-duplicated. Pure (unit-tested). */
declare function reviewedHistoryIds(sessions: ReviewSession[]): number[];
/** True when the cursor is on the session's first location. */
declare function isAtStart(s: ReviewSession): boolean;
/** Current cursor location is in the reviewed set. */
declare function isCurrentReviewed(s: ReviewSession): boolean;
/** Reactive active review session, or null. */
declare function useReviewSession(): ReviewSession | null;
/** The active review session, or null. */
declare function getReviewSession(): ReviewSession | null;
/** Start (or resume) a review over `ids`. When `source` is a real selection, the session
 *  is keyed by it so re-reviewing that selection resumes the in-progress session. */
declare function beginReview(ids: number[], source?: Selection): Promise<void>;
/** Resume a session picked from the resume modal. */
declare function resumeReview(s: ReviewSession): Promise<void>;
/** Mark the current location reviewed and step to the next one. */
declare function reviewNext(): Promise<void>;
/** Step back to the previous location in the session. */
declare function reviewPrev(): Promise<void>;
/** Delete the current location and advance FORWARD (like reviewNext) — to the item that
 *  followed it, or exit the pass if it was the last one. We navigate off the doomed location
 *  first so the shared `removeLocations` doesn't bounce us to the overview; its emitted
 *  `location:remove` is then a no-op for our reconcile listener (already pruned). */
declare function reviewDelete(): Promise<void>;
/** Exit the review UI but keep the session resumable (persisted as active). */
declare function cancelReview(): void;
/** Rename a session (custom label over the auto-derived selection name). Persists immediately;
 *  also patches the live session if it's the one being renamed. */
declare function renameReview(id: string, name: string): Promise<void>;
/** Delete a review session (its progress, not the locations). */
declare function deleteSession(id: string): Promise<void>;
/** Review sessions for the open map, optionally filtered by status. */
declare function listSessions(status?: "active" | "done"): Promise<ReviewSession[]>;
/** Select every location marked reviewed across all review sessions on this map (active + done).
 *  A snapshot; re-running refreshes it in place (deterministic key). */
declare function selectReviewedHistory(): Promise<void>;
/** Add a reviewed/unreviewed overlay selection for an arbitrary session (resume modal). Mirrors
 *  refreshProjection's selector so the key and color match an in-progress projection. */
declare function selectReviewSet(s: ReviewSession, mode: "reviewed" | "unreviewed"): Promise<void>;

export type review_PruneResult = PruneResult;
declare const review_advance: typeof advance;
declare const review_beginReview: typeof beginReview;
declare const review_cancelReview: typeof cancelReview;
declare const review_deleteSession: typeof deleteSession;
declare const review_getReviewSession: typeof getReviewSession;
declare const review_isAtStart: typeof isAtStart;
declare const review_isCurrentReviewed: typeof isCurrentReviewed;
declare const review_listSessions: typeof listSessions;
declare const review_pruneSession: typeof pruneSession;
declare const review_renameReview: typeof renameReview;
declare const review_resumeReview: typeof resumeReview;
declare const review_retreat: typeof retreat;
declare const review_reviewDelete: typeof reviewDelete;
declare const review_reviewIndex: typeof reviewIndex;
declare const review_reviewNext: typeof reviewNext;
declare const review_reviewPrev: typeof reviewPrev;
declare const review_reviewedHistoryIds: typeof reviewedHistoryIds;
declare const review_selectReviewSet: typeof selectReviewSet;
declare const review_selectReviewedHistory: typeof selectReviewedHistory;
declare const review_useReviewSession: typeof useReviewSession;
declare namespace review {
  export { review_advance as advance, review_beginReview as beginReview, review_cancelReview as cancelReview, review_deleteSession as deleteSession, review_getReviewSession as getReviewSession, review_isAtStart as isAtStart, review_isCurrentReviewed as isCurrentReviewed, review_listSessions as listSessions, review_pruneSession as pruneSession, review_renameReview as renameReview, review_resumeReview as resumeReview, review_retreat as retreat, review_reviewDelete as reviewDelete, review_reviewIndex as reviewIndex, review_reviewNext as reviewNext, review_reviewPrev as reviewPrev, review_reviewedHistoryIds as reviewedHistoryIds, review_selectReviewSet as selectReviewSet, review_selectReviewedHistory as selectReviewedHistory, review_useReviewSession as useReviewSession };
  export type { review_PruneResult as PruneResult };
}

export type Cmd = typeof commands$1;
/** Every Rust command, typed. Any of them can change in a release. @unstable */
declare const cmd: Cmd;

export type commands_Cmd = Cmd;
declare const commands_cmd: typeof cmd;
declare namespace commands {
  export { commands_cmd as cmd };
  export type { commands_Cmd as Cmd };
}

/** Tauri primitives, handed to plugins as-is. */

declare const shell: {
    Command: typeof Command;
};
declare const dialog: {
    open: typeof open;
    save: typeof save;
};

declare const tauri_dialog: typeof dialog;
declare const tauri_invoke: typeof invoke;
declare const tauri_shell: typeof shell;
declare namespace tauri {
  export {
    tauri_dialog as dialog,
    tauri_invoke as invoke,
    tauri_shell as shell,
  };
}

/** Saka1zum1 marketplace catalog. Do not point this at the upstream ccmid registry. */
declare const PLUGIN_REGISTRY_URL = "https://raw.githubusercontent.com/Saka1zum1/mma/master/plugins/registry.json";
export type PluginIdentity = Pick<PluginManifest, "id" | "name" | "description" | "icon" | "comingSoon" | "experimental">;
export interface PluginSettingDef {
    key: string;
    label: string;
    type: "boolean" | "string" | "number";
    default: unknown;
}
export interface Plugin extends PluginIdentity {
    core?: boolean;
    settings?: PluginSettingDef[];
    /** Keep the sidebar mounted (hidden) when the user leaves plugin mode.
     *  Only for plugins whose state can't be serialized (e.g. an iframe). */
    keepAlive?: boolean;
    activate(): void | (() => void);
    modal?: ComponentType<{
        onClose: () => void;
    }>;
    sidebar?: ComponentType<{
        onClose: () => void;
    }>;
    locationPanel?: ComponentType;
}
export type PluginBehavior = Partial<Plugin> & {
    activate(): void | (() => void);
};
declare function isPluginCompatible(minAppVersion: string | null | undefined, appVersion: string): boolean;
declare function isPluginUpdatable(installedVersion: string | undefined, latestVersion: string | undefined): boolean;
declare function needsUpdate(installedVersion: string | undefined, latestVersion: string | undefined, installedSidecarVersion: string | null | undefined, latestSidecarVersion: string | undefined): boolean;
export type ResolvedBuild = {
    version: string;
    ref: string | null;
    minAppVersion: string | null;
};
/** The newest build of a plugin this app version can run. The Saka1zum1 catalog
 *  publishes one current build per id (no pinned older refs), so an incompatible
 *  latest simply means keep what is installed. @unstable */
declare function resolveBuild(entry: PluginManifest, appVersion: string): ResolvedBuild | null;
/** True when the installed plugin should be refreshed to `target`. A pinned older
 *  ref still repairs a missing or drifted sidecar; version-only comparison would
 *  leave a half-installed build stuck. @unstable */
declare function needsBuildUpdate(installedVersion: string | undefined, target: ResolvedBuild, installedSidecarVersion: string | null | undefined, latestSidecarVersion: string | undefined): boolean;
declare function fetchPluginRegistry(): Promise<PluginManifest[]>;
/** Auto-update a plugin to the newest compatible catalog build before loading it.
 *  Falls back to what is on disk on failure. @unstable */
declare function autoUpdatePlugin(m: PluginManifest, latest: PluginManifest | undefined, appVersion: string): Promise<PluginManifest>;
declare function setPendingManifest(manifest: PluginManifest | null): void;
/** Register a plugin. `activate` runs when a map opens; its returned cleanup runs on map close. */
declare function registerPlugin(plugin: Plugin | PluginBehavior): void;
declare function getPlugins(): Plugin[];
declare function getPlugin(id: string): Plugin | undefined;
/** A plugin with no sidebar, modal, or location panel — it only contributes data
 *  (enrichment fields) and never shows UI of its own. Unknown for plugins that
 *  aren't loaded, so uninstalled registry entries report false. */
declare function isBackgroundPlugin(id: string): boolean;
declare function unregisterPlugin(id: string): void;
declare function isPluginEnabled(id: string): boolean;
declare function setPluginEnabled(id: string, enabled: boolean): void;
declare function getEnabledPlugins(): Plugin[];
export interface PluginStorage {
    get<T = unknown>(key: string, fallback?: T): T;
    set(key: string, value: unknown): void;
    remove(key: string): void;
    keys(): string[];
}
/** Persistent key-value storage namespaced to a plugin. Survives restarts. */
declare function createPluginStorage(id: string): PluginStorage;
/** Alias used by plugins as `MMA.storage`. */
declare const storage: typeof createPluginStorage;
/** useState persisted through the plugin's namespaced store. UI state saved this
 *  way survives sidebar unmount and app restart. Values are global, not per-map —
 *  callers must fall back gracefully when a stored value doesn't resolve against
 *  the current map (e.g. a field key or saved-selection id). */
declare function usePluginState<T>(pluginId: string, key: string, initial: T | (() => T)): readonly [T, (action: SetStateAction<T>) => void];
declare function getPluginSetting<T = unknown>(plugin: Plugin, key: string): T;
declare function setPluginSetting(id: string, key: string, value: unknown): void;
declare function activatePlugins(): void;
declare function deactivatePlugins(): void;
declare function activatePlugin(id: string): void;
declare function deactivatePlugin(id: string): void;

declare const registry_PLUGIN_REGISTRY_URL: typeof PLUGIN_REGISTRY_URL;
export type registry_Plugin = Plugin;
export type registry_PluginBehavior = PluginBehavior;
export type registry_PluginIdentity = PluginIdentity;
export type registry_PluginSettingDef = PluginSettingDef;
export type registry_PluginStorage = PluginStorage;
export type registry_ResolvedBuild = ResolvedBuild;
declare const registry_activatePlugin: typeof activatePlugin;
declare const registry_activatePlugins: typeof activatePlugins;
declare const registry_autoUpdatePlugin: typeof autoUpdatePlugin;
declare const registry_createPluginStorage: typeof createPluginStorage;
declare const registry_deactivatePlugin: typeof deactivatePlugin;
declare const registry_deactivatePlugins: typeof deactivatePlugins;
declare const registry_fetchPluginRegistry: typeof fetchPluginRegistry;
declare const registry_getEnabledPlugins: typeof getEnabledPlugins;
declare const registry_getPlugin: typeof getPlugin;
declare const registry_getPluginSetting: typeof getPluginSetting;
declare const registry_getPlugins: typeof getPlugins;
declare const registry_isBackgroundPlugin: typeof isBackgroundPlugin;
declare const registry_isPluginCompatible: typeof isPluginCompatible;
declare const registry_isPluginEnabled: typeof isPluginEnabled;
declare const registry_isPluginUpdatable: typeof isPluginUpdatable;
declare const registry_needsBuildUpdate: typeof needsBuildUpdate;
declare const registry_needsUpdate: typeof needsUpdate;
declare const registry_registerPlugin: typeof registerPlugin;
declare const registry_resolveBuild: typeof resolveBuild;
declare const registry_setPendingManifest: typeof setPendingManifest;
declare const registry_setPluginEnabled: typeof setPluginEnabled;
declare const registry_setPluginSetting: typeof setPluginSetting;
declare const registry_storage: typeof storage;
declare const registry_unregisterPlugin: typeof unregisterPlugin;
declare const registry_usePluginState: typeof usePluginState;
declare namespace registry {
  export { registry_PLUGIN_REGISTRY_URL as PLUGIN_REGISTRY_URL, registry_activatePlugin as activatePlugin, registry_activatePlugins as activatePlugins, registry_autoUpdatePlugin as autoUpdatePlugin, registry_createPluginStorage as createPluginStorage, registry_deactivatePlugin as deactivatePlugin, registry_deactivatePlugins as deactivatePlugins, registry_fetchPluginRegistry as fetchPluginRegistry, registry_getEnabledPlugins as getEnabledPlugins, registry_getPlugin as getPlugin, registry_getPluginSetting as getPluginSetting, registry_getPlugins as getPlugins, registry_isBackgroundPlugin as isBackgroundPlugin, registry_isPluginCompatible as isPluginCompatible, registry_isPluginEnabled as isPluginEnabled, registry_isPluginUpdatable as isPluginUpdatable, registry_needsBuildUpdate as needsBuildUpdate, registry_needsUpdate as needsUpdate, registry_registerPlugin as registerPlugin, registry_resolveBuild as resolveBuild, registry_setPendingManifest as setPendingManifest, registry_setPluginEnabled as setPluginEnabled, registry_setPluginSetting as setPluginSetting, registry_storage as storage, registry_unregisterPlugin as unregisterPlugin, registry_usePluginState as usePluginState };
  export type { registry_Plugin as Plugin, registry_PluginBehavior as PluginBehavior, registry_PluginIdentity as PluginIdentity, registry_PluginSettingDef as PluginSettingDef, registry_PluginStorage as PluginStorage, registry_ResolvedBuild as ResolvedBuild };
}

export interface SelectionBitmaskPayload {
    selColors: [number, number, number][];
    cellEntries: SelCellEntry[];
    setIds: (ids: SelectedIds) => void;
}
declare const EVENT_DEFS: {
    "location:add": Location[];
    "location:remove": number[];
    "location:update": Update<LocationPatch_Deserialize>[];
    /** Location data changed in bulk without per-location patches (e.g. a Rust-side
     *  field op). Anything derived from location data must re-query. */
    "location:invalidate": void;
    "tag:add": Tag[];
    "tag:remove": number[];
    "tag:update": Update<TagPatch>[];
    "selection:change": Selection[];
    "active:change": number | null;
    "map:open": MapData;
    "map:close": void;
    "store:changed": void;
    "render:delta": RenderDelta;
    "render:selection": SelectionBitmaskPayload;
    "map-list:changed": void;
    "saved-selections:changed": void;
    "settings:changed": void;
    "settings:open": void;
    "locale:changed": void;
    "fullscreen:changed": void;
    "plugins:changed": void;
    "hotkeys:changed": void;
    "toasts:changed": void;
    "jobs:changed": void;
    "bulkruns:changed": void;
    "scene:changed": void;
    "measure:changed": void;
    "anchor:changed": void;
    "viewport-lock:changed": void;
    "trail:changed": void;
    "altitude:changed": void;
    "seen:changed": void;
    "update:changed": void;
    "review:changed": void;
    "fields:changed": void;
    "route:changed": void;
    "import-markers:changed": void;
    "diff-markers:changed": void;
    "commit-diff:changed": void;
};
export type EditorEventMap = typeof EVENT_DEFS;
export type EditorEvent = keyof EditorEventMap;
export type EventHandler<E extends EditorEvent> = (payload: EditorEventMap[E]) => void;

export type Disposable = () => void;
/** Run `fn` attributed to plugin `id`; host registrations during it are tracked for teardown. */
declare function runAsPlugin<T>(id: string, fn: () => T): T;
/** Subscribe to an editor event and enroll the unsubscribe under the activating plugin. */
declare function on<E extends EditorEvent>(event: E, handler: EventHandler<E>): () => void;
/** Enroll a teardown callback under the currently-activating plugin. No-op outside activation. */
declare function trackDisposable(dispose: Disposable): void;
/** Record where a plugin's files live on disk, so its registrations can resolve
 *  paths to assets it ships. Core plugins have no directory. */
declare function setPluginBaseDir(id: string, dir: string): void;
/** Resolve a file path a plugin registration referred to, against the directory of the
 *  plugin currently activating. Absolute paths, "res://" URLs, registrations outside an
 *  activation window, and core plugins (no directory) all pass through unchanged. */
declare function resolvePluginPath(path: string): string;
/** Run and clear every teardown a plugin registered, in reverse order. */
declare function disposePlugin(id: string): void;

declare const scope_disposePlugin: typeof disposePlugin;
declare const scope_on: typeof on;
declare const scope_resolvePluginPath: typeof resolvePluginPath;
declare const scope_runAsPlugin: typeof runAsPlugin;
declare const scope_setPluginBaseDir: typeof setPluginBaseDir;
declare const scope_trackDisposable: typeof trackDisposable;
declare namespace scope {
  export {
    scope_disposePlugin as disposePlugin,
    scope_on as on,
    scope_resolvePluginPath as resolvePluginPath,
    scope_runAsPlugin as runAsPlugin,
    scope_setPluginBaseDir as setPluginBaseDir,
    scope_trackDisposable as trackDisposable,
  };
}

/** Get a module the app bundles (e.g. "react", "@deck.gl/core") for use inside a plugin.
 *  Lazy modules must be loaded with `preloadModules` first. */
declare function mmaRequire(id: string): unknown;
/** Load lazy bundled modules so `mmaRequire` can return them synchronously. */
declare function preloadModules(ids: string[]): Promise<void>;
/** Names of every module available through `mmaRequire`. */
declare function getAvailableExternals(): string[];
declare global {
    var __mma_require: typeof mmaRequire;
}

declare const externals_getAvailableExternals: typeof getAvailableExternals;
declare const externals_mmaRequire: typeof mmaRequire;
declare const externals_preloadModules: typeof preloadModules;
declare namespace externals {
  export {
    externals_getAvailableExternals as getAvailableExternals,
    externals_mmaRequire as mmaRequire,
    externals_preloadModules as preloadModules,
  };
}

export interface SidecarOptions<T> {
    /** Fires once per JSON object the sidecar emits, in order. */
    onLine?(item: T): void;
    /** Sidecar diagnostics (stderr), one-shot runs only. Resident-served commands
     *  write theirs to the app log instead. */
    onLog?(line: string): void;
    signal?: AbortSignal;
}
/** Legacy handle returned by {@link spawn}. Prefer {@link request}. */
export interface SidecarRun {
    runId: number;
    onLine(cb: (line: string) => void): void;
    onStderr(cb: (line: string) => void): void;
    onExit(cb: (code: number | null) => void): void;
    kill(): void;
}
/** Send a command to a plugin's sidecar and resolve with its last emitted JSON
 *  object (null if it emitted none). `payload` is sent as JSON. */
declare function request<T>(pluginId: string, command: string, payload?: unknown, opts?: SidecarOptions<T>): Promise<T | null>;
/** The sidecar version installed for a plugin, or null when it has none yet. */
declare function installedVersion(pluginId: string): Promise<string | null>;
/**
 * Compatibility shim for plugins still calling `MMA.sidecar.spawn` (pre app-owned
 * sidecar API). Translates CLI-style args (`detect --input path.json`) into
 * {@link request}. New plugins should use `request` directly.
 */
declare function spawn(pluginId: string, _binaryName: string, args: string[]): Promise<SidecarRun>;
/** The nested `sidecar` namespace on the plugin surface. */
declare const sidecar: {
    request: typeof request;
    installedVersion: typeof installedVersion;
    spawn: typeof spawn;
};

export type sidecar$1_SidecarOptions<T> = SidecarOptions<T>;
export type sidecar$1_SidecarRun = SidecarRun;
declare const sidecar$1_installedVersion: typeof installedVersion;
declare const sidecar$1_request: typeof request;
declare const sidecar$1_sidecar: typeof sidecar;
declare const sidecar$1_spawn: typeof spawn;
declare namespace sidecar$1 {
  export { sidecar$1_installedVersion as installedVersion, sidecar$1_request as request, sidecar$1_sidecar as sidecar, sidecar$1_spawn as spawn };
  export type { sidecar$1_SidecarOptions as SidecarOptions, sidecar$1_SidecarRun as SidecarRun };
}

export type BarSize = "sm" | "md" | "lg";
export type BarTone = "accent" | "complete" | "incomplete";
/** A bar filled to `value`, a share from 0 to 1. */
declare function Bar({ value, size, tone, className, }: {
    value: number;
    size?: BarSize;
    tone?: BarTone;
    className?: string;
}): react.JSX.Element;

export type ButtonVariant = "primary" | "destructive" | "ghost";
declare function Button({ variant, small, type, className, ...props }: ComponentPropsWithRef<"button"> & {
    variant?: ButtonVariant;
    small?: boolean;
}): react.JSX.Element;

declare function Checkbox({ className, ...props }: ComponentPropsWithRef<"input">): react.JSX.Element;

/** A color swatch that opens the picker in a popover on click. */
declare function ColorPicker({ color, onChange, ariaLabel, }: {
    color: RGB;
    onChange: (color: RGB) => void;
    ariaLabel?: string;
}): react.JSX.Element;

/** Share of locations holding a value as a bar and a percentage, colored by whether every location is covered when `status` is set. */
declare function CoverageBar({ ratio, size, status, className, }: {
    ratio: number;
    size?: BarSize;
    status?: boolean;
    className?: string;
}): react.JSX.Element;

export interface DatePickerProps {
    mode: "date" | "month";
    value: string;
    onChange: (v: string) => void;
    anyYear?: boolean;
    onAnyYearToggle?: (v: boolean) => void;
    showAnyYear?: boolean;
    showTime?: boolean;
    anyTime?: boolean;
    onAnyTimeToggle?: (v: boolean) => void;
    showAnyTime?: boolean;
    tzLocal?: boolean;
    onTzLocalToggle?: (v: boolean) => void;
    showTzLocal?: boolean;
    onYearSelect?: (year: number) => void;
    /** Treat the value as a wall-clock instant encoded as a UTC epoch (the picked
     *  numbers survive unshifted by the viewer's timezone). Used by location-time
     *  date filtering, where Rust re-interprets the wall-clock in each pano's zone. */
    wallClock?: boolean;
}
declare function DatePicker({ mode, value, onChange, anyYear, onAnyYearToggle, showAnyYear, showTime, anyTime, onAnyTimeToggle, showAnyTime, tzLocal, onTzLocalToggle, showTzLocal, onYearSelect, wallClock, }: DatePickerProps): react.JSX.Element;

/** Controlled open/close pair every dialog component takes. */
export interface DialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}
declare function useCloseDialog(): () => void;
declare function Dialog({ open, onOpenChange, children, ...props }: Omit<ComponentProps<typeof Dialog$1.Root>, "onOpenChange"> & {
    onOpenChange?: (open: boolean) => void;
}): react.JSX.Element;
declare const DialogTrigger: Dialog$1.Trigger;
declare function DialogContent({ className, title, initialFocus, children, headerExtra, ...props }: ComponentProps<typeof Dialog$1.Popup> & {
    title: string;
    headerExtra?: ReactNode;
}): react.JSX.Element;

/** Country flag from the bundled SVG set. Renders nothing for a missing or malformed code. */
declare function Flag({ code, height, className, }: {
    code: string | null | undefined;
    height?: number;
    className?: string;
}): react.JSX.Element | null;

/** A line of secondary text, optionally marked as a warning or an error. */
declare function Hint({ tone, children }: {
    tone?: "warning" | "error";
    children?: ReactNode;
}): react.JSX.Element;
/** An info icon beside a label, explaining it on hover instead of in a line under it. */
declare function InfoButton({ text }: {
    text: string;
}): react.JSX.Element;
/** A boxed message that informs, warns, reports an error or confirms a success. */
declare function Notice({ tone, children, }: {
    tone: "info" | "warning" | "error" | "success";
    children: ReactNode;
}): react.JSX.Element;

/** Click-to-record key combo input. Backspace/Delete clears, Escape cancels. */
declare function HotkeyInput({ value, onChange, }: {
    value: string;
    onChange: (combo: string) => void;
}): react.JSX.Element;

export interface IconProps {
    path: string;
    size?: number;
    className?: string;
    style?: React.CSSProperties;
}
declare function Icon({ path, size, className, style }: IconProps): react.JSX.Element;

/** A button showing only an icon, named by its label. @unstable */
declare function IconButton({ icon, label, size, active, reveal, overlay, tooltip, tooltipSide, type, className, children, ...props }: Omit<ComponentPropsWithRef<"button">, "aria-label" | "title"> & {
    /** An icon path, or a drawn icon to show instead. */
    icon: string | ReactNode;
    /** What the button does, read aloud and shown as its tooltip. */
    label: string;
    /** The icon's size in pixels. */
    size?: number;
    /** Shows the button as pressed. */
    active?: boolean;
    /** Hides the button until its row is hovered or holds focus. */
    reveal?: boolean;
    /** Draws the button for use over map or street view imagery. */
    overlay?: boolean;
    /** The tooltip text, or false for none. Defaults to the label. */
    tooltip?: string | false;
    /** The side the tooltip opens on. */
    tooltipSide?: "top" | "bottom" | "left" | "right";
    /** Shown after the icon, such as a badge. */
    children?: ReactNode;
}): react.JSX.Element;

declare function NSelect({ className, onWheel, ...props }: ComponentPropsWithRef<"select">): react.JSX.Element;

/** A progress bar under its label and count, with any extra detail below it. */
declare function ProgressRow({ label, count, value, size, className, children, }: {
    label: ReactNode;
    count?: ReactNode;
    value: number;
    size?: BarSize;
    className?: string;
    children?: ReactNode;
}): react.JSX.Element;

declare function Radio({ className, ...props }: ComponentPropsWithRef<"input">): react.JSX.Element;

declare function SelectorPicker({ ctl, className, }: {
    ctl: SelectorPickController;
    className?: string;
}): react.JSX.Element;

/** `label` stays a plain string so settings search can match on it; `badge` is the escape hatch
 *  for a marker sitting beside it, like the flask on an experimental plugin card. */
export type Base = {
    label: string;
    badge?: ReactNode;
    description?: string;
    disabled?: boolean;
    sub?: boolean;
    keywords?: string[];
};
export type BoolRow = Base & {
    checked: boolean;
    onChange: (v: boolean) => void;
};
export type AutoBoolRow = Base & {
    setting: keyof AppSettings;
};
export type ControlRow = Base & {
    control: ReactNode;
};
declare function SettingRow(props: BoolRow | ControlRow | AutoBoolRow): react.JSX.Element | null;

/** Standard right-hand sidebar chrome (title, back button, scrollable body). Use for plugin sidebars. */
declare function Sidebar({ title, onBack, actions, className, flush, children, }: {
    title: ReactNode;
    onBack?: () => void;
    actions?: ReactNode;
    className?: string;
    flush?: boolean;
    children: ReactNode;
}): react.JSX.Element;
/** Collapsible titled section inside a Sidebar. */
declare function Section({ title, defaultOpen, collapsible, addons, children, }: {
    title: ReactNode;
    defaultOpen?: boolean;
    collapsible?: boolean;
    addons?: ReactNode;
    children: ReactNode;
}): react.JSX.Element;
/** Labelled form row (label left, control right) for sidebar sections. */
declare function Field({ label, hint, row, children, }: {
    label: ReactNode;
    hint?: ReactNode;
    row?: boolean;
    children: ReactNode;
}): react.JSX.Element;
/** Centered icon + message for empty panels. */
declare function EmptyState({ icon, children }: {
    icon?: string;
    children: ReactNode;
}): react.JSX.Element;
export interface SegmentedOption<T extends string | number> {
    value: T;
    label: ReactNode;
    disabled?: boolean;
    title?: string;
}
/** Row of mutually exclusive option buttons (a compact radio group). */
declare function SegmentedControl<T extends string | number>({ options, value, onChange, className, }: {
    options: SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
}): react.JSX.Element;

/** Range input whose track fills with the accent up to the current value.
 *  Controlled only: the fill derives from the value prop. */
declare function Slider({ className, ...props }: ComponentPropsWithRef<"input">): react.JSX.Element;

/** A spinning ring shown while something loads. `size` is any length, such as `"10px"`. */
declare function Spinner({ size, label }: {
    size?: string;
    label?: string;
}): react.JSX.Element;

/** Autocomplete input: owns open/close state, outside-click dismissal,
 *  Enter-picks-first, and Escape-closes. Suggestion sourcing stays at the call
 *  site (sync filter or debounced fetch) — the dropdown shows whenever
 *  `suggestions` is non-empty and not dismissed. Default classes render the
 *  standard `.search-results` dropdown; override them for other skins. */
declare function SuggestInput<T>({ value, onChange, suggestions, onPick, renderItem, getKey, placeholder, containerClassName, inputClassName, listClassName, itemClassName, listStyle, autoFocus, disabled, pickOnEnter, portal, }: {
    value: string;
    onChange: (v: string) => void;
    suggestions: T[];
    onPick: (item: T) => void;
    renderItem: (item: T) => ReactNode;
    getKey: (item: T) => string | number;
    placeholder?: string;
    containerClassName?: string;
    inputClassName?: string;
    listClassName?: string;
    itemClassName?: string;
    listStyle?: CSSProperties;
    autoFocus?: boolean;
    disabled?: boolean;
    /** When false, Enter closes the dropdown and falls through (e.g. to a form submit). */
    pickOnEnter?: boolean;
    /** Render the dropdown in a body portal (fixed, anchored to the input) so it floats
     *  over clipping ancestors like `.modal__content`. Clicks on it are exempted from
     *  dialog outside-dismissal via the `suggest-portal` class (see DialogContent). */
    portal?: boolean;
}): react.JSX.Element;

declare function Switch({ checked, onChange, disabled, label, }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    label?: string;
}): react.JSX.Element;

/** A compact, control-left row whose whole surface toggles an immediate-effect
 *  boolean. The Switch owns keyboard + a11y; the row forwards mouse clicks to
 *  the same toggle. The control wrapper stops propagation so a direct switch
 *  click does not also fire the row handler. Used by MapSettingsPanel and any
 *  surface outside the Settings dialog (SettingRow is the Settings dialog row). */
declare function SwitchRow({ checked, onChange, label, disabled, className, children, }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    disabled?: boolean;
    className?: string;
    children?: ReactNode;
}): react.JSX.Element;

export type TagPillButtonVariant = "add" | "delete" | "edit";
/** The leading affordance inside a TagPill: remove, apply, or open the editor. */
declare function TagPillButton({ variant, className, ...props }: ComponentPropsWithRef<"button"> & {
    variant: TagPillButtonVariant;
}): react.JSX.Element;
export type TagPillOwnProps = {
    color: string;
    label: ReactNode;
    count?: number;
    small?: boolean;
    button?: ReactNode;
    children?: ReactNode;
};
export type TagPillProps<E extends ElementType> = TagPillOwnProps & {
    as?: E;
} & Omit<ComponentPropsWithRef<E>, keyof TagPillOwnProps | "as">;
/** The one tag pill. Owns the tag color's rendering: every surface that shows a tag
 *  goes through here, so the look changes in one place. */
declare function TagPill<E extends ElementType = "span">({ as, color, label, count, small, button, children, ...rest }: TagPillProps<E>): react.JSX.Element;

declare function TextInput({ className, ...props }: ComponentPropsWithRef<"input">): react.JSX.Element;

export interface ToolBlockProps {
    title: string;
    className?: string;
    addons?: ReactNode;
    children?: ReactNode;
    isCollapsed?: boolean;
    onCollapse?: (collapsed: boolean) => void;
    collapsedAddons?: ReactNode;
}
declare function ToolBlock(props: ToolBlockProps): react.JSX.Element;

export type Side = "top" | "bottom" | "left" | "right";
export type Align = "start" | "center" | "end";
/** Marks its child as a tooltip trigger. Adds attributes to the existing element instead of
 *  wrapping it, so a trigger costs no extra fibers and hovering re-renders only the single
 *  host below -- one portal for the whole app rather than one per trigger. */
declare function Tooltip({ content, side, align, children, }: {
    content: string;
    side?: Side;
    align?: Align;
    children: ReactElement;
}): ReactElement<Record<string, unknown>, string | react.JSXElementConstructor<any>>;

/**
 * The public widget set, re-exported as one surface so `MMA.ui` is this list and
 * nothing else. Membership is deliberate: whatever a plugin can reach here has to
 * keep working (see legacy.ts), so a primitive is added when a plugin needs it,
 * not because it happens to live in this folder.
 *
 * Deliberately absent: ToastContainer (singleton mount -- use `MMA.toast`),
 * MeasurementBar (reads map state), SettingsSearchContext/useSettingsSearch
 * (Settings-dialog plumbing), Trans (i18n infra).
 */

declare const primitives_Bar: typeof Bar;
declare const primitives_Button: typeof Button;
declare const primitives_Checkbox: typeof Checkbox;
declare const primitives_ColorPicker: typeof ColorPicker;
declare const primitives_CoverageBar: typeof CoverageBar;
declare const primitives_DatePicker: typeof DatePicker;
declare const primitives_Dialog: typeof Dialog;
declare const primitives_DialogContent: typeof DialogContent;
export type primitives_DialogProps = DialogProps;
declare const primitives_DialogTrigger: typeof DialogTrigger;
declare const primitives_EmptyState: typeof EmptyState;
declare const primitives_Field: typeof Field;
declare const primitives_Flag: typeof Flag;
declare const primitives_Hint: typeof Hint;
declare const primitives_HotkeyInput: typeof HotkeyInput;
declare const primitives_Icon: typeof Icon;
declare const primitives_IconButton: typeof IconButton;
declare const primitives_InfoButton: typeof InfoButton;
declare const primitives_NSelect: typeof NSelect;
declare const primitives_Notice: typeof Notice;
declare const primitives_ProgressRow: typeof ProgressRow;
declare const primitives_Radio: typeof Radio;
declare const primitives_Section: typeof Section;
declare const primitives_SegmentedControl: typeof SegmentedControl;
export type primitives_SegmentedOption<T extends string | number> = SegmentedOption<T>;
declare const primitives_SelectorPicker: typeof SelectorPicker;
declare const primitives_SettingRow: typeof SettingRow;
declare const primitives_Sidebar: typeof Sidebar;
declare const primitives_Slider: typeof Slider;
declare const primitives_Spinner: typeof Spinner;
declare const primitives_SuggestInput: typeof SuggestInput;
declare const primitives_Switch: typeof Switch;
declare const primitives_SwitchRow: typeof SwitchRow;
declare const primitives_TagPill: typeof TagPill;
declare const primitives_TagPillButton: typeof TagPillButton;
declare const primitives_TextInput: typeof TextInput;
declare const primitives_ToolBlock: typeof ToolBlock;
declare const primitives_Tooltip: typeof Tooltip;
declare const primitives_useCloseDialog: typeof useCloseDialog;
declare namespace primitives {
  export { primitives_Bar as Bar, primitives_Button as Button, primitives_Checkbox as Checkbox, primitives_ColorPicker as ColorPicker, primitives_CoverageBar as CoverageBar, primitives_DatePicker as DatePicker, primitives_Dialog as Dialog, primitives_DialogContent as DialogContent, primitives_DialogTrigger as DialogTrigger, primitives_EmptyState as EmptyState, primitives_Field as Field, primitives_Flag as Flag, primitives_Hint as Hint, primitives_HotkeyInput as HotkeyInput, primitives_Icon as Icon, primitives_IconButton as IconButton, primitives_InfoButton as InfoButton, primitives_NSelect as NSelect, primitives_Notice as Notice, primitives_ProgressRow as ProgressRow, primitives_Radio as Radio, primitives_Section as Section, primitives_SegmentedControl as SegmentedControl, primitives_SelectorPicker as SelectorPicker, primitives_SettingRow as SettingRow, primitives_Sidebar as Sidebar, primitives_Slider as Slider, primitives_Spinner as Spinner, primitives_SuggestInput as SuggestInput, primitives_Switch as Switch, primitives_SwitchRow as SwitchRow, primitives_TagPill as TagPill, primitives_TagPillButton as TagPillButton, primitives_TextInput as TextInput, primitives_ToolBlock as ToolBlock, primitives_Tooltip as Tooltip, primitives_useCloseDialog as useCloseDialog };
  export type { primitives_DialogProps as DialogProps, primitives_SegmentedOption as SegmentedOption };
}

/** The nested `ui` namespace on the plugin surface: the primitives module and nothing else. */
declare const ui: typeof primitives;

declare const uiSurface_ui: typeof ui;
declare namespace uiSurface {
  export {
    uiSurface_ui as ui,
  };
}

export interface EnrichFieldOption {
    key: string;
    label: string;
    /** Excluded from the default field set (null enrichFields); user must opt in. */
    defaultOff?: boolean;
}
/** Field defs for catalog keys, for providers that write well-known SV fields. */
declare function knownFieldDefs(...keys: string[]): Record<string, ExtraFieldDef>;
declare function getEnrichFieldOptions(): EnrichFieldOption[];
/** Offer extra fields in the enrichment UI. Unregistered when the plugin deactivates. */
declare function registerEnrichFields(fields: EnrichFieldOption[]): void;
declare function getAllEnrichKeys(): string[];
/** Keys enriched when enrichFields is null (the default set: all options except defaultOff ones). */
declare function getDefaultEnrichKeys(): string[];
/** A unit of work for the procedure engine: which module, and how to drive it. */
export interface ProcedureSpec<TCollected = unknown> {
    readonly collects?: TCollected;
    entry: string;
    select?: Selector;
    batch: BatchMode;
    sink?: Sink;
    rate?: RateSpec;
    /** Overrides the engine's transient-status retry default. Omit unless this endpoint
     *  answers a retryable condition with a status the default does not cover. */
    retry?: {
        attempts: number;
        on: number[];
    };
    inflight?: number;
    instances?: number;
    config?: unknown;
    prepare?: () => Promise<boolean>;
}
/** Optional context passed by the bulk runner. Cheap providers can ignore it. */
export interface EnrichCtx {
    signal?: AbortSignal;
    force?: boolean;
    /** Advance the bulk progress bar by one unit. */
    onUnit?: () => void;
    /** Report a location that errored (surfaced as failed in the bulk summary). */
    onFail?: (id: number) => void;
}
export interface EnrichmentProvider {
    id: string;
    /** Bulk progress label for slow providers; omit for instant ones. */
    label?: string;
    /** Rust procedure engine path. Google SV ops use this; alt-provider plugins keep `enrich`. */
    procedure?: ProcedureSpec;
    /** JS-side enrich for fork providers (baidu/tencent/yandex/apple) and plugins not yet
     *  converted to procedure.js. */
    enrich?(locations: Location[], enrichFields: string[] | null, ctx?: EnrichCtx): Promise<Map<number, Record<string, unknown>>>;
    fieldDefs?: Record<string, ExtraFieldDef>;
    provides?: string[];
    requires?: string[];
    units?(locations: Location[], enrichFields: string[] | null, force?: boolean): number;
    transform?(field: string, value: string, location: Location): string | null;
}
/** Schedule providers into dependency waves: a provider runs once no other
 *  unscheduled provider produces (via `fieldDefs`) a field it `requires`.
 *  A dependency cycle falls back to running the remainder as one wave. */
declare function providerWaves(list: EnrichmentProvider[]): EnrichmentProvider[][];
/** Register a provider that computes extra fields during enrichment (e.g. sun position).
 *  Unregistered when the plugin deactivates. */
declare function registerEnrichmentProvider(provider: EnrichmentProvider): void;
declare function getEnrichmentProviders(): EnrichmentProvider[];
declare function getProviderForField(field: string): EnrichmentProvider | undefined;
declare function isFieldEnabled(enrichFields: string[] | null, key: string): boolean;
/** Every field derived from the `changed` keys, directly or through other providers: what a
 *  row must forget when those inputs change, for enrichment to derive again. The graph is
 *  each provider's `requires` against what it produces. */
declare function derivedFrom(changed: Iterable<string>): Set<string>;
/** `extra` without every field derived from the `changed` keys. */
declare function withoutDerivedFrom(extra: Record<string, unknown> | null, changed: Iterable<string>): Record<string, unknown> | null;
declare function filterEnrichPatch(patch: Record<string, unknown>, enrichFields: string[] | null): Record<string, unknown>;

export type fieldDefs_EnrichCtx = EnrichCtx;
export type fieldDefs_EnrichFieldOption = EnrichFieldOption;
export type fieldDefs_EnrichmentProvider = EnrichmentProvider;
export type fieldDefs_ProcedureSpec<TCollected = unknown> = ProcedureSpec<TCollected>;
declare const fieldDefs_derivedFrom: typeof derivedFrom;
declare const fieldDefs_filterEnrichPatch: typeof filterEnrichPatch;
declare const fieldDefs_getAllEnrichKeys: typeof getAllEnrichKeys;
declare const fieldDefs_getDefaultEnrichKeys: typeof getDefaultEnrichKeys;
declare const fieldDefs_getEnrichFieldOptions: typeof getEnrichFieldOptions;
declare const fieldDefs_getEnrichmentProviders: typeof getEnrichmentProviders;
declare const fieldDefs_getProviderForField: typeof getProviderForField;
declare const fieldDefs_isFieldEnabled: typeof isFieldEnabled;
declare const fieldDefs_knownFieldDefs: typeof knownFieldDefs;
declare const fieldDefs_providerWaves: typeof providerWaves;
declare const fieldDefs_registerEnrichFields: typeof registerEnrichFields;
declare const fieldDefs_registerEnrichmentProvider: typeof registerEnrichmentProvider;
declare const fieldDefs_withoutDerivedFrom: typeof withoutDerivedFrom;
declare namespace fieldDefs {
  export { fieldDefs_derivedFrom as derivedFrom, fieldDefs_filterEnrichPatch as filterEnrichPatch, fieldDefs_getAllEnrichKeys as getAllEnrichKeys, fieldDefs_getDefaultEnrichKeys as getDefaultEnrichKeys, fieldDefs_getEnrichFieldOptions as getEnrichFieldOptions, fieldDefs_getEnrichmentProviders as getEnrichmentProviders, fieldDefs_getProviderForField as getProviderForField, fieldDefs_isFieldEnabled as isFieldEnabled, fieldDefs_knownFieldDefs as knownFieldDefs, fieldDefs_providerWaves as providerWaves, fieldDefs_registerEnrichFields as registerEnrichFields, fieldDefs_registerEnrichmentProvider as registerEnrichmentProvider, fieldDefs_withoutDerivedFrom as withoutDerivedFrom };
  export type { fieldDefs_EnrichCtx as EnrichCtx, fieldDefs_EnrichFieldOption as EnrichFieldOption, fieldDefs_EnrichmentProvider as EnrichmentProvider, fieldDefs_ProcedureSpec as ProcedureSpec };
}

/** True when `key` is a built-in Location field (stored top-level, not under `extra`). */
declare function isBuiltinField(key: string): boolean;
declare function isWritableField(key: string): boolean;
/** False for identity fields (lat/lng) and expression terms, which pickers must not offer. */
declare function isListableField(key: string): boolean;
/** All built-in field keys (excluding virtual). */
declare function getBuiltinKeys(): string[];
/** Register field definitions from an enrichment provider (called at activation). */
declare function registerPluginFieldDefs(defs: Record<string, ExtraFieldDef>): void;
/** Remove plugin field definitions by key (called when a plugin is deactivated). */
declare function unregisterPluginFieldDefs(keys: string[]): void;
/** Load user-customized field definitions from `MapMeta.extra.fields` (called on map open). */
declare function setUserFieldDefs(defs: Record<string, ExtraFieldDef>): void;
/** Merge auto-registered/inferred defs into the user layer (e.g. after a mutation
 *  discovers new extra keys). Existing entries win, so user edits and previously-loaded
 *  defs are never clobbered. Keeps the registry the live source of truth without a reload. */
declare function mergeUserFieldDefs(defs: Record<string, ExtraFieldDef>): void;
/** Clear per-map state on map close. Plugin defs persist across maps. */
declare function resetForMapChange(): void;
/** Look up metadata for a single field key. Returns `undefined` if no metadata exists. */
declare function getFieldDef(key: string): ExtraFieldDef | undefined;
/** Translated display label for a field key, falling back to a sentence-cased version of the key. */
declare function fieldLabel(key: string): string;
/** Display text for one *value* of a field, the counterpart to [`fieldLabel`] naming the
 *  field itself. Enum values carry translated display names; everything else is its own
 *  string. */
declare function fieldValueLabel(def: ExtraFieldDef | undefined, value: unknown): string;
/** Merged view of all field definitions across all layers. */
declare function getAllFieldDefs(): Record<string, ExtraFieldDef>;
export interface FieldProjection {
    id: string;
    label: string;
    needsTz: boolean;
}
declare function projectionsForType(type: ExtraFieldType): FieldProjection[];
declare const RANGE_ID = "range";
declare function partitionKeyOptions(type: ExtraFieldType, rangeForDates: boolean): {
    id: string;
    label: string;
}[];

export type fieldDefRegistry_FieldProjection = FieldProjection;
declare const fieldDefRegistry_RANGE_ID: typeof RANGE_ID;
declare const fieldDefRegistry_fieldLabel: typeof fieldLabel;
declare const fieldDefRegistry_fieldValueLabel: typeof fieldValueLabel;
declare const fieldDefRegistry_getAllFieldDefs: typeof getAllFieldDefs;
declare const fieldDefRegistry_getBuiltinKeys: typeof getBuiltinKeys;
declare const fieldDefRegistry_getFieldDef: typeof getFieldDef;
declare const fieldDefRegistry_isBuiltinField: typeof isBuiltinField;
declare const fieldDefRegistry_isListableField: typeof isListableField;
declare const fieldDefRegistry_isWritableField: typeof isWritableField;
declare const fieldDefRegistry_mergeUserFieldDefs: typeof mergeUserFieldDefs;
declare const fieldDefRegistry_partitionKeyOptions: typeof partitionKeyOptions;
declare const fieldDefRegistry_projectionsForType: typeof projectionsForType;
declare const fieldDefRegistry_registerPluginFieldDefs: typeof registerPluginFieldDefs;
declare const fieldDefRegistry_resetForMapChange: typeof resetForMapChange;
declare const fieldDefRegistry_setUserFieldDefs: typeof setUserFieldDefs;
declare const fieldDefRegistry_unregisterPluginFieldDefs: typeof unregisterPluginFieldDefs;
declare namespace fieldDefRegistry {
  export { fieldDefRegistry_RANGE_ID as RANGE_ID, fieldDefRegistry_fieldLabel as fieldLabel, fieldDefRegistry_fieldValueLabel as fieldValueLabel, fieldDefRegistry_getAllFieldDefs as getAllFieldDefs, fieldDefRegistry_getBuiltinKeys as getBuiltinKeys, fieldDefRegistry_getFieldDef as getFieldDef, fieldDefRegistry_isBuiltinField as isBuiltinField, fieldDefRegistry_isListableField as isListableField, fieldDefRegistry_isWritableField as isWritableField, fieldDefRegistry_mergeUserFieldDefs as mergeUserFieldDefs, fieldDefRegistry_partitionKeyOptions as partitionKeyOptions, fieldDefRegistry_projectionsForType as projectionsForType, fieldDefRegistry_registerPluginFieldDefs as registerPluginFieldDefs, fieldDefRegistry_resetForMapChange as resetForMapChange, fieldDefRegistry_setUserFieldDefs as setUserFieldDefs, fieldDefRegistry_unregisterPluginFieldDefs as unregisterPluginFieldDefs };
  export type { fieldDefRegistry_FieldProjection as FieldProjection };
}

/**
 * Driver for the Rust procedure engine. A bulk operation is one or more procedures plus
 * a `Selector`: the engine resolves the selector, gates providers on their dependencies, pages
 * the locations, calls each procedure and delivers what it answers, as patches or back
 * to the caller. Locations never reach JS.
 */

/** Entry point of a procedure this app bundles. Plugins ship their own paths. */
declare const procedureEntry: (name: string) => string;
/** Ask a procedure a read-only question. `input` and the answer are the module's own
 *  contract -- the engine only carries the JSON. Rejects when the module exports no
 *  `query` or the call fails, and with the signal's reason once `signal` aborts, at
 *  which point the engine declines the query's remaining requests. `T` is an unchecked
 *  assertion over that contract: sound for the app's own `res://` modules, which are
 *  pinned by tests. Validate instead of naming a `T` when the module is a plugin's. */
declare function queryProcedure<T = unknown>(entry: string, input: unknown, config?: unknown, signal?: AbortSignal): Promise<T>;
/** Display labels for a field's partition keys, from the procedure that owns the field.
 *  A module with no `label` query -- or one answering anything but a matching array of
 *  strings -- leaves the keys as they are. */
declare function resolveFieldLabels(field: string, keys: string[]): Promise<string[]>;
/** One location's answer from a `collect` run, as its module defines it. */
export interface CollectedEntry<T = unknown> {
    id: number;
    value: T;
}
export interface ResolverOutcome<TCollected = unknown> {
    /** Rows the procedure worked and did not fail. A count: the engine never ships the
     *  ids of what went right. */
    success: number;
    /** Rows the procedure failed, by id, so a caller can select them. */
    failed: number[];
    /** Answers from a `collect` run, in page order. Absent for a run whose results were
     *  written as patches. Typed by the spec's declaration, not checked: the value still
     *  crosses a JSON boundary, so a reader guards it. */
    collected?: CollectedEntry<TCollected>[];
}
/** Whether a pass did anything worth a summary row. */
declare function outcomeDidWork(o: ResolverOutcome): boolean;
export type SvRunResult = Record<string, ResolverOutcome>;
/** What a non-enrich bulk run reports: how many rows it worked, and the ids it could not. */
export interface BatchOutcome {
    succeeded: number;
    failed: number[];
}
/** One provider's own progress. Counts are net of skipped rows. */
export interface ProviderPart {
    label: string;
    done: number;
    total: number;
    failed: number;
    finished: boolean;
}
/** @deprecated Use {@link ProviderPart}. */
export type PhasePart = ProviderPart;
export interface RunOpts {
    signal?: AbortSignal;
    force?: boolean;
    /** The `extra` keys the run should produce; null means the default set. */
    enrichFields?: string[] | null;
    /** `done`/`total` are rows finished through every provider in the run -- the slowest
     *  provider's count, so the bar is monotonic and full means fully enriched. `parts`
     *  carries each labeled provider's own counts for the whole run, zeros until it
     *  starts, and is ordered as declared. `label` is kept so existing callers still type-check. */
    onProgress?: (done: number, total: number, label?: string, parts?: ProviderPart[]) => void;
}
/** A provider to run, optionally overriding the config its procedure declares. */
export interface ProviderRun {
    provider: EnrichmentProvider;
    config?: unknown;
    /** Re-derive this provider's fields even on an unforced run. For an operation whose
     *  point is to recompute one provider rather than fill in what is missing. */
    force?: boolean;
}
/** Providers `enrichAll` runs implicitly: the ones producing selectable `extra` fields. */
declare function enrichFieldProviders(): EnrichmentProvider[];
/** Drive a set of enrichment providers through the engine as one run.
 *  Locations never reach JS: the engine pages them, calls each procedure and writes the
 *  patches itself, reporting per-provider progress that this narrows to the wave in
 *  flight for the caller's bar. Resolves once every declared provider reports finished,
 *  or on abort. */
declare function runProviders(items: ProviderRun[], selector: Selector, opts?: RunOpts): Promise<SvRunResult>;
/** What a run may set on top of what the spec declares. */
export interface DeclOpts {
    label?: string;
    /** Replaces the spec's `config`. */
    config?: unknown;
    /** `collect` takes the answers instead of writing them. */
    sink?: Sink;
    /** Re-derive even on an unforced run: recompute rather than fill in what is missing. */
    force?: boolean;
    fields?: string[];
    requires?: string[];
    invalidates?: Record<string, string[]>;
}
/** Run one procedure over `selector`, on its own. The primitive: a consumer that is not
 *  enrichment (validation, a download resolving pano ids) declares a spec and calls this,
 *  and gets its collected answers typed by the spec. */
declare function runProcedure<T>(spec: ProcedureSpec<T>, selector: Selector, opts: RunOpts & Omit<DeclOpts, "fields" | "requires"> & {
    id: string;
}): Promise<ResolverOutcome<T>>;
/** Every field-producing provider over a fixed id set, with no progress reporting. */
declare function runProvidersForIds(ids: number[], opts: {
    enrichFields: string[] | null;
    force?: boolean;
    signal?: AbortSignal;
    excludeIds?: string[];
}): Promise<void>;

export type procedures_BatchOutcome = BatchOutcome;
export type procedures_CollectedEntry<T = unknown> = CollectedEntry<T>;
export type procedures_PhasePart = PhasePart;
export type procedures_ProviderPart = ProviderPart;
export type procedures_ProviderRun = ProviderRun;
export type procedures_ResolverOutcome<TCollected = unknown> = ResolverOutcome<TCollected>;
export type procedures_RunOpts = RunOpts;
export type procedures_SvRunResult = SvRunResult;
declare const procedures_enrichFieldProviders: typeof enrichFieldProviders;
declare const procedures_outcomeDidWork: typeof outcomeDidWork;
declare const procedures_procedureEntry: typeof procedureEntry;
declare const procedures_queryProcedure: typeof queryProcedure;
declare const procedures_resolveFieldLabels: typeof resolveFieldLabels;
declare const procedures_runProcedure: typeof runProcedure;
declare const procedures_runProviders: typeof runProviders;
declare const procedures_runProvidersForIds: typeof runProvidersForIds;
declare namespace procedures {
  export { procedures_enrichFieldProviders as enrichFieldProviders, procedures_outcomeDidWork as outcomeDidWork, procedures_procedureEntry as procedureEntry, procedures_queryProcedure as queryProcedure, procedures_resolveFieldLabels as resolveFieldLabels, procedures_runProcedure as runProcedure, procedures_runProviders as runProviders, procedures_runProvidersForIds as runProvidersForIds };
  export type { procedures_BatchOutcome as BatchOutcome, procedures_CollectedEntry as CollectedEntry, procedures_PhasePart as PhasePart, procedures_ProviderPart as ProviderPart, procedures_ProviderRun as ProviderRun, procedures_ResolverOutcome as ResolverOutcome, procedures_RunOpts as RunOpts, procedures_SvRunResult as SvRunResult };
}

export type RequireNonNull<T> = {
    [P in keyof T]-?: NonNullable<T[P]>;
};
export type Nullable<T> = {
    [K in keyof T]: T[K] | null;
};
export type Rename<T, Map extends Record<string, string>> = {
    [K in keyof T as K extends keyof Map ? Map[K] : K]: T[K];
};

export interface GeoDisplay {
    address: string;
    countryCode: string | null;
}

export type PendingEntryLocation = RequireNonNull<Pick<Location, "lat" | "lng" | "panoId">> & Nullable<Rename<Pick<Location, "id">, {
    id: "locationId";
}>>;
declare function seenSkipNext(panoId: string): void;
declare function seenUpdateGeo(geo: GeoDisplay): void;
declare function seenPanoChanged(location: PendingEntryLocation, geo: GeoDisplay | null, getPov: () => LocationPOV): void;
declare function seenFlush(getPov: () => LocationPOV): void;
/** Fetch a page of the seen (visited-panorama) history. */
declare function getSeenEntries(limit?: number, offset?: number, filter?: SeenFilter, thumbnails?: boolean): Promise<SeenEntry[]>;
/** Number of seen entries matching the filter (all when omitted). */
declare function getSeenCount(filter?: SeenFilter): Promise<number>;
declare function getSeenCountries(): Promise<string[]>;
declare function getSeenMaps(): Promise<{
    id: string;
    name: string;
}[]>;
/** Delete the entire seen history. Not undoable. */
declare function clearSeen(): Promise<void>;

declare const seen_clearSeen: typeof clearSeen;
declare const seen_getSeenCount: typeof getSeenCount;
declare const seen_getSeenCountries: typeof getSeenCountries;
declare const seen_getSeenEntries: typeof getSeenEntries;
declare const seen_getSeenMaps: typeof getSeenMaps;
declare const seen_seenFlush: typeof seenFlush;
declare const seen_seenPanoChanged: typeof seenPanoChanged;
declare const seen_seenSkipNext: typeof seenSkipNext;
declare const seen_seenUpdateGeo: typeof seenUpdateGeo;
declare namespace seen {
  export {
    seen_clearSeen as clearSeen,
    seen_getSeenCount as getSeenCount,
    seen_getSeenCountries as getSeenCountries,
    seen_getSeenEntries as getSeenEntries,
    seen_getSeenMaps as getSeenMaps,
    seen_seenFlush as seenFlush,
    seen_seenPanoChanged as seenPanoChanged,
    seen_seenSkipNext as seenSkipNext,
    seen_seenUpdateGeo as seenUpdateGeo,
  };
}

export interface ResolvedPano {
    pano: google.maps.StreetViewResolvedPanoramaData | null;
    isFallback: boolean;
}

declare let singletonPano: google.maps.StreetViewPanorama | null;
declare const singletonDiv: HTMLDivElement;
declare function getPanorama(): google.maps.StreetViewPanorama | null;
/** The live viewer's camera in the stored zoom domain. Zeroed if there is no viewer. */
declare function capturePov(pano?: google.maps.StreetViewPanorama | null): LocationPOV;
/** Read the live viewer back into Location fields, the inverse of {@link applyResolved}.
 *  Null until the viewer has a position. Accepts an alt-provider panorama. */
declare function capturePano(pano?: google.maps.StreetViewPanorama | null): PanoCapture | null;
declare function clearSingletonPano(): void;
declare function applyResolved(sv: google.maps.StreetViewPanorama, result: ResolvedPano, loc: Location): void;
/** Open a seen entry's panorama in the Street View viewer. */
declare function loadSeenPano(entry: SeenEntry): Promise<void>;

declare const panoSingleton_applyResolved: typeof applyResolved;
declare const panoSingleton_capturePano: typeof capturePano;
declare const panoSingleton_capturePov: typeof capturePov;
declare const panoSingleton_clearSingletonPano: typeof clearSingletonPano;
declare const panoSingleton_getPanorama: typeof getPanorama;
declare const panoSingleton_loadSeenPano: typeof loadSeenPano;
declare const panoSingleton_singletonDiv: typeof singletonDiv;
declare const panoSingleton_singletonPano: typeof singletonPano;
declare namespace panoSingleton {
  export {
    panoSingleton_applyResolved as applyResolved,
    panoSingleton_capturePano as capturePano,
    panoSingleton_capturePov as capturePov,
    panoSingleton_clearSingletonPano as clearSingletonPano,
    panoSingleton_getPanorama as getPanorama,
    panoSingleton_loadSeenPano as loadSeenPano,
    panoSingleton_singletonDiv as singletonDiv,
    panoSingleton_singletonPano as singletonPano,
  };
}

/** True when the location is missing any of the given enrich fields (default: the enabled set). */
declare function needsEnrichment(loc: Location, enrichFields?: string[]): boolean;
/** Enrich a single location (used on pano load). `data` is the answer the caller
 *  already has from the `metadata` query; without one this fetches it. The patch is the
 *  same one the svMeta procedure writes in a run. */
declare function enrich(loc: Location, data?: Pano | null, signal?: AbortSignal): Promise<boolean>;
export interface PanoResolveConfig {
    radius: number;
    /** The enrich fields the run is after. Set, the prelude resolves a pano only for a
     *  row that still lacks one of them: resolving is a means to their metadata, not a
     *  goal, so a fully enriched row keeps its coordinates-only state. Unset, every row
     *  without a pano is resolved (pinning, heading). */
    needs?: string[];
}
/** Pano id from coordinates, via the location search `StreetViewService.getPanorama`
 *  sends. A row that already has a pano id is left alone unless the run is forced:
 *  `force` re-resolves, which is what pinning asks for. Under `collect` it answers the
 *  patch it would have written. */
declare const panoResolveSpec: ProcedureSpec<{
    panoId: string;
}>;
/** `panoResolveSpec` as enrichment schedules it: it writes the `panoId` column, so every
 *  provider that reads a panorama requires it and the engine puts it in the first wave. */
declare const panoResolveProvider: EnrichmentProvider;
/** Exact capture timestamp: the procedure narrows the `imageDate` month against
 *  Google's SingleImageSearch per location. */
declare const exactDateProvider: EnrichmentProvider;
/** Timezone at the location, once a `datetime` exists to interpret. The tz-lookup
 *  quadtree ships inside the module. */
declare const timezoneProvider: EnrichmentProvider;
/** Subdivision (adm1) via offline point-in-polygon against the local border dataset.
 *  No Google dependency; downloads the adm1 archive on first use. */
declare const subdivisionProvider: EnrichmentProvider;
/** Core pano metadata via Google's GetMetadata RPC, decoded inside the module. */
declare const svMetaProvider: EnrichmentProvider;
/** One summary row per pass that did work: the core metadata pass, then every
 *  provider that updated or failed at least one location. */
export interface EnrichOutcome extends ResolverOutcome {
    id: string;
    label: string;
}
export type EnrichResult = EnrichOutcome[];
/** Bulk enrich a selector: resolve missing pano ids, then run every field-producing
 *  provider (metadata, exact date, timezone, subdivision) through the Rust engine. */
declare function enrichAll$1(selector: Selector, opts?: {
    signal?: AbortSignal;
    force?: boolean;
    onProgress?: (done: number, total: number, label?: string, parts?: ProviderPart[]) => void;
}): Promise<EnrichResult>;

export type enrich$1_EnrichOutcome = EnrichOutcome;
export type enrich$1_EnrichResult = EnrichResult;
export type enrich$1_PanoResolveConfig = PanoResolveConfig;
declare const enrich$1_enrich: typeof enrich;
declare const enrich$1_exactDateProvider: typeof exactDateProvider;
declare const enrich$1_needsEnrichment: typeof needsEnrichment;
declare const enrich$1_panoResolveProvider: typeof panoResolveProvider;
declare const enrich$1_panoResolveSpec: typeof panoResolveSpec;
declare const enrich$1_subdivisionProvider: typeof subdivisionProvider;
declare const enrich$1_svMetaProvider: typeof svMetaProvider;
declare const enrich$1_timezoneProvider: typeof timezoneProvider;
declare namespace enrich$1 {
  export { enrich$1_enrich as enrich, enrichAll$1 as enrichAll, enrich$1_exactDateProvider as exactDateProvider, enrich$1_needsEnrichment as needsEnrichment, enrich$1_panoResolveProvider as panoResolveProvider, enrich$1_panoResolveSpec as panoResolveSpec, enrich$1_subdivisionProvider as subdivisionProvider, enrich$1_svMetaProvider as svMetaProvider, enrich$1_timezoneProvider as timezoneProvider };
  export type { enrich$1_EnrichOutcome as EnrichOutcome, enrich$1_EnrichResult as EnrichResult, enrich$1_PanoResolveConfig as PanoResolveConfig };
}

/**
 * Generic engine for Street-View-dependent bulk operations. Every such op derives
 * a `Partial<Location>` from a location's pano data; each is a `SvResolver`. The
 * runner does the shared work once -- resolve missing pano IDs, fetch metadata in
 * batches (with all-null bisection), merge every selected resolver's patch per
 * location, write once -- then runs the enrichment providers in dependency waves.
 *
 * `enrichAll` and `bulkPinToPano` are thin selectors over this engine; the modal's
 * "Street View" operation runs an arbitrary set of resolvers.
 */

export type PanoData = google.maps.StreetViewResolvedPanoramaData;
export interface SvResolver {
    id: string;
    label: string;
    /** Locations this resolver would act on, given `force` (drives counts + skip). */
    pending(loc: Location, force: boolean): boolean;
    /** Locations this resolver needs a coords->panoId resolution for (prelude). */
    needsPanoResolve?(loc: Location, force: boolean): boolean;
    /** Whether this resolver consumes fetched `PanoData` (joins the metadata phase).
     *  When a function, receives the config passed via `selected[].config`. */
    needsMetadata?: boolean | ((config: unknown) => boolean);
    /** Per-location patch derived in the metadata phase. `data` is null for resolvers
     *  that don't need metadata (they act off the prelude-resolved panoId).
     *  `ctx.resolvedPanoId` is set only when this run resolved the pano from coords. */
    resolve?(loc: Location, data: PanoData | null, ctx: {
        config: unknown;
        resolvedPanoId?: string;
    }): Partial<Location> | null;
    /** When set, the runner also runs the registered enrichment providers. */
    runsProviders?: boolean;
    fieldDefs?: Record<string, ExtraFieldDef>;
}

export interface PinPanoConfig {
    useLatest?: boolean;
}
/** Pin to pano ID: resolve the pano from coords, then set the LoadAsPanoId flag.
 *  With `useLatest`, fetches the timeline and picks the last official pano.
 *  The prelude re-resolves Google rows against official coverage only: the closest
 *  pano can be a photosphere, and a bulk pin must never relocate rows onto one. */
declare const pinPanoResolver: SvResolver;
/** Pin each location to a resolved panorama (sets `panoId`), so it always loads the same pano. */
declare function bulkPinToPano$1(locations: Location[], opts?: {
    signal?: AbortSignal;
    force?: boolean;
    useLatest?: boolean;
    onProgress?: (done: number, total: number) => void;
}): Promise<BatchOutcome>;

export type pinPano_PinPanoConfig = PinPanoConfig;
declare const pinPano_pinPanoResolver: typeof pinPanoResolver;
declare namespace pinPano {
  export { bulkPinToPano$1 as bulkPinToPano, pinPano_pinPanoResolver as pinPanoResolver };
  export type { pinPano_PinPanoConfig as PinPanoConfig };
}

export interface ValidateConfig {
    radius?: number;
    checkPinned?: boolean;
}
declare function validateOne(loc: Location, signal?: AbortSignal, config?: ValidateConfig): Promise<ValidationState>;
export interface ValidationProgress {
    progress: number;
    results: Map<ValidationState, Location[]>;
}
/** Check that each location's Street View coverage still exists; returns locations grouped
 *  by validation state. */
declare function validateLocations(locations: Location[], opts?: {
    signal?: AbortSignal;
    onProgress?: (p: ValidationProgress) => void;
    config?: ValidateConfig;
}): Promise<Map<ValidationState, Location[]>>;

export type validate_ValidateConfig = ValidateConfig;
export type validate_ValidationProgress = ValidationProgress;
declare const validate_validateLocations: typeof validateLocations;
declare const validate_validateOne: typeof validateOne;
declare namespace validate {
  export { validate_validateLocations as validateLocations, validate_validateOne as validateOne };
  export type { validate_ValidateConfig as ValidateConfig, validate_ValidationProgress as ValidationProgress };
}

/**
 * The surface a procedure module runs against: the global `mma` object and the values
 * that cross the boundary. Every host call is synchronous -- the guest blocks while the
 * host works, which is how `fetchMany` (never a loop over `fetch`) buys a procedure its
 * request concurrency.
 *
 * A procedure is an ES module bundled to one file. Its named exports are the entry
 * points: `request` + `map` (RequestMap), `map` (MapOnly) or `run` (Run), plus the
 * optional `query` and `configure`. Rows arrive as `Location`s and `run`/`map` answer
 * with `Update<LocationPatch>`s under the `patch` sink, or `Update<T>` of the module's
 * own answer under `collect`.
 */
export interface ProcedureRequest {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string | Uint8Array | ArrayBuffer;
}
export interface ProcedureResponse {
    /** 0 when the host could not issue the request at all. */
    status: number;
    body: Uint8Array;
}
export interface ProcedureHost {
    fetch(req: ProcedureRequest): ProcedureResponse;
    fetchMany(reqs: ProcedureRequest[]): ProcedureResponse[];
    classify(dataset: string, lat: number, lng: number): string | null;
    /** Run one sidecar command. `onLine` sees each output line as it arrives, so a
     *  procedure can report progress mid-run; the lines are also returned together. */
    sidecar(pluginId: string, command: string, payloadJson: string, onLine?: (line: string) => void): string[];
    /** 0 debug, 1 info, 2 warn, 3 error. `console.*` routes here. */
    log(level: number, msg: string): void;
    progress(units: number): void;
    /** Marks a row as failed rather than skipped. */
    fail(id: number): void;
    aborted(): boolean;
}
declare global {
    /** Reachable inside a procedure module only. `fetch`, `fetchMany` and `sidecar` are
     *  detached outside `run` and `query`; calling one elsewhere throws. */
    const mma: ProcedureHost;
}

/**
 * Google's SingleImageSearch RPC. The bodies are array-JSON ("json+protobuf"): a JSON
 * array whose element positions are the protobuf field numbers.
 *
 * `buildLocationSearchBody` mirrors what the Maps JS API sends for
 * `StreetViewService.getPanorama({location, radius})`: context.productId "apiv3"
 * (field 1), the LatLng + radius (field 2), and in the options (field 3) the search
 * preference (field 9) plus the source set (field 11: frontends 2, 3 and 10, each
 * enabled). Field 4 is the component mask. Locale and region are
 * omitted -- they only localize descriptions nothing here reads.
 *
 * Leaf module: `panoAtCoords`/`panosAtCoords` run against the procedure host (`mma`)
 * and only work inside a procedure. The body builders and the reader are pure.
 */

/** Which pano a location search picks. An omitted preference goes on the wire as
 *  `Nearest`; the Maps JS API's encoder has no other default, whatever its docs say. */
declare const enum SearchPreference {
    Best = 1,
    Nearest = 2
}
export interface SearchOpts {
    sources?: PanoType[];
    preference?: SearchPreference;
}

/** Full pano metadata for arbitrarily many panos, aligned to `panoIds`. The procedure
 *  dedupes and splits at GetMetadata's 200-per-request cap itself. */
declare function svMetadata(panoIds: string[], signal?: AbortSignal): Promise<(Pano | null)[]>;
/** The nearest pano to each point, aligned to `points`, null where there is no coverage.
 *  `opts.sources` narrows which collections are searched (`[PanoType.Official]` is what
 *  `sources: ["google"]` means to the Maps JS API) and `opts.preference` picks nearest or
 *  best. The procedure hands every point to the host at once, so how many run concurrently
 *  stays the engine's call. */
declare function panosAt(points: LatLng[], radius?: number, opts?: SearchOpts, signal?: AbortSignal): Promise<(Pano | null)[]>;

declare const query_panosAt: typeof panosAt;
declare const query_svMetadata: typeof svMetadata;
declare namespace query {
  export {
    query_panosAt as panosAt,
    query_svMetadata as svMetadata,
  };
}

export interface MapEmbedPrefs {
    svOpacity: number;
    svVisible: boolean;
    svColor: SvColor;
    showLabels: boolean;
    showTerrain: boolean;
    svPanoramas: boolean;
    svCoverageType: SvCoverageType;
    svThickness: SvThickness;
    svBlobby: boolean;
    boldCountryBorders: boolean;
    boldSubdivisionBorders: boolean;
    hideRoadLabels: boolean;
    hidePoi: boolean;
    hideTransit: boolean;
    hideHighways: boolean;
    mapStyleName: string;
    vectorStyleName: string;
    mapType: MapTypeKey;
    markerStyle: MarkerStyle;
    markerOpacity: number;
    markerVisible: boolean;
    markerSize: number;
    showSvCoverage: boolean;
    showPerfectScoreCircle: boolean;
    showSearchRadiusCursor: boolean;
    showPreviews: boolean;
    selectOnly: boolean;
}

export interface MapStyle {
    featureType?: string;
    elementType?: string;
    stylers: Record<string, any>[];
}

export interface CustomStyle {
    name: string;
    style: MapStyle[];
}

export interface HostInstances {
    google: google.maps.Map;
    maplibre: maplibregl.Map;
}
export type MapHostKind = keyof HostInstances;
export interface DeckOverlayProps {
    layers: Layer[];
    onClick?: (info: PickingInfo, domEvent?: Event) => void;
    onHover?: (info: PickingInfo, domEvent?: Event) => void;
    onError?: (e: unknown) => void;
}
export interface DeckOverlayHandle {
    setProps(props: Partial<DeckOverlayProps>): void;
    finalize(): void;
}
export interface MapHostEvents {
    mousemove: LatLng;
    mousedown: LatLng;
    mouseup: LatLng;
    mouseout: void;
    zoom: void;
    camera: void;
    tilesloaded: void;
}
export interface BasemapOpts {
    useBlobby?: boolean;
    customStyles: CustomStyle[];
}
export interface MapHostContract<K extends MapHostKind = MapHostKind> {
    readonly kind: K;
    readonly container: HTMLElement;
    getHostInstance(): HostInstances[K];
    getZoom(): number;
    setZoom(zoom: number): void;
    getCenter(): LatLng | null;
    getBounds(): Bounds | null;
    panTo(p: LatLng): void;
    moveCamera(opts: {
        center?: LatLng;
        zoom?: number;
    }): void;
    fitBounds(bounds: Bounds, padding?: number, opts?: {
        snap?: boolean;
    }): void;
    on<K extends keyof MapHostEvents>(event: K, fn: (arg: MapHostEvents[K]) => void): () => void;
    once<K extends keyof MapHostEvents>(event: K, fn: (arg: MapHostEvents[K]) => void): () => void;
    containerPxToLatLng(x: number, y: number): LatLng | null;
    setDraggable(v: boolean): void;
    /** CSS cursor over the map; null restores the host's default. */
    setCursor(v: string | null): void;
    setDoubleClickZoom(v: boolean): void;
    createDeckOverlay(): DeckOverlayHandle;
    triggerClickAt(latLng: LatLng): void;
    applyPrefs(prefs: MapEmbedPrefs, opts: BasemapOpts): void;
    setSvOpacity(v: number): void;
    resize(): void;
    destroy(): void;
}
export type MapHost = {
    [K in MapHostKind]: MapHostContract<K>;
}[MapHostKind];

declare function setMapHost(host: MapHost | null): void;
/**
 * This refers to the main editor map only.
 */
declare function getMapHost(): MapHost | null;
/**
 * Wait for the main editor map to be ready.
 * Every waiter shares one resolver so a map close mid-wait does not leave
 * older promises hanging on a discarded host.
 */
declare function waitForMapHost(): Promise<MapHost>;
/** Raw Google map of the editor surface; null on non-Google hosts (plugin API compat). */
declare function getGoogleMap$1(): google.maps.Map | null;
/** Resolves with the editor's Google map. On non-Google hosts this resolves null
 *  once the host is ready (plugins that draw on the raw map should degrade). */
declare function waitForGoogleMap$1(): Promise<google.maps.Map | null>;
declare function fitMapToBounds(bounds: Bounds | null | undefined, padding?: number, minExtent?: number): void;
export type ClickInterceptorResult = boolean | Promise<boolean>;
export type ClickInterceptor = (lat: number, lng: number, shiftKey: boolean) => ClickInterceptorResult;
declare function addClickInterceptor(fn: ClickInterceptor): () => void;
declare function tryInterceptClick(lat: number, lng: number, shiftKey?: boolean): Promise<boolean>;
export type DrawInterceptor = (rings: number[][][]) => boolean;
declare function setDrawInterceptor(fn: DrawInterceptor | null): void;
declare function tryInterceptDraw(rings: number[][][]): boolean;

declare const mapState_addClickInterceptor: typeof addClickInterceptor;
declare const mapState_fitMapToBounds: typeof fitMapToBounds;
declare const mapState_getMapHost: typeof getMapHost;
declare const mapState_setDrawInterceptor: typeof setDrawInterceptor;
declare const mapState_setMapHost: typeof setMapHost;
declare const mapState_tryInterceptClick: typeof tryInterceptClick;
declare const mapState_tryInterceptDraw: typeof tryInterceptDraw;
declare const mapState_waitForMapHost: typeof waitForMapHost;
declare namespace mapState {
  export {
    mapState_addClickInterceptor as addClickInterceptor,
    mapState_fitMapToBounds as fitMapToBounds,
    getGoogleMap$1 as getGoogleMap,
    mapState_getMapHost as getMapHost,
    mapState_setDrawInterceptor as setDrawInterceptor,
    mapState_setMapHost as setMapHost,
    mapState_tryInterceptClick as tryInterceptClick,
    mapState_tryInterceptDraw as tryInterceptDraw,
    waitForGoogleMap$1 as waitForGoogleMap,
    mapState_waitForMapHost as waitForMapHost,
  };
}

declare function getScene(): CellManager;
/** Packed scene positions the heatmap (and similar overlays) can sample without a
 *  store round trip. Refresh on `scene:changed`. */
declare function getScenePositions(): {
    ids: Uint32Array;
    positions: Float32Array;
};
declare function setMarkerDefaultColor(r: number, g: number, b: number): void;
/** Repaint the default marker color and tell Rust (for future deltas). The base layers take
 *  the colour as a constant, so this is O(1) rather than a rewrite of every marker. */
declare function recolorScene(mc: RGB): void;
declare function getMarkerDefaultColor(): [number, number, number, number];
/** Resolves when the most recently started full scene load has finished (or immediately if none is in flight). */
declare function whenSceneSettled(): Promise<void>;
/** Full (re)load from Rust for the whole world. Editor-driven on open / marker-style change. */
declare function loadScene(markerStyle: MarkerStyle, mc?: RGB): Promise<void>;
declare function clearScene(): void;
declare function startSceneEngine(): () => void;

declare const sceneStore_clearScene: typeof clearScene;
declare const sceneStore_getMarkerDefaultColor: typeof getMarkerDefaultColor;
declare const sceneStore_getScene: typeof getScene;
declare const sceneStore_getScenePositions: typeof getScenePositions;
declare const sceneStore_loadScene: typeof loadScene;
declare const sceneStore_recolorScene: typeof recolorScene;
declare const sceneStore_setMarkerDefaultColor: typeof setMarkerDefaultColor;
declare const sceneStore_startSceneEngine: typeof startSceneEngine;
declare const sceneStore_whenSceneSettled: typeof whenSceneSettled;
declare namespace sceneStore {
  export {
    sceneStore_clearScene as clearScene,
    sceneStore_getMarkerDefaultColor as getMarkerDefaultColor,
    sceneStore_getScene as getScene,
    sceneStore_getScenePositions as getScenePositions,
    sceneStore_loadScene as loadScene,
    sceneStore_recolorScene as recolorScene,
    sceneStore_setMarkerDefaultColor as setMarkerDefaultColor,
    sceneStore_startSceneEngine as startSceneEngine,
    sceneStore_whenSceneSettled as whenSceneSettled,
  };
}

export interface ToastEntry {
    id: number;
    message: string;
    progress?: {
        fraction: number;
        label?: string;
    };
}
declare function toast(message: string, duration?: number, container?: HTMLElement): void;
export interface ProgressHandle {
    update(fraction: number, label?: string): void;
    finish(message?: string, duration?: number): void;
}
declare function progressToast(message: string): ProgressHandle;
declare function getToasts(): ToastEntry[];

export type toast$1_ProgressHandle = ProgressHandle;
declare const toast$1_getToasts: typeof getToasts;
declare const toast$1_progressToast: typeof progressToast;
declare const toast$1_toast: typeof toast;
declare namespace toast$1 {
  export { toast$1_getToasts as getToasts, toast$1_progressToast as progressToast, toast$1_toast as toast };
  export type { toast$1_ProgressHandle as ProgressHandle };
}

export interface JobContext<P> {
    signal: AbortSignal;
    /** Push a progress value to the UI. Ignored once the job is cancelled. */
    report: (progress: P) => void;
}
export interface Job<R, P> {
    running: boolean;
    progress: P | null;
    result: R | null;
    /** Message from a failed run. Cancelling is not a failure and leaves this null. */
    error: string | null;
    run: () => void;
    cancel: () => void;
}
/** A user-triggered async job that reports progress and can be cancelled -- the
 *  run/cancel/progress/error state every long plugin action was keeping by hand.
 *  Cancelling aborts the signal and stops the UI immediately; nothing the job does
 *  afterwards can write back. Unmounting cancels. `run` while running is a no-op,
 *  so a double-clicked button cannot start two.
 *
 *  For work driven by changing deps rather than a click, use `useAsync`. */
declare function useJob<R = void, P = string>(fn: (ctx: JobContext<P>) => Promise<R>): Job<R, P>;

export type useJob$1_Job<R, P> = Job<R, P>;
export type useJob$1_JobContext<P> = JobContext<P>;
declare const useJob$1_useJob: typeof useJob;
declare namespace useJob$1 {
  export { useJob$1_useJob as useJob };
  export type { useJob$1_Job as Job, useJob$1_JobContext as JobContext };
}

/** @deprecated v0.8.1. Use `MMA.getMapHost()` and narrow via `hostInstance`. */
declare function getGoogleMap(): google.maps.Map | null;
/** @deprecated v0.8.1. Use `MMA.waitForMapHost()`. */
declare function waitForGoogleMap(): Promise<google.maps.Map | null>;
/** @deprecated v0.8.2. Read `MMA.getMapState().map`. */
declare function getCurrentMap(): MapData | null;
/** @deprecated v0.8.2. Read `MMA.getMapState().mapId`. */
declare function getCurrentMapId(): string | null;
/** @deprecated v0.8.2. Read `MMA.getMapState().activeLocation`. */
declare function getActiveLocation(): Location | null;
/** @deprecated v0.8.2. Read `MMA.getMapState().selectedLocationIds`. */
declare function getSelectedLocationIds(): SelectedIds;
/** @deprecated v0.8.2. Read `MMA.getMapState().workArea`. */
declare function getWorkArea(): WorkArea;
/** @deprecated v0.8.2. Read `MMA.getMapState().tagCounts`. */
declare function getTagCounts(): Record<number, number>;
/** @deprecated v0.8.2. Read `MMA.getMapState().knownFieldKeys`. */
declare function getKnownFieldKeys(): ReadonlySet<string>;
/** @deprecated v0.8.2. Read `MMA.getMapState().selections`. */
declare function getAllSelections(): Selection[];
/** @deprecated v0.8.2. Read `MMA.getMapState().ghostedSelections`. */
declare function getGhostedSelections(): ReadonlySet<string>;
/** @deprecated v0.8.2. Use `MMA.getActiveSelections()`. */
declare function getSelections(): Selection[];
/** @deprecated v0.8.2. Read `(await MMA.cmd.storeGetSummary()).dirtyCount`. */
declare function getDirtyCount(): Promise<number>;
/** @deprecated v0.8.4. Use `MMA.fetchLocations({ type: "Locations", locations: [id], name: null })`. */
declare function fetchLocation(id: number): Promise<Location>;
/** @deprecated v0.8.4. Use `MMA.fetchLocations({ type: "Locations", locations: ids, name: null })`. */
declare function fetchLocationsByIds(ids: number[]): Promise<Location[]>;
/** @deprecated v0.8.4. Use `MMA.fetchLocations({ type: "Everything" })`. */
declare function fetchAllLocations(): Promise<Location[]>;
/** Argument shape the bulk enrichment entry points still tolerate: plugins built against
 *  an older MMA hand them location rows. `asSelector` is the only place either shape is
 *  accepted -- the app's own code, and everything below the API surface, passes a Selector.
 *  @deprecated v0.9.2. Pass a Selector. */
export type SelectorOrLocations = Selector | Location[];
/** @deprecated v0.9.2. Pass a Selector to `MMA.enrichAll`/`MMA.bulkPinToPano` instead. */
declare function asSelector(target: SelectorOrLocations): Selector;
/** The old parallel "which locations" enum, replaced by `Selector` -- the same idea
 *  without a second language for it. `saved` resolved in JS and has no `Selector` form
 *  here; use `MMA.savedSelector(id)`.
 *  @deprecated v0.9.3. Pass a `Selector`. */
export type Scope = {
    kind: "all";
} | {
    kind: "selected";
} | {
    kind: "ids";
    ids: number[];
} | {
    kind: "props";
    props: Selector;
};
/** @deprecated v0.9.3. Pass a `Selector`. */
export type ScopeWithSaved = Scope | {
    kind: "saved";
    id: string;
};
/** @deprecated v0.9.3. Use `MMA.selectorForPick`, or build the `Selector` directly. */
declare function scopeToSelector(scope: ScopeWithSaved | Selector): Selector;
/** @deprecated v0.9.3. Use `MMA.scopeToSelector`. */
declare const scopeToProps: typeof scopeToSelector;
/** @deprecated v0.9.3. Use `MMA.resolveIds`. */
declare function scopeIds(scope: ScopeWithSaved | Selector): Promise<number[]>;
/** @deprecated v0.9.3. Use `MMA.countLocations`. */
declare function scopeCount(scope: ScopeWithSaved | Selector): Promise<number>;
/** @deprecated v0.9.3. Use `MMA.sampleFrom`. */
declare function sampleScope(scope: ScopeWithSaved | Selector, n: number): Promise<number[]>;
/** @deprecated v0.9.3. Use `MMA.resolveIds` (it returns every id, never null). */
declare function resolveScopeIds(scope: ScopeWithSaved | Selector): Promise<ReadonlyIdSet | null>;
/** @deprecated v0.9.3. Narrow with a `Selector` and let Rust resolve it. */
declare function applyScope(scope: ScopeWithSaved | Selector, pool: Location[]): Location[];
/** @deprecated v0.9.3. Use `MMA.useSelectorPick`. */
declare const useScope: typeof useSelectorPick;
/** @deprecated v0.9.3. Use `MMA.createSelectorPick`. */
declare const createScope: typeof createSelectorPick;

export type legacy_Scope = Scope;
export type legacy_ScopeWithSaved = ScopeWithSaved;
export type legacy_SelectorOrLocations = SelectorOrLocations;
declare const legacy_applyScope: typeof applyScope;
declare const legacy_asSelector: typeof asSelector;
declare const legacy_createScope: typeof createScope;
declare const legacy_fetchAllLocations: typeof fetchAllLocations;
declare const legacy_fetchLocation: typeof fetchLocation;
declare const legacy_fetchLocationsByIds: typeof fetchLocationsByIds;
declare const legacy_getActiveLocation: typeof getActiveLocation;
declare const legacy_getAllSelections: typeof getAllSelections;
declare const legacy_getCurrentMap: typeof getCurrentMap;
declare const legacy_getCurrentMapId: typeof getCurrentMapId;
declare const legacy_getDirtyCount: typeof getDirtyCount;
declare const legacy_getGhostedSelections: typeof getGhostedSelections;
declare const legacy_getGoogleMap: typeof getGoogleMap;
declare const legacy_getKnownFieldKeys: typeof getKnownFieldKeys;
declare const legacy_getSelectedLocationIds: typeof getSelectedLocationIds;
declare const legacy_getSelections: typeof getSelections;
declare const legacy_getTagCounts: typeof getTagCounts;
declare const legacy_getWorkArea: typeof getWorkArea;
declare const legacy_resolveScopeIds: typeof resolveScopeIds;
declare const legacy_sampleScope: typeof sampleScope;
declare const legacy_scopeCount: typeof scopeCount;
declare const legacy_scopeIds: typeof scopeIds;
declare const legacy_scopeToProps: typeof scopeToProps;
declare const legacy_scopeToSelector: typeof scopeToSelector;
declare const legacy_useScope: typeof useScope;
declare const legacy_waitForGoogleMap: typeof waitForGoogleMap;
declare namespace legacy {
  export { legacy_applyScope as applyScope, legacy_asSelector as asSelector, legacy_createScope as createScope, legacy_fetchAllLocations as fetchAllLocations, legacy_fetchLocation as fetchLocation, legacy_fetchLocationsByIds as fetchLocationsByIds, legacy_getActiveLocation as getActiveLocation, legacy_getAllSelections as getAllSelections, legacy_getCurrentMap as getCurrentMap, legacy_getCurrentMapId as getCurrentMapId, legacy_getDirtyCount as getDirtyCount, legacy_getGhostedSelections as getGhostedSelections, legacy_getGoogleMap as getGoogleMap, legacy_getKnownFieldKeys as getKnownFieldKeys, legacy_getSelectedLocationIds as getSelectedLocationIds, legacy_getSelections as getSelections, legacy_getTagCounts as getTagCounts, legacy_getWorkArea as getWorkArea, legacy_resolveScopeIds as resolveScopeIds, legacy_sampleScope as sampleScope, legacy_scopeCount as scopeCount, legacy_scopeIds as scopeIds, legacy_scopeToProps as scopeToProps, legacy_scopeToSelector as scopeToSelector, legacy_useScope as useScope, legacy_waitForGoogleMap as waitForGoogleMap };
  export type { legacy_Scope as Scope, legacy_ScopeWithSaved as ScopeWithSaved, legacy_SelectorOrLocations as SelectorOrLocations };
}

/** Forces a full selection re-resolve in Rust and returns the raw selected IDs.
 *  App code reads `getMapState().selectedLocationIds` — mutations already sync
 *  selections via MutationResult. */
declare function syncSelections(): Promise<{
    ids: number[];
}>;
declare function openMap(id: string): Promise<void>;
declare function closeMap(): Promise<void>;
declare function deleteMap(id: string): Promise<void>;
declare function importPaste(text: string): Promise<EditorImportResult[]>;
declare function importFile(droppedFields: string[], tagName?: string): Promise<EditorImportResult>;

declare const testApi_closeMap: typeof closeMap;
declare const testApi_deleteMap: typeof deleteMap;
declare const testApi_importFile: typeof importFile;
declare const testApi_importPaste: typeof importPaste;
declare const testApi_openMap: typeof openMap;
declare const testApi_syncSelections: typeof syncSelections;
declare namespace testApi {
  export {
    testApi_closeMap as closeMap,
    testApi_deleteMap as deleteMap,
    testApi_importFile as importFile,
    testApi_importPaste as importPaste,
    testApi_openMap as openMap,
    testApi_syncSelections as syncSelections,
  };
}

/** Test-only convenience, mounted as `MMA._test`. @unstable */
declare const _test: typeof testApi;

declare const testSurface__test: typeof _test;
declare namespace testSurface {
  export {
    testSurface__test as _test,
  };
}

/** Base URL for a Tauri custom URI scheme. Windows WebView2 uses http://<scheme>.localhost/. */
declare function schemeBase(scheme: string): string;
/** URL that serves a local file over the `mma-buf://` protocol (binary Rust-to-JS transfers). */
declare function mmaBufUrl(path: string): string;
/** Message for an unknown thrown value. */
declare function errText(e: unknown): string;
/** Copy of `set` with `value` toggled, or forced on/off by `on`. */
declare function toggleInSet<T>(set: ReadonlySet<T>, value: T, on?: boolean): Set<T>;
/** Split into consecutive slices of at most `n` items. */
declare function chunk<T>(arr: readonly T[], n: number): T[][];
/** Fisher–Yates shuffle in place; returns the same array. */
declare function shuffle<T>(arr: T[]): T[];
/** Compare two dotted version strings (e.g. "0.6.1"). Returns >0 if a > b. */
declare function cmpVersion(a: string, b: string): number;
/** True for a semver pre-release (`0.10.0-rc.1`), as opposed to a stable dotted version. */
declare function isPrereleaseVersion(version: string): boolean;
/** True when running under the web-serve bridge (a plain browser, no native shell). */
declare function isWeb(): boolean;
/** Trigger a browser download from an in-memory Blob. */
declare function downloadBlob(blob: Blob | string, fileName: string): void;
/** Copy an image Blob to the clipboard. False when the platform refuses it. */
declare function copyImageToClipboard(blob: Blob): Promise<boolean>;
/** Prompt for a destination and move a temp export file there (native dialog in
 *  Tauri, File System Access / download in the browser). Returns the name it was saved
 *  under, which the user may have changed in the dialog. Null = cancelled. */
declare function saveExportTempFile(srcPath: string, fileName: string): Promise<string | null>;
declare function compareNatural(a: string, b: string): number;
declare function sortTagsByMode(tags: Tag[], mode: TagSortMode, counts: Record<number, number>): Tag[];
/** Color for a tag named `name`. An existing tag uses its stored color. */
declare function tagColorFor(name: string, tags: Tag[]): string;
/** Add a name to a staged list: dedup case-insensitively, normalizing to an existing tag's
 *  canonical casing. Returns the original array unchanged if already present. */
declare function appendTagName(pending: string[], name: string, tags: Tag[]): string[];
declare function fovToZoom(fov: number): number;
/** Rolling anchor for a phase-relative locations/second average. */
export interface WaveRate {
    t0: number;
    done0: number;
    done: number;
    total: number;
}
/** Locations/second averaged over the progress wave in flight. A done that went backward
 *  or a total that grew means a new wave began (within one wave done only grows and the
 *  total only shrinks as skips are found), so the average re-anchors there instead of
 *  carrying the previous wave's speed. Null until the wave shows a quarter second of work. */
declare function waveRate(prev: WaveRate | null, done: number, total: number, now: number): {
    state: WaveRate;
    rate: number | null;
};

export type util_WaveRate = WaveRate;
declare const util_appendTagName: typeof appendTagName;
declare const util_chunk: typeof chunk;
declare const util_cmpVersion: typeof cmpVersion;
declare const util_compareNatural: typeof compareNatural;
declare const util_copyImageToClipboard: typeof copyImageToClipboard;
declare const util_downloadBlob: typeof downloadBlob;
declare const util_errText: typeof errText;
declare const util_fovToZoom: typeof fovToZoom;
declare const util_isPrereleaseVersion: typeof isPrereleaseVersion;
declare const util_isWeb: typeof isWeb;
declare const util_mmaBufUrl: typeof mmaBufUrl;
declare const util_saveExportTempFile: typeof saveExportTempFile;
declare const util_schemeBase: typeof schemeBase;
declare const util_shuffle: typeof shuffle;
declare const util_sortTagsByMode: typeof sortTagsByMode;
declare const util_tagColorFor: typeof tagColorFor;
declare const util_toggleInSet: typeof toggleInSet;
declare const util_waveRate: typeof waveRate;
declare namespace util {
  export { util_appendTagName as appendTagName, util_chunk as chunk, util_cmpVersion as cmpVersion, util_compareNatural as compareNatural, util_copyImageToClipboard as copyImageToClipboard, util_downloadBlob as downloadBlob, util_errText as errText, util_fovToZoom as fovToZoom, util_isPrereleaseVersion as isPrereleaseVersion, util_isWeb as isWeb, util_mmaBufUrl as mmaBufUrl, util_saveExportTempFile as saveExportTempFile, util_schemeBase as schemeBase, util_shuffle as shuffle, util_sortTagsByMode as sortTagsByMode, util_tagColorFor as tagColorFor, util_toggleInSet as toggleInSet, util_waveRate as waveRate };
  export type { util_WaveRate as WaveRate };
}

/**
 * Built-in UI locales. JSON catalogs live under `src/locales/` (English-as-key).
 */
declare const LOCALES: {
    readonly en: "English";
    readonly de: "Deutsch";
    readonly es: "Español";
    readonly fr: "Français";
    readonly ja: "日本語";
    readonly pl: "Polski";
    readonly ru: "Русский";
    readonly "zh-Hans": "简体中文";
    readonly "en-XA": "Pseudolocale";
};

export interface PluralForms {
    one: string;
    other: string;
}
export type MessageSource = string | PluralForms;
export type MessageParams = Record<string, string | number>;
declare function getLocale(): string;
declare function t(src: MessageSource, params?: MessageParams): string;
/** Prefer `t({ one, other }, { n })` for new plurals; `tp` remains for older call shapes. */
declare function tp(key: MessageSource, count: number, params?: MessageParams): string;

/** Fetch full pano metadata directly from Google's internal RPC (bypasses StreetViewService). */
declare function fetchSvMetadata(panoIds: string[], signal?: AbortSignal): Promise<(google.maps.StreetViewResolvedPanoramaData | null)[]>;

declare let ready: boolean;

/** Flip after boot. The write lives here so `ready` stays a `let` (MMA.ready is assignable)
 *  without tripping prefer-const. */
declare function markReady(): void;
/** Snapshot so a plugin cannot mutate the live settings object. */
declare function getSettings(): {
    showCameraBadges: boolean;
    showLinksControl: boolean;
    clickToGo: boolean;
    showRoadLabels: boolean;
    defaultMovementMode: MovementMode;
    showCar: boolean;
    showCrosshair: boolean;
    showCompass: boolean;
    showCompassTape: boolean;
    showZoom: boolean;
    showReturnToSpawn: boolean;
    showJumpButtons: boolean;
    showMapLinks: boolean;
    showCoordinateDisplay: boolean;
    showFullscreenButton: boolean;
    showScreenshotButton: boolean;
    showPanoMetadata: boolean;
    exactDateFormat: ExactDateFormat;
    dateTimezone: DateTimezone;
    showNavArrow: boolean;
    showGroundArrow: boolean;
    hidePanoUI: boolean;
    hideNavWithUI: boolean;
    fullscreenMap: boolean;
    showFullscreenMapMeta: boolean;
    showFullscreenMiniLocationPreview: boolean;
    fullscreenMiniLocationScale: number;
    showFullscreenMinimap: boolean;
    fullscreenMinimapScale: number;
    fullscreenMinimapCloseDelay: number;
    showFullscreenTagbar: boolean;
    fullscreenTagbarCollapsed: boolean;
    showFullscreenDatePicker: boolean;
    showFullscreenReviewBar: boolean;
    showFullscreenGeocode: boolean;
    customCss: string;
    enableSeen: boolean;
    enableSeenThumbnails: boolean;
    seenResolution: SeenResolution;
    mapPanSpeed: number;
    panoLookSpeed: number;
    slowModifier: number;
    showFps: boolean;
    mapListFields: MapListField[];
    language: Language;
    restoreSession: boolean;
    discordPresence: DiscordPresenceMode;
    labelColors: Record<string, string>;
    geocodeProvider: GeocodeProvider;
    nominatimApiKey: string;
    panToImported: boolean;
    enterOpensCenter: boolean;
    pastePadding: number;
    followActiveInReview: boolean;
    markerColor: RGB;
    activeLocationColor: RGB;
    importPreviewColor: RGB;
    svTrail: boolean;
    svTrailColor: RGB;
    svTrailPosition: boolean;
    panoDotColor: RGB;
    opacityToggleMode: OpacityToggleMode;
    polygonColorMode: PolygonColorMode;
    polygonColor: RGB;
    panoDotScaled: boolean;
    tagViewMode: TagViewMode;
    truncateTagPaths: boolean;
    tagFolderColorMode: TagFolderColorMode;
    tagFolderColor: RGB;
    tagSortMode: TagSortMode;
    tagGap: number;
    animateTagReorder: boolean;
    borderDetail: BorderDetail;
    subdivisionDetail: SubdivisionDetail;
    previewAspectRatio: PreviewAspectRatio;
    tagSuggestionLimit: number;
    globalCopyBindings: MapKeyBinding[];
    remoteApi: boolean;
    remoteApiKey: string;
    pinnedCommands: PinnedEntry[];
    prereleaseUpdates: boolean;
    units: UnitSystem;
};
/** Rows are accepted only here, normalized by the legacy adapter; internals take a Selector. */
declare function enrichAll(target: SelectorOrLocations, opts?: Parameters<typeof enrichAll$1>[1]): Promise<EnrichResult>;
/** Kept as a count so installed plugins and e2e stay on `Promise<number>`. */
declare function bulkPinToPano(target: SelectorOrLocations, opts?: Parameters<typeof bulkPinToPano$1>[1]): Promise<number>;

declare const host_LOCALES: typeof LOCALES;
declare const host_bulkPinToPano: typeof bulkPinToPano;
declare const host_enrichAll: typeof enrichAll;
declare const host_fetchSvMetadata: typeof fetchSvMetadata;
declare const host_getLocale: typeof getLocale;
declare const host_getSettings: typeof getSettings;
declare const host_markReady: typeof markReady;
declare const host_ready: typeof ready;
declare const host_setSetting: typeof setSetting;
declare const host_t: typeof t;
declare const host_tp: typeof tp;
declare namespace host {
  export {
    host_LOCALES as LOCALES,
    host_bulkPinToPano as bulkPinToPano,
    host_enrichAll as enrichAll,
    host_fetchSvMetadata as fetchSvMetadata,
    host_getLocale as getLocale,
    host_getSettings as getSettings,
    host_markReady as markReady,
    host_ready as ready,
    host_setSetting as setSetting,
    host_t as t,
    host_tp as tp,
  };
}

/**
 * Unified MMA API -- the single public surface for plugins, tests, and app code.
 * Exposed as `window.MMA` (and the global `MMA`).
 * The module is the API unit: this file only spreads modules.
 */

export type StoreApi = typeof store;
export type SavedSelectionsApi = typeof savedSelections;
/** App settings and their option tables; the shape moves with every setting added. @unstable */
export type SettingsApi = Omit<typeof settings, "getSettings">;
/** Import dialog internals. @unstable */
export type ImportStagingApi = typeof importStaging;
/** Commit diff internals. @unstable */
export type CommitDiffApi = typeof commitDiff;
export type SelectorPickApi = typeof picker;
export type MapListApi = typeof mapList;
/** Review screen internals. @unstable */
export type ReviewApi = typeof review;
/** The raw command layer under the app-level API; any of them can change in a release. @unstable */
export type CommandsApi = typeof commands;
export type TauriApi = typeof tauri;
export type RegistryApi = typeof registry;
export type ScopeApi = typeof scope;
export type ExternalsApi = typeof externals;
export type SidecarApi = typeof sidecar$1;
export type UiApi = typeof uiSurface;
export type FieldDefsApi = typeof fieldDefs;
export type FieldDefRegistryApi = typeof fieldDefRegistry;
export type ProceduresApi = typeof procedures;
export type SeenApi = typeof seen;
/** The shared panorama viewer's internals. @unstable */
export type PanoSingletonApi = typeof panoSingleton;
export type EnrichApi = Omit<typeof enrich$1, "enrichAll">;
export type PinPanoApi = Omit<typeof pinPano, "bulkPinToPano">;
export type ValidateApi = typeof validate;
export type QueryApi = typeof query;
export type MapStateApi = typeof mapState;
export type SceneStoreApi = typeof sceneStore;
export type ColorApi = typeof colorUtils;
export type ToastApi = typeof toast$1;
export type UseJobApi = typeof useJob$1;
/** Shims for removed APIs. @unstable */
export type LegacyApi = typeof legacy;
/** @unstable */
export type TestApi = typeof testSurface;
export type TypesApi = typeof types;
export type UtilApi = typeof util;
export type HostApi = typeof host;
export interface MMA extends StoreApi, SavedSelectionsApi, SettingsApi, ImportStagingApi, CommitDiffApi, SelectorPickApi, MapListApi, ReviewApi, CommandsApi, TauriApi, RegistryApi, ScopeApi, ExternalsApi, SidecarApi, UiApi, FieldDefsApi, FieldDefRegistryApi, ProceduresApi, SeenApi, PanoSingletonApi, EnrichApi, PinPanoApi, ValidateApi, QueryApi, MapStateApi, SceneStoreApi, ColorApi, ToastApi, UseJobApi, TestApi, TypesApi, UtilApi, LegacyApi, HostApi {
}

declare global {
    interface Window {
        MMA: MMA;
    }
    const MMA: MMA;
}

export { BUILTIN_FIELDS, DEFAULT_DUPLICATE_SCORE, KNOWN_FIELDS, MMA as MMAApi, PROJECTIONS, PanoType, commands$1 as commands, events };
export type { AltBasemapSettings, AltBasemapSlot, AltProviderSettings, AltProviderSettings_Deserialize, BatchMode, CameraType, CellRemoval, Columns, CommitDelta, CommitDiff, CommitInfo, ComparisonType, Conflict, ConflictKind, CopyToMapResult, DataLocation, DatePart, DbStats, DbTableInfo, EditorImportPreview, EditorImportResult, ExportOpts, ExportProgress, ExprError, ExternalMutation, ExtraFieldDef, ExtraFieldType, FieldCount, FieldOp, FieldOpResult, FilterOp, FirstSyncMode, GeoResult, GgUser, HoneycombRun, ImportPreviewEntry, ImportProgress, ImportedMapInfo, KeySpec, Location, LocationPatch, LocationPatch_Deserialize, MapData, MapData_Deserialize, MapExtra, MapKeyAction, MapKeyBinding, MapMeta, MapMetaPatch, MapMetaPatch_Deserialize, MapMeta_Deserialize, MapSettings, MapSettings_Deserialize, MergeWinner, MmRemoteMap, MmUser, MutationResult, NormalizedSyncLocation, NumericBinning, ParsedLocation, PartitionBucket, PluginManifest, PluginManifest_Deserialize, PluginSidecar, PluginSidecar_Deserialize, PolygonGeometry, PresenceActivity, ProcedureActivity, ProcedureProgress, ProcedureResult, ProviderActivity, ProviderDecl, ProvidersSettings, ProvidersSettings_Deserialize, PullCreate, PullUpdate, QueryActivity, RateCost, RateSpec, RemoteMappingRow, RenderDelta, RenderEntry, RenderPatchEntry, RenderRequest, ResolutionSide, ResultEntry, RetrySpec, ReviewCreate, ReviewSession, ReviewUpdate, Rows, SaveResult, SavedSelection, SavedSelectionInfo, ScoreBounds, SeenEntry, SeenFilter, SeenMapInfo, SeenWriteEntry, SelPaint, Selection, SelectionInput, SelectionSync, Selector, SideCounts, SidecarDone, SidecarLine, SidecarLog, SidecarProgress, Sink, SpacedPickResult, StoreStatus, StoreWarning, SummaryResult, SyncPatch, SyncReconcileResult, Tag, TagPatch, Update, UpdateAvailable, UpdateProgress, ValiCountryStatus, ValiLocation, ValiLocation_Deserialize, ValiProgress, VirtualTag };
