/// <reference types="google.maps" />
/// <reference path="./google-maps.d.ts" />

import { ComponentType, SetStateAction, ReactNode } from 'react';
import * as react_jsx_runtime from 'react/jsx-runtime';
import { invoke } from '@tauri-apps/api/core';
import { Command } from '@tauri-apps/plugin-shell';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Layer, PickingInfo } from '@deck.gl/core';
import maplibregl from 'maplibre-gl';

export interface PluginSettingDef {
    key: string;
    label: string;
    type: "boolean" | "string" | "number";
    default: unknown;
}
export interface Plugin {
    id: string;
    name: string;
    description?: string;
    icon: string;
    comingSoon?: boolean;
    core?: boolean;
    experimental?: boolean;
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
/** Register a plugin. `activate` runs when a map opens; its returned cleanup runs on map close. */
declare function registerPlugin(plugin: Plugin | PluginBehavior): void;
export interface PluginStorage {
    get<T = unknown>(key: string, fallback?: T): T;
    set(key: string, value: unknown): void;
    remove(key: string): void;
    keys(): string[];
}
/** Persistent key-value storage namespaced to a plugin. Survives restarts. */
declare function createPluginStorage(id: string): PluginStorage;
/** useState persisted through the plugin's namespaced store. UI state saved this
 *  way survives sidebar unmount and app restart. Values are global, not per-map —
 *  callers must fall back gracefully when a stored value doesn't resolve against
 *  the current map (e.g. a field key or saved-selection id). */
declare function usePluginState<T>(pluginId: string, key: string, initial: T | (() => T)): readonly [T, (action: SetStateAction<T>) => void];

/**
 * Built-in UI locales. Add a new entry here, drop a matching catalog under
 * `src/locales/`, and register it in `catalogs.ts` to ship another language.
 */
declare const LOCALES: {
    readonly en: "English";
    readonly "zh-Hans": "简体中文";
};
export type AppLocale = keyof typeof LOCALES;
export type MessageParams = Record<string, string | number | boolean>;

/**
 * English UI strings — source of truth for message keys.
 * Keep keys stable; other locale files only override values.
 *
 * Placeholders use `{name}` (e.g. "Selected {count} locations").
 * Plural forms use `key.one` / `key.other` with `tp()`.
 */
declare const en: {
    readonly "common.add": "Add";
    readonly "common.all": "All";
    readonly "common.apply": "Apply";
    readonly "common.areYouSure": "Are you sure?";
    readonly "common.back": "Back";
    readonly "common.cancel": "Cancel";
    readonly "common.changes": "Changes";
    readonly "common.clear": "Clear";
    readonly "common.close": "Close";
    readonly "common.confirm": "Confirm";
    readonly "common.continue": "Continue";
    readonly "common.copy": "Copy";
    readonly "common.create": "Create";
    readonly "common.delete": "Delete";
    readonly "common.deselect": "Deselect";
    readonly "common.disable": "Disable";
    readonly "common.done": "Done";
    readonly "common.download": "Download";
    readonly "common.edit": "Edit";
    readonly "common.enable": "Enable";
    readonly "common.error": "Error";
    readonly "common.export": "Export";
    readonly "common.filter": "Filter";
    readonly "common.find": "Find";
    readonly "common.history": "History";
    readonly "common.import": "Import";
    readonly "common.info": "Info";
    readonly "common.install": "Install";
    readonly "common.language": "Language";
    readonly "common.loading": "Loading...";
    readonly "common.manual": "Manual";
    readonly "common.merge": "Merge";
    readonly "common.new": "New";
    readonly "common.next": "Next";
    readonly "common.no": "No";
    readonly "common.none": "None";
    readonly "common.noResults": "No results.";
    readonly "common.ok": "OK";
    readonly "common.open": "Open";
    readonly "common.paste": "Paste";
    readonly "common.pick": "Pick";
    readonly "common.previous": "Previous";
    readonly "common.redo": "Redo";
    readonly "common.refresh": "Refresh";
    readonly "common.regenerate": "Regenerate";
    readonly "common.remove": "Remove";
    readonly "common.rename": "Rename";
    readonly "common.replace": "Replace";
    readonly "common.reset": "Reset";
    readonly "common.resetAllDefaults": "Reset all to defaults";
    readonly "common.resetToDefault": "Reset to default";
    readonly "common.save": "Save";
    readonly "common.saved": "Saved";
    readonly "common.search": "Search";
    readonly "common.select": "Select";
    readonly "common.undo": "Undo";
    readonly "common.uninstall": "Uninstall";
    readonly "common.update": "Update";
    readonly "common.upload": "Upload";
    readonly "common.zoomIn": "Zoom in";
    readonly "common.zoomOut": "Zoom out";
    readonly "common.warning": "Warning";
    readonly "common.yes": "Yes";
    readonly "locale.en": "English";
    readonly "locale.zh-Hans": "简体中文";
    readonly "app.dismiss": "Dismiss";
    readonly "app.downloadingPercent": "Downloading {percent}%";
    readonly "app.downloadUpdate": "v{version} — download update";
    readonly "app.joinDiscord": "Join the Discord";
    readonly "app.manual": "Manual";
    readonly "app.restartToUpdate": "Restart to update";
    readonly "app.updateFailedRetry": "Update failed — retry";
    readonly "welcome.discord": "Join the Discord";
    readonly "welcome.discordPrompt": "Got questions or feedback?";
    readonly "welcome.gotIt": "Got it";
    readonly "welcome.intro": "If you're new, the {manualLink} covers every feature. It's a recommended read and reference point!";
    readonly "welcome.manualLink": "manual";
    readonly "welcome.title": "Welcome to {appName}";
    readonly "dialog.applyMetadataAsTags": "Apply metadata as tags";
    readonly "dialog.applySavedSelection": "Apply saved selection";
    readonly "dialog.assignDocLinks": "Assign document links";
    readonly "dialog.changeDataFolder": "Change data folder";
    readonly "dialog.circularPeriod": "Circular period";
    readonly "dialog.copyLocationToMap": "Copy location to map";
    readonly "dialog.copyLocationToMapHotkeys": "Copy location to map (hotkeys)";
    readonly "dialog.deleteField": "Delete field";
    readonly "dialog.mergeField": "Merge field";
    readonly "dialog.renameField": "Rename field";
    readonly "dialog.editMap": "Edit map";
    readonly "dialog.editTag": "Edit tag";
    readonly "dialog.enrichment": "Enrichment";
    readonly "dialog.export": "Export";
    readonly "dialog.findReplaceTags": "Find and replace in tag names";
    readonly "dialog.importMaps": "Import Maps";
    readonly "dialog.largeImport": "Large import";
    readonly "dialog.manageMapStyles": "Manage map styles";
    readonly "dialog.mapSettings": "Map settings";
    readonly "dialog.mergeDuplicates": "Merge duplicates";
    readonly "dialog.plugins": "Plugins";
    readonly "dialog.renameTagInSelection": "Rename tag in selection";
    readonly "dialog.reviewSessions": "Review sessions";
    readonly "dialog.saveCurrentSelections": "Save current selections";
    readonly "dialog.saveSelectionAsTag": "Save selection as tag";
    readonly "dialog.selections": "Selections";
    readonly "dialog.settings": "Settings";
    readonly "dialog.streetViewProviders": "Street View providers";
    readonly "dialog.tags": "Tags";
    readonly "dialog.versionHistory": "Version history";
    readonly "plugins.additional": "Additional";
    readonly "plugins.core": "Core";
    readonly "plugins.emptyAdditional": "No additional plugins available.";
    readonly "plugins.enrichmentOnly": "Enrichment only: adds data fields, no panel of its own";
    readonly "plugins.experimental": "Experimental";
    readonly "plugins.requiresApp": "Requires app v{version} or newer";
    readonly "plugins.updateRequiresApp": "Update requires app v{version} or newer";
    readonly "plugins.updateTo": "Update to v{version}";
    readonly "plugins.catalog.copyright.description": "Detect the Google copyright year baked into Street View pano tiles";
    readonly "plugins.catalog.copyright.name": "Copyright Year";
    readonly "plugins.catalog.disambiguate.description": "Rank metadata fields by how strongly they separate selections";
    readonly "plugins.catalog.disambiguate.name": "Disambiguate";
    readonly "plugins.catalog.distribution.description": "View how locations are distributed across countries";
    readonly "plugins.catalog.distribution.name": "Distribution";
    readonly "plugins.catalog.map-generator.description": "Generate locations from Street View coverage";
    readonly "plugins.catalog.map-generator.name": "Map generator";
    readonly "plugins.catalog.geoguessr.description": "Push and pull locations to/from a linked GeoGuessr map";
    readonly "plugins.catalog.geoguessr.name": "GeoGuessr";
    readonly "plugins.catalog.localguessr.description": "Play GeoGuessr games with your own map locations";
    readonly "plugins.catalog.localguessr.name": "LocalGuessr";
    readonly "plugins.catalog.gradient.description": "Color locations by field value using gradient buckets";
    readonly "plugins.catalog.gradient.name": "Gradient";
    readonly "plugins.catalog.heatmap.description": "Visualize location density as a heatmap overlay";
    readonly "plugins.catalog.heatmap.name": "Heatmap";
    readonly "plugins.catalog.inaturalist.description": "Search and visualize species observations from iNaturalist on the map";
    readonly "plugins.catalog.inaturalist.name": "iNaturalist";
    readonly "plugins.catalog.json-editor.description": "View and edit location data as JSON";
    readonly "plugins.catalog.json-editor.name": "JSON editor";
    readonly "plugins.catalog.map-making-sync.description": "Bidirectional sync with map-making.app maps";
    readonly "plugins.catalog.map-making-sync.name": "map-making.app sync";
    readonly "plugins.catalog.pivot.description": "Cross-tabulate selections against location metadata";
    readonly "plugins.catalog.pivot.name": "Pivot Table";
    readonly "plugins.catalog.sunPosition.description": "Calculate sun azimuth and altitude from exact capture date";
    readonly "plugins.catalog.sunPosition.name": "Sun Position";
    readonly "plugins.catalog.vali.description": "Generate locations from pre-built coverage data using Vali";
    readonly "plugins.catalog.vali.name": "Vali";
    readonly "plugins.catalog.vision.description": "Search your locations by describing what they look like, or find ones that look alike";
    readonly "plugins.catalog.vision.name": "Vision";
    readonly "plugins.catalog.weather.description": "Enrich locations with historical weather at their capture time via the Open-Meteo archive (requires exact date)";
    readonly "plugins.catalog.weather.name": "Weather";
    readonly "settings.action": "Action";
    readonly "settings.activeLocationColor": "Active marker color";
    readonly "settings.adm1WillDownload": " (~45MB, will download)";
    readonly "settings.altSlowDesc": "Hold Alt to slow down map panning and pano look.";
    readonly "settings.animateTagReorder": "Animate tags during drag reorder";
    readonly "settings.aspectRatio.16-10": "16:10";
    readonly "settings.aspectRatio.16-9": "16:9";
    readonly "settings.aspectRatio.21-9": "21:9";
    readonly "settings.aspectRatio.32-9": "32:9";
    readonly "settings.aspectRatio.4-3": "4:3";
    readonly "settings.aspectRatio.free": "Free";
    readonly "settings.binding": "Binding";
    readonly "settings.border.heavy": "Ultra (~46MB)";
    readonly "settings.border.light": "Standard (bundled)";
    readonly "settings.border.medium": "High (~10MB)";
    readonly "settings.borderDetail": "Country data";
    readonly "settings.borderDownloadFailed": "Download failed: {message}";
    readonly "settings.changeFolder": "Change folder...";
    readonly "settings.checkForUpdates": "Check for updates";
    readonly "settings.chooseDataFolder": "Choose data folder";
    readonly "settings.clickToGo": "Show click-to-go navigation";
    readonly "settings.clickToRebind": "Click to rebind";
    readonly "settings.customCssPlaceholder": "/* Your custom CSS here */\n.location-preview__panorama { border: 2px solid red; }";
    readonly "settings.dataFolderPrompt": "Map data will be stored in:";
    readonly "settings.dataFolderWarning": "Existing maps are not moved automatically. Copy them manually if needed.";
    readonly "settings.dateTimezone": "Exact date timezone";
    readonly "settings.dateTimezone.location": "Location timezone";
    readonly "settings.dateTimezone.utc": "UTC";
    readonly "settings.defaultMovementMode": "Default movement mode";
    readonly "settings.discord.full": "Full (map name + count)";
    readonly "settings.discord.generic": "Generic (no map name)";
    readonly "settings.discord.off": "Off";
    readonly "settings.discordPresence": "Rich Presence";
    readonly "settings.downloadAndInstall": "Download and install";
    readonly "settings.downloading": " (downloading...)";
    readonly "settings.downloadingBorders": "Downloading border data...";
    readonly "settings.enableSeen": "Log viewed panos";
    readonly "settings.enableSeenThumbnails": "Save thumbnails";
    readonly "settings.exactDate.date": "Date only";
    readonly "settings.exactDate.datetime": "Date + time";
    readonly "settings.exactDateFormat": "Exact date format";
    readonly "settings.filterShortcuts": "Filter shortcuts...";
    readonly "settings.followActiveInReview": "Center map on active location during review";
    readonly "settings.fullscreenMinimapCloseDelay": "Minimap close delay";
    readonly "settings.geocode.google": "Google (from panorama)";
    readonly "settings.geocode.local": "Local (offline)";
    readonly "settings.geocode.nominatim": "Nominatim";
    readonly "settings.geocodeLabel.google": "Google Street View";
    readonly "settings.geocodeLabel.local": "Local reverse geocode";
    readonly "settings.geocodeLabel.nominatim": "OpenStreetMap (Nominatim)";
    readonly "settings.geocodeProvider": "Reverse geocode provider";
    readonly "settings.geocodeProviderDesc": "Used for place names shown under the panorama";
    readonly "settings.group.borders": "Borders";
    readonly "settings.group.commands": "Commands";
    readonly "settings.group.customCss": "Custom CSS";
    readonly "settings.group.data": "Data";
    readonly "settings.group.datePicker": "Date picker";
    readonly "settings.group.debug": "Debug";
    readonly "settings.group.discord": "Discord";
    readonly "settings.group.fullscreen": "Fullscreen";
    readonly "settings.group.geocoding": "Geocoding";
    readonly "settings.group.global": "Global";
    readonly "settings.group.language": "Language";
    readonly "settings.group.locationEditor": "Location Editor";
    readonly "settings.group.mapList": "Map list";
    readonly "settings.group.mapNavigation": "Map Navigation";
    readonly "settings.group.markers": "Markers";
    readonly "settings.group.navigation": "Navigation";
    readonly "settings.group.panoramaDots": "Panorama dots";
    readonly "settings.group.quicktag": "Quicktag";
    readonly "settings.group.remoteApi": "Remote API";
    readonly "settings.group.review": "Review";
    readonly "settings.group.seen": "Seen";
    readonly "settings.group.selections": "Selections";
    readonly "settings.group.startup": "Startup";
    readonly "settings.group.tags": "Tags";
    readonly "settings.group.updates": "Updates";
    readonly "settings.group.viewerControls": "Viewer controls";
    readonly "settings.hotkey.alsoBoundTo": "Also bound to \"{label}\" — click to jump there";
    readonly "settings.hotkey.altSlowConflict": "{combo} conflicts with \"{label}\" (Alt is the slow modifier — pick a different key)";
    readonly "settings.hotkey.blockedByWindow": "Intercepted by the app window before shortcuts can reach it";
    readonly "settings.hotkey.commands": "Commands";
    readonly "settings.hotkey.global": "Global";
    readonly "settings.hotkey.locationEditor": "Location Editor";
    readonly "settings.hotkey.mapNavigation": "Map Navigation";
    readonly "settings.hotkey.pressKey": "Press a key...";
    readonly "settings.hotkey.quicktag": "Quicktag";
    readonly "settings.hotkey.reassign": "Reassign";
    readonly "settings.hotkey.reassignPrompt": "{combo} is bound to {actions}";
    readonly "settings.hotkey.review": "Review";
    readonly "settings.hotkey.tryAnotherKey": "Try another key...";
    readonly "settings.importPreviewColor": "Staged marker color";
    readonly "settings.language": "Interface language";
    readonly "settings.languageDesc": "Applies across the app. More languages can be added later.";
    readonly "settings.mapList.created": "Date created";
    readonly "settings.mapList.lastOpened": "Last opened";
    readonly "settings.mapList.locationCount": "Location count";
    readonly "settings.mapListFieldsHint": "Fields shown on each map row (labels are always shown)";
    readonly "settings.mapPanSpeed": "Pan speed";
    readonly "settings.markerColor": "Default marker color";
    readonly "settings.minimapCloseDelayDesc": "How long the minimap stays expanded after the pointer leaves it.";
    readonly "settings.movement.moving": "Moving";
    readonly "settings.movement.nmpz": "NMPZ";
    readonly "settings.movement.no-move": "No Move";
    readonly "settings.nominatimApiKey": "API key (optional)";
    readonly "settings.nominatimWarning": "Without an API key, requests may be rate-limited by Nominatim's usage policy.";
    readonly "settings.opacityToggle.full": "Full opacity";
    readonly "settings.opacityToggle.previous": "Last used opacity";
    readonly "settings.opacityToggleDesc": "What the Street View and marker opacity hotkeys restore a hidden layer to.";
    readonly "settings.opacityToggleMode": "Layer opacity toggle";
    readonly "settings.openDataFolder": "Open data folder";
    readonly "settings.openLogFile": "Open log file";
    readonly "settings.panoDot.constant": "Constant on screen";
    readonly "settings.panoDot.scaled": "Grow when zoomed in";
    readonly "settings.panoDotColor": "Dot color";
    readonly "settings.panoDotScaled": "Dot size";
    readonly "settings.panoLookSpeed": "Pano look speed";
    readonly "settings.panToImported": "Pan to imported locations";
    readonly "settings.pastePadding": "Paste zoom padding";
    readonly "settings.polygonColor": "Polygon color";
    readonly "settings.polygonColor.fixed": "Fixed color";
    readonly "settings.polygonColor.random": "Random";
    readonly "settings.previewAspectRatio": "Preview aspect ratio";
    readonly "settings.relaunchNow": "Relaunch now";
    readonly "settings.remoteApi": "Enable local REST API";
    readonly "settings.restartNow": "Restart now";
    readonly "settings.restoreSession": "Restore open maps on startup";
    readonly "settings.searchPlaceholder": "Search settings...";
    readonly "settings.section.advanced": "Advanced";
    readonly "settings.section.application": "Application";
    readonly "settings.section.editing": "Editing";
    readonly "settings.section.integrations": "Integrations";
    readonly "settings.section.keyboard": "Keyboard";
    readonly "settings.section.map": "Map";
    readonly "settings.section.streetView": "Street View";
    readonly "settings.section.tags": "Tags";
    readonly "settings.seen.high": "High (640x360)";
    readonly "settings.seen.low": "Low (160x90)";
    readonly "settings.seen.medium": "Medium (320x180)";
    readonly "settings.seenResolution": "Thumbnail resolution";
    readonly "settings.showCameraBadges": "Show camera type badges (Gen1, Gen2, etc.)";
    readonly "settings.showCar": "Show car";
    readonly "settings.showCompass": "Compass (wind rose)";
    readonly "settings.showCompassTape": "Compass (heading tape)";
    readonly "settings.showCoordinateDisplay": "Coordinate / zoom display";
    readonly "settings.showCrosshair": "Show crosshair";
    readonly "settings.showFps": "Show FPS counter";
    readonly "settings.showFullscreenButton": "Fullscreen button";
    readonly "settings.showFullscreenDatePicker": "Show date picker in fullscreen";
    readonly "settings.showFullscreenGeocode": "Show geocoding info in fullscreen";
    readonly "settings.showFullscreenMapMeta": "Show map meta bar in fullscreen";
    readonly "settings.showFullscreenMiniLocationPreview": "Show mini location preview in fullscreen";
    readonly "settings.showFullscreenMinimap": "Show minimap in fullscreen";
    readonly "settings.showFullscreenReviewBar": "Show review bar in fullscreen";
    readonly "settings.showFullscreenTagbar": "Show tag bar in fullscreen";
    readonly "settings.showGroundArrow": "Show ground arrow";
    readonly "settings.showJumpButtons": "Jump forward/backward buttons";
    readonly "settings.showLinksControl": "Show link arrows (ground navigation)";
    readonly "settings.showMapLinks": "Map links (open in maps, copy link)";
    readonly "settings.showNavArrow": "Show navigation X";
    readonly "settings.showPanoMetadata": "Show pano metadata";
    readonly "settings.showReturnToSpawn": "Return to spawn button";
    readonly "settings.showRoadLabels": "Show road labels";
    readonly "settings.showZoom": "Zoom controls";
    readonly "settings.slowModifier": "Alt slow-down";
    readonly "settings.subdivision.adm1": "States / provinces";
    readonly "settings.subdivision.off": "Off";
    readonly "settings.subdivisionDetail": "Subdivision data";
    readonly "settings.tagFolderColor": "Folder color";
    readonly "settings.tagFolderColor.direct": "Fixed color";
    readonly "settings.tagFolderColor.firstChild": "Inherit first child";
    readonly "settings.tagFolderColor.random": "Random";
    readonly "settings.tagFolderColor.childGradient": "Child tag gradient";
    readonly "settings.tagGap": "Tag gap";
    readonly "settings.tagSuggestionLimit": "Suggestions shown";
    readonly "settings.tagView.flat": "Flat";
    readonly "settings.tagView.tree": "Tree";
    readonly "settings.tagViewMode": "View mode";
    readonly "settings.truncateTagPaths": "Truncate tag names to shortest unique path";
    readonly "settings.update.checkFailed": "Update check failed.";
    readonly "settings.update.checking": "Checking for updates...";
    readonly "settings.update.downloading": "Downloading update...";
    readonly "settings.update.idle": "Updates haven't been checked yet.";
    readonly "settings.update.upToDate": "You're on the latest version.";
    readonly "settings.updateInstalled": "Update installed. Restart to apply.";
    readonly "settings.versionAvailable": "Version {version} is available.";
    readonly "settings.willDownload": " (will download)";
    readonly "mapList.addLabel": "Add label...";
    readonly "mapList.clearSearch": "Clear search";
    readonly "mapList.colorFor": "Color for {label}";
    readonly "mapList.deleteConfirm": "Delete map \"{name}\"? This cannot be undone.";
    readonly "mapList.deleteFolder": "Delete folder";
    readonly "mapList.deleteFolderButton": "Delete folder";
    readonly "mapList.deleteFolderConfirm": "Delete folder \"{name}\" and move its {count} maps to the root list?";
    readonly "mapList.deleteMap": "Delete map";
    readonly "mapList.dropHere": "Drop map here to move out of folder";
    readonly "mapList.dropToImport": "Drop file to import";
    readonly "mapList.editMap": "Edit map";
    readonly "mapList.exportAll": "Export all maps";
    readonly "mapList.exporting": "Exporting...";
    readonly "mapList.exportSaved": "Export saved";
    readonly "mapList.filterByLabel": "Filter by this label";
    readonly "mapList.folderAssigned.one": "{count} map assigned to folders";
    readonly "mapList.folderAssigned.other": "{count} maps assigned to folders";
    readonly "mapList.folderSummary": "· {maps} maps · {locations} locations";
    readonly "mapList.here": "here";
    readonly "mapList.importAll": "All";
    readonly "mapList.importComplete": "Import complete";
    readonly "mapList.importCount.one": "Import {count} map";
    readonly "mapList.importCount.other": "Import {count} maps";
    readonly "mapList.importDuplicate": "duplicate";
    readonly "mapList.importing": "Importing...";
    readonly "mapList.importMaps": "Import maps";
    readonly "mapList.importNewOnly": "New only";
    readonly "mapList.importNone": "None";
    readonly "mapList.importPartial": "Imported {ok}, {failed} failed";
    readonly "mapList.importWarnings.one": "{count} warning";
    readonly "mapList.importWarnings.other": "{count} warnings";
    readonly "mapList.labels": "Labels";
    readonly "mapList.locAbbr": "loc";
    readonly "mapList.locations": "locations";
    readonly "mapList.mapDataFilter": "Map data";
    readonly "mapList.maps": "maps";
    readonly "mapList.mapsAndLocations": "({maps} maps, {locations} locations)";
    readonly "mapList.newFolder": "New folder";
    readonly "mapList.newMap": "New map";
    readonly "mapList.notFoundLocally": "{count} not found locally";
    readonly "mapList.openCloseFolder": "Open or close folder";
    readonly "mapList.opened": "opened {time}";
    readonly "mapList.renameFolder": "Rename folder";
    readonly "mapList.renameFolderTitle": "Rename folder";
    readonly "mapList.scanningFile": "Scanning file...";
    readonly "mapList.scanningFiles": "Scanning files...";
    readonly "mapList.searchPlaceholder": "Search maps...";
    readonly "mapList.searchTitle": "Filter by name, or by label with label:name / label:\"two words\"";
    readonly "mapList.selectedOf": "{selected} of {total} selected ({locations} locations)";
    readonly "mapList.sort.amount": "Location count";
    readonly "mapList.sort.created": "Date created";
    readonly "mapList.sort.name": "Name";
    readonly "mapList.sort.opened": "Last opened";
    readonly "mapList.tagsAbbr": "tags";
    readonly "mapList.tagsCount": "{count} tags";
    readonly "mapList.typeNameForFolder": "Type a name to create a folder";
    readonly "mapList.typeNameForMap": "Type a name to create a map";
    readonly "mapList.unnamed": "(unnamed)";
    readonly "mapList.whatsNew": "What's new";
    readonly "mapList.wipBody": "This app is a work in progress. Expect bugs and breaking changes. Report issues";
    readonly "mapList.wipWarning": "Warning";
    readonly "mapList.yourMaps": "Your Maps";
    readonly "context.clearAnchors": "Clear latitude/longitude anchors";
    readonly "context.copyCoordinates": "Copy coordinates";
    readonly "context.copyPanoId": "Copy pano ID";
    readonly "context.copyStreetViewLink": "Copy Street View link";
    readonly "context.copyToMap": "Copy to map...";
    readonly "context.deleteLocation": "Delete location";
    readonly "context.deleteNPolygons.one": "Delete {count} polygon here";
    readonly "context.deleteNPolygons.other": "Delete {count} polygons here";
    readonly "context.deleteThisPolygon": "Delete this polygon";
    readonly "context.downloadPanorama": "Download panorama";
    readonly "context.duplicateLocation": "Duplicate location";
    readonly "context.endMeasurement": "End measurement";
    readonly "context.selectThisCountry": "Select this country";
    readonly "context.selectThisSubdivision": "Select this subdivision";
    readonly "context.setAnchors": "Set latitude/longitude anchors";
    readonly "context.startMeasurement": "Start measurement";
    readonly "toast.addedLocations.one": "Added {count} location";
    readonly "toast.addedLocations.other": "Added {count} locations";
    readonly "toast.alreadyIn": "Already in {name}";
    readonly "toast.borderDownloadFailed": "Couldn't download border data — check your connection";
    readonly "toast.borderDownloading": "Border data missing — downloading...";
    readonly "toast.copiedCsv": "Copied CSV to clipboard";
    readonly "toast.copiedJson": "Copied JSON to clipboard";
    readonly "toast.copiedTo": "Copied to {name}";
    readonly "toast.linkCopied": "Link copied";
    readonly "toast.copyFailed": "Copy failed";
    readonly "toast.downloadedFile": "Downloaded {name}";
    readonly "toast.exportFailed": "Export failed";
    readonly "toast.followingRoad": "Following road...";
    readonly "toast.followRoadFailed": "Follow road failed";
    readonly "toast.mergedDuplicates": "Merged {mergedAway} duplicates in {groups} groups";
    readonly "toast.noCoverage": "No coverage found at this location.";
    readonly "toast.panoIdFallback": "Configured pano ID could not be found. Falling back to lat/lng.";
    readonly "toast.panoProviderFailed": "Failed to open panorama provider";
    readonly "toast.panoramaDownloaded": "Panorama downloaded";
    readonly "toast.panoramaDownloadFailed": "Panorama download failed";
    readonly "toast.panoramaSaved": "Panorama saved";
    readonly "toast.prunedDuplicates.one": "Pruned {count} duplicate";
    readonly "toast.prunedDuplicates.other": "Pruned {count} duplicates";
    readonly "toast.relaunchFailed": "Couldn't relaunch automatically — restart the app to apply.";
    readonly "toast.selectedFailedLocations": "Selected {count} failed locations";
    readonly "toast.selectedLocations.one": "Selected {count} location";
    readonly "toast.selectedLocations.other": "Selected {count} locations";
    readonly "toast.selectedRandomLocations.one": "Selected {count} random location";
    readonly "toast.selectedRandomLocations.other": "Selected {count} random locations";
    readonly "toast.selectedWithSpacing": ", at least {distanceM}m apart";
    readonly "toast.selectOnlyMode": "Select-only mode is on.";
    readonly "toast.subdivisionDownloadFailed": "Couldn't download subdivision borders — check your connection";
    readonly "toast.subdivisionDownloading": "Subdivision borders missing — downloading...";
    readonly "toast.subdivisionOff": "Subdivision borders are off — enable them in Settings";
    readonly "time.daysAgo": "{count}d ago";
    readonly "time.hoursAgo": "{count}h ago";
    readonly "time.justNow": "just now";
    readonly "time.minutesAgo": "{count}m ago";
    readonly "editor.addAlias": "Add alias...";
    readonly "editor.addFilter": "Add filter";
    readonly "editor.addSeparatorAfter": "Add separator after";
    readonly "editor.addSeparatorBefore": "Add separator before";
    readonly "editor.addTagPlaceholder": "Add a tag…";
    readonly "editor.addToMap": "Add to map";
    readonly "editor.adjustingMarkerOpacity": "Adjusting marker opacity";
    readonly "editor.adjustingSvOpacity": "Adjusting Street View opacity";
    readonly "editor.aliasTitle": "Alias \"{name}\"";
    readonly "editor.allLocations": "All locations ({count})";
    readonly "editor.appearsAs": "Appears as {path}";
    readonly "editor.applyColorInside.one": "Apply to {count} tag inside";
    readonly "editor.applyColorInside.other": "Apply to {count} tags inside";
    readonly "editor.assignedToTag": "Assigned to {name} (click heading with this tag armed to remove)";
    readonly "editor.backToMap": "Back to map";
    readonly "editor.backToMapList": "Back to map list";
    readonly "editor.badgeBadcam": "Badcam";
    readonly "editor.badgeGen1": "Gen1";
    readonly "editor.badgeGen2": "Gen2/3";
    readonly "editor.badgeGen4": "Gen4";
    readonly "editor.badgeTrekker": "Trekker";
    readonly "editor.badgeTripod": "Tripod";
    readonly "editor.badgeUnofficial": "unofficial";
    readonly "editor.basemap": "Basemap";
    readonly "editor.behavior": "Behavior";
    readonly "editor.blobbyLayer": "Use blobby layer while zoomed out";
    readonly "editor.bottom": "Bottom";
    readonly "editor.bucketWidthPlaceholder": "Bucket width...";
    readonly "editor.bulkAddTag": "Bulk-add tag...";
    readonly "editor.carLine": "Car line";
    readonly "editor.carPoint": "Car point";
    readonly "editor.changeColor": "Change color";
    readonly "editor.circularPeriodHelp": "Value at which this field wraps around (e.g. 360 for degrees, 24 for hours, 12 for months).";
    readonly "editor.clearDocLinks": "Clear doc links";
    readonly "editor.clearDocLinksTitle": "Remove this document's links from every tag";
    readonly "editor.clickHeadingAssign": " — click a heading to assign \"{name}\"";
    readonly "editor.closeDoclinkPanel": "Close doclink panel";
    readonly "editor.closeStreetViewProviders": "Close Street View providers";
    readonly "editor.collapseTagBar": "Collapse tag bar";
    readonly "editor.colorLabel": "Color:";
    readonly "editor.colors": "Colors";
    readonly "editor.comingSoon": "{label} (coming soon)";
    readonly "editor.commandGroupBulk": "Bulk Operations";
    readonly "editor.commandGroupMap": "Map";
    readonly "editor.commandGroupSelections": "Selections";
    readonly "editor.commandGroupTags": "Tags";
    readonly "editor.commandPalette": "Command Palette";
    readonly "editor.commands": "Commands...";
    readonly "editor.commit": "Commit";
    readonly "editor.compareAsColumn": "Compare as";
    readonly "editor.compAuto": "Auto";
    readonly "editor.compCategorical": "Categorical";
    readonly "editor.compCircular": "Circular";
    readonly "editor.compCircularPeriod": "Circular · {period}";
    readonly "editor.compNumeric": "Numeric";
    readonly "editor.contextMenu": "Context menu";
    readonly "editor.copyJson": "Copy JSON";
    readonly "editor.copyLink": "Copy link";
    readonly "editor.copyLinkHint": "Copy link - Shift: without tags, Alt: long URL";
    readonly "editor.copyToMax": "Copy to max";
    readonly "editor.copyToMin": "Copy to min";
    readonly "editor.count": "Count";
    readonly "editor.coverageLayers": "Coverage layers";
    readonly "editor.coverageLineColor": "Coverage line color";
    readonly "editor.coverageLineFilterColor": "Coverage line filter color";
    readonly "editor.coveragePercent": "{pct}% of locations";
    readonly "editor.created": "Created {time}";
    readonly "editor.createTag": "Create virtual tag";
    readonly "editor.currentSelection": "Current selection ({count})";
    readonly "editor.defaultAutoUpdating": "Default / auto-updating";
    readonly "editor.defaultLabel": "Default";
    readonly "editor.defaultWithDate": "Default ({date})";
    readonly "editor.deletedSelection": "(deleted selection)";
    readonly "editor.deleteFieldConfirm": "Delete {name} and clear its values from every location? This cannot be undone.";
    readonly "editor.deleteStyle": "Delete style";
    readonly "editor.deselect": "Deselect";
    readonly "editor.diffAdded": "Added";
    readonly "editor.diffModified": "Modified";
    readonly "editor.diffRemoved": "Removed";
    readonly "editor.direction": "Direction:";
    readonly "editor.directionBackwards": "Backwards";
    readonly "editor.directionEast": "Most Eastern";
    readonly "editor.directionForwards": "Forwards";
    readonly "editor.directionNone": "None";
    readonly "editor.directionNorth": "Most Northern";
    readonly "editor.directionRandom": "Random";
    readonly "editor.directionSouth": "Most Southern";
    readonly "editor.directionWest": "Most Western";
    readonly "editor.disallowUnofficial": "Disallow unofficial coverage";
    readonly "editor.display": "Display";
    readonly "editor.display5kRadius": "Display 5K radius";
    readonly "editor.distanceM": "Distance (m):";
    readonly "editor.doclinkDefaultTitle": "Doclink";
    readonly "editor.doclinkLoadFailed": "Couldn't load the document. {message}";
    readonly "editor.doclinks": "Doclinks";
    readonly "editor.doclinkSectionMissing": "The linked section no longer exists in this document.";
    readonly "editor.document": "Document";
    readonly "editor.done": "Done";
    readonly "editor.downloadGeoJSON": "Download GeoJSON";
    readonly "editor.drawPolygon": "Draw a polygon selection";
    readonly "editor.drawRectangle": "Draw a rectangle selection";
    readonly "editor.dropHintAnd": "AND";
    readonly "editor.dropHintOr": "OR";
    readonly "editor.editFilter": "Edit filter";
    readonly "editor.editFolder": "Edit folder \"{name}\"";
    readonly "editor.editMap": "Edit map";
    readonly "editor.emphasiseCountryBorders": "Emphasise country borders";
    readonly "editor.emphasiseSubdivisionBorders": "Emphasise subdivision borders";
    readonly "editor.enableAllProviders": "Enable all providers";
    readonly "editor.enrichAutoSave": "Automatically save metadata to locations";
    readonly "editor.enrichColumn": "Enrich";
    readonly "editor.enrichLocations": "Enrich locations";
    readonly "editor.exitReview": "Exit review";
    readonly "editor.expandTagBar": "Expand tag bar";
    readonly "editor.exportEverything": "Export everything ({count} locations)";
    readonly "editor.exportSelection": "Export selection ({count} locations)";
    readonly "editor.fallbackToGoogle": "Fallback to Google Street View";
    readonly "editor.fieldColumn": "Field";
    readonly "editor.fieldType.array": "Array";
    readonly "editor.fieldType.date": "Date/time";
    readonly "editor.fieldType.enum": "Enum";
    readonly "editor.fieldType.month": "Month (YYYY-MM)";
    readonly "editor.fieldType.number": "Number";
    readonly "editor.fieldType.string": "Text";
    readonly "editor.filterByMetadata": "Filter by metadata:";
    readonly "editor.filterLength": "Length";
    readonly "editor.filterMax": "Max";
    readonly "editor.filterOp.between": "between";
    readonly "editor.filterOp.betweenAnytime": "between (any date)";
    readonly "editor.filterOp.betweenAnyYear": "between (any year)";
    readonly "editor.filterOp.contains": "contains";
    readonly "editor.filterOp.eq": "=";
    readonly "editor.filterOp.gt": ">";
    readonly "editor.filterOp.gte": ">=";
    readonly "editor.filterOp.has": "has";
    readonly "editor.filterOp.lengthBetween": "length between";
    readonly "editor.filterOp.lengthEq": "length =";
    readonly "editor.filterOp.lengthGt": "length >";
    readonly "editor.filterOp.lengthGte": "length >=";
    readonly "editor.filterOp.lengthLt": "length <";
    readonly "editor.filterOp.lengthLte": "length <=";
    readonly "editor.filterOp.lengthNeq": "length !=";
    readonly "editor.filterOp.lt": "<";
    readonly "editor.filterOp.lte": "<=";
    readonly "editor.filterOp.neq": "!=";
    readonly "editor.filterOp.notcontains": "does not contain";
    readonly "editor.filterOp.nothas": "does not have";
    readonly "editor.filterTags": "Filter tags...";
    readonly "editor.filterValue": "Value";
    readonly "editor.findPlaceholder": "Text to find...";
    readonly "editor.folderExists": "\"{path}\" already exists in the tree";
    readonly "editor.folderName": "Folder name";
    readonly "editor.freehandPolygon": "Freehand polygon selection";
    readonly "editor.fromValues": "{name}'s values";
    readonly "editor.ghostSelection": "Ghost selection";
    readonly "editor.ghostSelectionHint": "Ghost selection (Alt-click to isolate)";
    readonly "editor.hideHighways": "Hide highways";
    readonly "editor.hidePoi": "Hide points of interest";
    readonly "editor.hideRoadLabels": "Hide road labels";
    readonly "editor.hideTransit": "Hide transit";
    readonly "editor.hotkeyLabel": "Hotkey:";
    readonly "editor.importBlocked": "This location is still being imported and cannot be modified. Complete the import before making changes.";
    readonly "editor.importFile": "Import file";
    readonly "editor.importFilterName": "Map data";
    readonly "editor.invertSelection": "Invert selection";
    readonly "editor.jumpBackward": "Jump backward 100 metres ({key})";
    readonly "editor.jumpForward": "Jump forward 100 metres ({key})";
    readonly "editor.labelColumn": "Label";
    readonly "editor.labels": "Labels";
    readonly "editor.largerMinimap": "Larger minimap";
    readonly "editor.largerPreview": "Larger location preview";
    readonly "editor.layers": "Layers";
    readonly "editor.linesOpacity": "Lines opacity";
    readonly "editor.linesPmtiles": "Lines (PMTiles)";
    readonly "editor.linesRaster": "Lines (raster)";
    readonly "editor.linesRasterMvt": "Lines (raster + MVT)";
    readonly "editor.lineWidth": "Line width";
    readonly "editor.loadFailed": "Couldn't load: {message}";
    readonly "editor.loadingDocument": "Loading document...";
    readonly "editor.locationsCount": "{count} locations";
    readonly "editor.locationTimezone": "Location timezone";
    readonly "editor.mapBehaviour": "Map behaviour";
    readonly "editor.mapStyleSection": "Map style";
    readonly "editor.mapTypeMap": "Map";
    readonly "editor.mapTypeOsm": "OSM";
    readonly "editor.mapTypeSatellite": "Satellite";
    readonly "editor.mapTypeVector": "Vector";
    readonly "editor.markerArrow": "Camera direction arrow";
    readonly "editor.markerCircle": "Circle";
    readonly "editor.markerLayerOpacity": "Marker layer opacity";
    readonly "editor.markerPin": "Pin";
    readonly "editor.markerSize": "Marker size:";
    readonly "editor.markerStyle": "Marker style:";
    readonly "editor.mergeFieldHelp": "Merge {from} into existing field {to} across {count} location(s). This cannot be undone.";
    readonly "editor.meters": "Meters";
    readonly "editor.minDistanceM": "Min distance (m)";
    readonly "editor.minSearchRadius": "Min search radius:";
    readonly "editor.modified": "Modified {time}";
    readonly "editor.moveLeft": "Move left";
    readonly "editor.moveRight": "Move right";
    readonly "editor.nameSelectionPlaceholder": "Name this selection...";
    readonly "editor.newFolder": "New folder";
    readonly "editor.newFolderIn": "New folder in \"{parent}\"";
    readonly "editor.newStyle": "New style";
    readonly "editor.newSubfolder": "New subfolder...";
    readonly "editor.deleteFolder": "Delete folder";
    readonly "editor.nextLocation": "Go to next location (Control+Right)";
    readonly "editor.nextPeriod": "Next period";
    readonly "editor.noDates": "No dates";
    readonly "editor.noDoclinkSelected": "No document link selected.";
    readonly "editor.noDoclinkTags": "No tags in this map carry document links.";
    readonly "editor.noLinkableHeadings": "No linkable headings found in this doc.";
    readonly "editor.noMetadataYet": "No metadata yet";
    readonly "editor.noOtherMaps": "No other maps.";
    readonly "editor.noSaveableSelections": "No saveable selections active.";
    readonly "editor.noSavedSelections": "No saved selections.";
    readonly "editor.noTagsInMap": "This map has no tags.";
    readonly "editor.notEnrichmentField": "Not an enrichment field";
    readonly "editor.noTimezoneData": "No locations have timezone data";
    readonly "editor.ofTotal": "of {total}";
    readonly "editor.onConflictKeep": "On conflict, keep:";
    readonly "editor.openInBrowser": "Open in browser";
    readonly "editor.openInMaps": "Open in maps";
    readonly "editor.openManualChapter": "Open manual chapter";
    readonly "editor.openMap": "Open map...";
    readonly "editor.overridesWhileOpen": "Overrides \"{label}\" while this map is open.";
    readonly "editor.panoIdNotFound": "Configured pano ID could not be found. Falling back to lat/lng.";
    readonly "editor.panoOpenFailed": "Failed to open panorama provider";
    readonly "editor.panoramaPoints": "Panorama points (z≥16)";
    readonly "editor.panoramasCloseZoom": "Panoramas (requires close zoom)";
    readonly "editor.pasteDocHint": "Paste a link to a Google Doc to load its headings.";
    readonly "editor.pasteGoogleDoc": "Paste a Google Docs link...";
    readonly "editor.pasteStyleJson": "Paste a Google Maps style JSON array below.";
    readonly "editor.petalMaps": "Petal Maps";
    readonly "editor.pick": "Pick";
    readonly "editor.pinnedPanoNo": "Pinned pano: no";
    readonly "editor.pinnedPanoYes": "Pinned pano: yes";
    readonly "editor.pinSection": "Pin current section";
    readonly "editor.pinToToolbar": "Pin to toolbar";
    readonly "editor.pointAlongRoad": "Point view along the road by default";
    readonly "editor.pointNorth": "Click to point north (N). Ctrl+click to cycle through linked panoramas.";
    readonly "editor.pointNorthLabel": "Point north";
    readonly "editor.pointSize": "Point size";
    readonly "editor.pointsOpacity": "Points opacity";
    readonly "editor.polygonNamePrompt": "Polygon name";
    readonly "editor.preferHigherQuality": "Prefer higher quality over newer images";
    readonly "editor.preferOfficial": "Prefer official coverage over unofficial";
    readonly "editor.preferOnMapClick": "Prefer on map click";
    readonly "editor.previousPeriod": "Previous period";
    readonly "editor.prevLocation": "Go to previous location (Control+Left)";
    readonly "editor.providerFallbackApple": "When enabled, clicking a spot without Look Around coverage opens Google Street View instead.";
    readonly "editor.providerFallbackBaiduTencent": "When enabled, clicking a spot without Baidu/Tencent coverage opens Google Street View instead.";
    readonly "editor.providerFallbackYandex": "When enabled, clicking a spot without Yandex coverage opens Google Street View instead.";
    readonly "editor.providerPreferApple": "When preferred and enabled, blank map clicks create Look Around locations first (Google is the fallback). Only one provider can be preferred at a time. Existing pins always open by their own provider field.";
    readonly "editor.providerPreferBaiduTencent": "When preferred, blank clicks try Baidu/Tencent before other alts (e.g. Apple). If both Baidu and Tencent are enabled they are fetched in parallel — first response becomes the default pano, the other appears in the date picker. Existing pins always open by their own provider field.";
    readonly "editor.providerPreferYandex": "When preferred, blank clicks try enabled inject providers (Baidu / Tencent / Yandex) in parallel — first response becomes the default pano, siblings appear in the date picker. Existing pins always open by their own provider field.";
    readonly "editor.providersTablist": "Providers";
    readonly "editor.pruneDuplicates": "Prune duplicates";
    readonly "editor.scoringTitle": "Scoring";
    readonly "editor.scoreBoundsAuto": "Automatic based on locations";
    readonly "editor.scoreBoundsFixed": "Fixed bounds";
    readonly "editor.scoreBoundsWorld": "World map (ACW, {distance})";
    readonly "editor.compassEast": "E";
    readonly "editor.compassNorth": "N";
    readonly "editor.compassSouth": "S";
    readonly "editor.compassWest": "W";
    readonly "editor.refetchDocument": "Re-fetch document (bypass cache)";
    readonly "editor.refreshDocument": "Refresh document";
    readonly "editor.removeAlias": "Remove alias";
    readonly "editor.removeFromAll": "Remove from all ({count} locations)";
    readonly "editor.removeFromSelection": "Remove from selection ({count} locations)";
    readonly "editor.removeFromToolbar": "Remove from toolbar";
    readonly "editor.removeSeparator": "Remove separator";
    readonly "editor.renameFieldHelp": "Rename {from} to {to} across {count} location(s). This cannot be undone.";
    readonly "editor.renameInSelection": "Rename in selection ({count} locations)";
    readonly "editor.renameTagLabel": "Rename:";
    readonly "editor.renameTagsInside.one": "Rename {count} tag inside";
    readonly "editor.renameTagsInside.other": "Rename {count} tags inside";
    readonly "editor.replacePlaceholder": "Replace with...";
    readonly "editor.replaceTags.one": "Replace {count} tag";
    readonly "editor.replaceTags.other": "Replace {count} tags";
    readonly "editor.resetZoom": "Reset zoom";
    readonly "editor.returnToSpawn": "Return to spawn (R)";
    readonly "editor.reviewProgress": "Reviewing {pos} / {total} · {reviewed} reviewed";
    readonly "editor.reviewSelection": "Review selection";
    readonly "editor.saveAsTag": "Save as tag";
    readonly "editor.scopeSaved": "Saved selection";
    readonly "editor.seen": "Seen";
    readonly "editor.selectDoclinkTag": "Select a tag with document links to view its section.";
    readonly "editor.selected": "selected";
    readonly "editor.selectField": "Select a field...";
    readonly "editor.selectingNewLocations": "Selecting new locations";
    readonly "editor.selectionOptions": "Selection options";
    readonly "editor.selectOnlyMode": "Select-only mode";
    readonly "editor.set": "Set";
    readonly "editor.showLines": "Show lines:";
    readonly "editor.showLinkedSection": "Show linked section only";
    readonly "editor.showLocationPreviews": "Show location previews when hovering the map";
    readonly "editor.showSearchRadiusCursor": "Show click search radius at cursor";
    readonly "editor.showWholeDocument": "Show whole document";
    readonly "editor.smallerMinimap": "Smaller minimap";
    readonly "editor.smallerPreview": "Smaller location preview";
    readonly "editor.spacedApartSuffix": ", at least {distance}m apart";
    readonly "editor.specificPanorama": "Specific Panorama";
    readonly "editor.streetViewLayer": "Street View";
    readonly "editor.streetViewProviders": "Street View providers";
    readonly "editor.styleLabel": "Style:";
    readonly "editor.styleName": "Style name";
    readonly "editor.styleJsonPlaceholder": '[{"featureType":"water","stylers":[{"color":"#ff0000"}]}]';
    readonly "editor.svAll": "All";
    readonly "editor.svLayerOpacity": "Street View layer opacity";
    readonly "editor.svOfficial": "Official";
    readonly "editor.svUnofficial": "Unofficial";
    readonly "editor.switchMap": "Switch map";
    readonly "editor.tagNamePlaceholder": "Tag name...";
    readonly "editor.tagRenamesIrreversible": "Tag renames cannot be undone.";
    readonly "editor.tagsAffected.one": "{count} tag affected";
    readonly "editor.tagsAffected.other": "{count} tags affected";
    readonly "editor.tagsLabel": "Tags";
    readonly "editor.tagSortAmount": "amount";
    readonly "editor.tagSortDefault": "default";
    readonly "editor.tagSortName": "name";
    readonly "editor.tagsPickOne": "Tags (pick one to arm)";
    readonly "editor.takesKeyFrom": "Takes the key from \"{name}\".";
    readonly "editor.targetFolder": "Target folder";
    readonly "editor.targetFolderPlaceholder": "e.g. Europe/France (blank = top level)";
    readonly "editor.terrain": "Terrain";
    readonly "editor.thinnerLines": "Make the lines thinner";
    readonly "editor.toggleDoclinkPanel": "Toggle doclink panel";
    readonly "editor.toggleFullscreen": "Toggle fullscreen ({key})";
    readonly "editor.toggleWholeDocument": "Toggle whole document";
    readonly "editor.top": "Top";
    readonly "editor.trekkerLine": "Trekker line";
    readonly "editor.trekkerPoint": "Trekker point";
    readonly "editor.typeColumn": "Type";
    readonly "editor.typeCommand": "Type command";
    readonly "editor.unGhostSelection": "Un-ghost selection";
    readonly "editor.unpinFollowTags": "Unpin (follow selected tags)";
    readonly "editor.unpinFromToolbar": "Unpin from toolbar";
    readonly "editor.unsupportedDoclink": "Unsupported document link: {url}";
    readonly "editor.updateFilter": "Update filter";
    readonly "editor.usePanoIdDefault": "Use Pano ID locations by default";
    readonly "editor.viewportLock": "VIEWPORT LOCK h {heading} p {pitch} z {zoom}";
    readonly "editor.yandexMaps": "Yandex Maps";
    readonly "editor.zoomReadout": "zoom {zoom}";
    readonly "editor.altitudeZoom": "{altitude}m · zoom {zoom}";
    readonly "editor.addAliasSubmit": "Add alias";
    readonly "import.addTagPlaceholder": "Add tag...";
    readonly "import.discard": "Discard";
    readonly "import.dontWarnAgain": "Don't warn again for large imports";
    readonly "import.error": "Import failed: {message}";
    readonly "import.fields": "Fields";
    readonly "import.importAndCommit": "Import and commit";
    readonly "import.importing": "Importing...";
    readonly "import.largeImportBody": "This import adds {count} locations and will commit immediately. Continue?";
    readonly "import.locationCount.one": "{count} location";
    readonly "import.locationCount.other": "{count} locations";
    readonly "import.tagAllImported": "Tag all imported locations";
    readonly "import.tagsInFile": "Tags in file";
    readonly "import.title": "Import";
    readonly "import.warnings.one": "{count} warning";
    readonly "import.warnings.other": "{count} warnings";
    readonly "export.asCsv": "As CSV";
    readonly "export.asGeoJson": "As GeoJSON";
    readonly "export.asJson": "As JSON";
    readonly "export.bypassUnpanned": "Bypass unpanned check";
    readonly "export.bypassUnpannedHelp": "Export locations even if they haven't been panned yet.";
    readonly "export.csvNote": "CSV exports core fields only; extra metadata is omitted.";
    readonly "export.fileName": "File name";
    readonly "export.geoJsonNote": "Point features with tags and selected metadata fields.";
    readonly "export.saveAppData": "Save app data";
    readonly "export.saveAppDataHelp": "Includes tags, selections, and other app-specific metadata.";
    readonly "export.saveZoomLevels": "Save zoom levels";
    readonly "bulk.backwards": "Backwards";
    readonly "bulk.cancelledAt": "Cancelled at {done} / {total}";
    readonly "bulk.clearedFields": "Cleared fields on {count} locations";
    readonly "bulk.clearFields.one": "Clear {count} field";
    readonly "bulk.clearFields.other": "Clear {count} fields";
    readonly "bulk.clearMetadataFields": "Clear metadata fields";
    readonly "bulk.doneDownloaded": "Downloaded {ok} panorama(s)";
    readonly "bulk.doneDownloadedFailed": ", {failed} failed";
    readonly "bulk.donePinned": "Pinned {count} locations";
    readonly "bulk.doneProcessed": "Processed {count} locations";
    readonly "bulk.doneProcessedIn": " in {seconds}s";
    readonly "bulk.doneValidated": "Validated {count} locations";
    readonly "bulk.downloadPanoramas": "Download panoramas";
    readonly "bulk.enrichMetadata": "Enrich metadata";
    readonly "bulk.equirectangular": "Equirectangular";
    readonly "bulk.equirectHint": "Equirectangular / perspective: all providers enabled.";
    readonly "bulk.expressionHint": "Constant or expression over fields (e.g. sunAzimuth, drivingDirection, lat).";
    readonly "bulk.failed": "failed";
    readonly "bulk.field": "Field";
    readonly "bulk.fieldNamePlaceholder": "Field name";
    readonly "bulk.forwards": "Forwards";
    readonly "bulk.invalidExpression": "Invalid expression: {error}";
    readonly "bulk.invalidExpressionShort": "Invalid expression";
    readonly "bulk.locationsNotPinned": "{count} locations not pinned to pano ID";
    readonly "bulk.mode": "Mode";
    readonly "bulk.newField": "New field...";
    readonly "bulk.newFieldName": "New field name";
    readonly "bulk.noData": "No data";
    readonly "bulk.noEnrichmentFields": "No enrichment fields enabled.";
    readonly "bulk.noMetadataFields": "No metadata fields on these locations.";
    readonly "bulk.nothingToProcess": "Nothing to process.";
    readonly "bulk.numberPlaceholder": "Number or expression";
    readonly "bulk.operationFailed": "Operation failed";
    readonly "bulk.panHeadingsAlongRoad": "Pan headings along road";
    readonly "bulk.pannedHeadings": "Panned headings on {count} locations";
    readonly "bulk.panoramaSaved": "Panorama saved";
    readonly "bulk.perspective": "Perspective";
    readonly "bulk.pinToPanoId": "Pin to Pano ID";
    readonly "bulk.progress": "{done} / {total}";
    readonly "bulk.reEnrich": "Re-enrich even if fields already exist";
    readonly "bulk.rePin": "Re-pin even if already pinned";
    readonly "bulk.savedPanoramasZip": "Saved {count} panoramas as ZIP";
    readonly "bulk.saveFailed": "Save failed";
    readonly "bulk.saveImage": "Save image";
    readonly "bulk.saveZip": "Save ZIP";
    readonly "bulk.selectFailed": "Select failed";
    readonly "bulk.selectField": "Select field";
    readonly "bulk.setFieldButton": "Set field";
    readonly "bulk.setFieldOn": "Set field on {count} locations";
    readonly "bulk.setMetadataField": "Set metadata field";
    readonly "bulk.skippedMissingFields": "({count} skipped — missing fields)";
    readonly "bulk.start": "Start";
    readonly "bulk.thumbnail": "Thumbnail";
    readonly "bulk.thumbnailHint": "Thumbnail: Google, Baidu, Tencent (Apple and Yandex are skipped).";
    readonly "bulk.tile": "Tile";
    readonly "bulk.tileHint": "Tile: Google, Baidu, Tencent, Yandex. Yandex zoom is reversed.";
    readonly "bulk.tileX": "Tile X";
    readonly "bulk.tileY": "Tile Y";
    readonly "bulk.updated": "updated";
    readonly "bulk.useLatestTimeline": "Use latest timeline date when pinning";
    readonly "bulk.validateLocations": "Validate locations";
    readonly "bulk.value": "Value";
    readonly "bulk.values": "{count} values";
    readonly "bulk.withoutPanoId": "{count} locations without a pinned pano ID";
    readonly "bulk.withoutPanoIdProvider": "{count} locations without pano ID or unsupported provider";
    readonly "bulk.zoomLevel": "Zoom level";
    readonly "seen.allCountries": "All countries";
    readonly "seen.allMaps": "All maps";
    readonly "seen.noPanosFound": "No panoramas found.";
    readonly "seen.searchAddress": "Search address...";
    readonly "seen.title": "Seen locations ({count})";
    readonly "review.clickToRename": "Click to rename";
    readonly "review.completed": "Completed";
    readonly "review.defaultName": "Review session";
    readonly "review.deleteSession": "Delete session";
    readonly "review.inProgress": "In progress";
    readonly "review.noActive": "No active review sessions.";
    readonly "review.noCompleted": "No completed review sessions.";
    readonly "review.resume": "Resume";
    readonly "review.reviewedProgress": "{reviewed} / {total} reviewed";
    readonly "review.selectReviewed": "Select reviewed locations";
    readonly "review.selectUnreviewed": "Select unreviewed locations";
    readonly "review.started": "Started {date}";
    readonly "review.updated": "Updated {time}";
    readonly "versionHistory.areYouSure": "Are you sure?";
    readonly "versionHistory.date": "Date";
    readonly "versionHistory.hash": "Hash";
    readonly "versionHistory.latest": "Latest";
    readonly "versionHistory.locations": "Locations";
    readonly "versionHistory.noChanges": "No changes";
    readonly "versionHistory.noCommits": "No commits yet.";
    readonly "versionHistory.restore": "Restore";
    readonly "versionHistory.restoring": "Restoring...";
    readonly "versionHistory.revert": "Revert";
    readonly "versionHistory.viewChanges": "View changes";
    readonly "merge.merging": "Merging...";
    readonly "merge.noGroups": "No duplicate groups within {distance}m.";
    readonly "merge.preview": "Found {groups} groups — {mergedAway} locations would merge away (largest group: {largest}).";
    readonly "copyToMap.addMapPlaceholder": "Add map...";
    readonly "copyToMap.hint": "Press a number key (1–9) while viewing a location to copy it to these maps.";
    readonly "copyToMap.missingMap": "(missing map)";
    readonly "copyToMap.searchPlaceholder": "Search maps...";
    readonly "copyToMap.unnamed": "(unnamed)";
    readonly "selection.and": "AND";
    readonly "selection.bottom": "Bottom";
    readonly "selection.bottomK": "Bottom {k} by {field}";
    readonly "selection.commands": "Commands...";
    readonly "selection.coordinateLocations": "Coordinate locations";
    readonly "selection.defaultName": "Selection";
    readonly "selection.deselect": "Deselect";
    readonly "selection.distanceM": "Distance (m):";
    readonly "selection.downloadGeoJson": "Download GeoJSON";
    readonly "selection.duplicates": "Duplicates ({distance}m)";
    readonly "selection.editFilter": "Edit filter";
    readonly "selection.everything": "Everything";
    readonly "selection.ghost": "Ghost selection";
    readonly "selection.ghostHint": "Ghost selection (Alt-click to isolate)";
    readonly "selection.hasField": "has {field}";
    readonly "selection.intersection": "Intersection";
    readonly "selection.invert": "Invert selection";
    readonly "selection.invertNamed": "Invert: {name}";
    readonly "selection.locationTime": " (location time)";
    readonly "selection.manual": "Manual selection";
    readonly "selection.meters": "Meters";
    readonly "selection.minDistance": "Min distance (m)";
    readonly "selection.missingField": "missing {field}";
    readonly "selection.nextPeriod": "Next period";
    readonly "selection.ofTotal": "of {total}";
    readonly "selection.options": "Selection options";
    readonly "selection.or": "OR";
    readonly "selection.panoIds": "Pano ID locations";
    readonly "selection.pickCount": "Count";
    readonly "selection.polygon": "Polygon";
    readonly "selection.polygonNamed": "Polygon: {name}";
    readonly "selection.polygonNamePrompt": "Polygon name";
    readonly "selection.previousPeriod": "Previous period";
    readonly "selection.pruneDuplicates": "Prune duplicates";
    readonly "selection.recolor": "Recolor";
    readonly "selection.review": "Review selection";
    readonly "selection.reviewed": "Reviewed";
    readonly "selection.saveAsTag": "Save as tag";
    readonly "selection.selectedCount": "{count} selected";
    readonly "selection.tag": "Tag: {name}";
    readonly "selection.top": "Top";
    readonly "selection.topK": "Top {k} by {field}";
    readonly "selection.uncommitted": "Uncommitted";
    readonly "selection.unghost": "Un-ghost selection";
    readonly "selection.union": "Union";
    readonly "selection.unpanned": "Unpanned";
    readonly "selection.unreviewed": "Unreviewed";
    readonly "selection.untagged": "Untagged";
    readonly "filter.addFilter": "Add filter";
    readonly "filter.copyToMax": "Copy to max";
    readonly "filter.copyToMin": "Copy to min";
    readonly "filter.lengthPlaceholder": "Length";
    readonly "filter.maxPlaceholder": "Max";
    readonly "filter.op.between": "between";
    readonly "filter.op.between_anytime": "between (any date)";
    readonly "filter.op.between_anyyear": "between (any year)";
    readonly "filter.op.contains": "contains";
    readonly "filter.op.eq": "=";
    readonly "filter.op.gt": ">";
    readonly "filter.op.gte": ">=";
    readonly "filter.op.has": "has";
    readonly "filter.op.length.between": "length between";
    readonly "filter.op.length.eq": "length =";
    readonly "filter.op.length.gt": "length >";
    readonly "filter.op.length.gte": "length >=";
    readonly "filter.op.length.lt": "length <";
    readonly "filter.op.length.lte": "length <=";
    readonly "filter.op.length.neq": "length !=";
    readonly "filter.op.lt": "<";
    readonly "filter.op.lte": "<=";
    readonly "filter.op.neq": "!=";
    readonly "filter.op.notcontains": "does not contain";
    readonly "filter.op.nothas": "does not have";
    readonly "filter.updateFilter": "Update filter";
    readonly "filter.valuePlaceholder": "Value";
    readonly "validation.goodcamAvailable": "Badcam, but good coverage available";
    readonly "validation.notFound": "Not found";
    readonly "validation.ok": "Valid location";
    readonly "validation.panoIdBroke": "Pano ID broke";
    readonly "validation.unofficial": "Unofficial";
    readonly "validation.updateApplied": "Coverage updated since last view";
    readonly "validation.updateAvailable": "Newer coverage available";
    readonly "mapLayer.adjustingMarkerOpacity": "Adjusting marker opacity";
    readonly "mapLayer.adjustingSvOpacity": "Adjusting Street View opacity";
    readonly "mapLayer.all": "All";
    readonly "mapLayer.blobbyLayer": "Use blobby layer while zoomed out";
    readonly "mapLayer.coverageLineColor": "Coverage line color";
    readonly "mapLayer.emphasiseCountryBorders": "Emphasise country borders";
    readonly "mapLayer.emphasiseSubdivisionBorders": "Emphasise subdivision borders";
    readonly "mapLayer.hideHighways": "Hide highways";
    readonly "mapLayer.hidePoi": "Hide points of interest";
    readonly "mapLayer.hideRoadLabels": "Hide road labels";
    readonly "mapLayer.hideTransit": "Hide transit";
    readonly "mapLayer.hybrid": "Hybrid";
    readonly "mapLayer.labels": "Labels";
    readonly "mapLayer.layers": "Layers";
    readonly "mapLayer.markerOpacity": "Marker layer opacity";
    readonly "mapLayer.official": "Official";
    readonly "mapLayer.panoramas": "Panoramas (requires close zoom)";
    readonly "mapLayer.pointAlongRoad": "Point view along the road by default";
    readonly "mapLayer.preferOfficial": "Prefer official coverage over unofficial";
    readonly "mapLayer.preferQuality": "Prefer higher quality over newer images";
    readonly "mapLayer.roadmap": "Roadmap";
    readonly "mapLayer.satellite": "Satellite";
    readonly "mapLayer.showLines": "Show lines:";
    readonly "mapLayer.streetView": "Street View";
    readonly "mapLayer.svOpacity": "Street View layer opacity";
    readonly "mapLayer.terrain": "Terrain";
    readonly "mapLayer.thinnerLines": "Make the lines thinner";
    readonly "mapLayer.unofficial": "Unofficial";
    readonly "mapLayer.vector": "Vector";
    readonly "mapStyles.copyJson": "Copy JSON";
    readonly "mapStyles.deleteStyle": "Delete style";
    readonly "mapStyles.manage": "Manage map styles";
    readonly "mapStyles.styleName": "Style name";
    readonly "map.contextMenu": "Context menu";
    readonly "map.zoomIn": "Zoom in";
    readonly "map.zoomOut": "Zoom out";
    readonly "commandPalette.group.Bulk Operations": "Bulk Operations";
    readonly "commandPalette.group.Map": "Map";
    readonly "commandPalette.group.Selections": "Selections";
    readonly "commandPalette.group.Tags": "Tags";
    readonly "commandPalette.noOtherMaps": "No other maps.";
    readonly "commandPalette.openMap": "Open map...";
    readonly "commandPalette.pin": "Pin to toolbar";
    readonly "commandPalette.placeholder": "Type command";
    readonly "commandPalette.switchMap": "Switch map";
    readonly "commandPalette.title": "Command Palette";
    readonly "commandPalette.unpin": "Unpin from toolbar";
    readonly "pinnedToolbar.remove": "Remove from toolbar";
    readonly "savedSelection.namePlaceholder": "Name this selection...";
    readonly "savedSelection.noneSaveable": "No saveable selections active.";
    readonly "savedSelection.noneSaved": "No saved selections.";
    readonly "enrichment.comparison.auto": "Auto";
    readonly "enrichment.comparison.categorical": "Categorical";
    readonly "enrichment.comparison.circular": "Circular";
    readonly "enrichment.comparison.linear": "Numeric";
    readonly "enrichment.coveragePercent": "{pct}% of locations";
    readonly "enrichment.deleteField": "Delete field";
    readonly "enrichment.enrichLocations": "Enrich locations";
    readonly "enrichment.fieldType.array": "Array";
    readonly "enrichment.fieldType.boolean": "Boolean";
    readonly "enrichment.fieldType.date": "Date/time";
    readonly "enrichment.fieldType.enum": "Enum";
    readonly "enrichment.fieldType.number": "Number";
    readonly "enrichment.fieldType.string": "Text";
    readonly "enrichment.mergeField": "Merge field";
    readonly "enrichment.notEnrichmentField": "Not an enrichment field";
    readonly "enrichment.openManualChapter": "Open manual chapter";
    readonly "enrichment.renameField": "Rename field";
    readonly "tag.addAlias": "Add alias...";
    readonly "tag.addPlaceholder": "Add a tag…";
    readonly "tag.bulkAddPlaceholder": "Bulk-add tag...";
    readonly "tag.filterPlaceholder": "Filter tags...";
    readonly "tag.folderName": "Folder name";
    readonly "tag.folderPathPlaceholder": "path/to/folder";
    readonly "tag.hotkeyNote": "Hotkeys apply when the tag bar is focused.";
    readonly "tag.namePlaceholder": "Tag name...";
    readonly "tag.newFolder": "New folder";
    readonly "tag.newFolderIn": "New folder in \"{path}\"";
    readonly "tag.newSubfolder": "New subfolder...";
    readonly "tag.removeAlias": "Remove alias";
    readonly "tag.sort.amount": "Amount";
    readonly "tag.sort.default": "Default";
    readonly "tag.sort.name": "Name";
    readonly "applyFieldAsTags.bucketWidth": "Bucket width";
    readonly "applyFieldAsTags.noTimezoneData": "No timezone data on locations.";
    readonly "provider.apple": "Apple Look Around";
    readonly "provider.baidu": "Baidu";
    readonly "provider.carLine": "Car line";
    readonly "provider.enable": "Enable";
    readonly "provider.enableAll": "Enable all providers";
    readonly "provider.hint.apple.fallback": "When enabled, clicking a spot without Look Around coverage opens Google Street View instead.";
    readonly "provider.hint.apple.prefer": "When preferred and enabled, blank map clicks create Look Around locations first (Google is the fallback). Only one provider can be preferred at a time. Existing pins always open by their own provider field.";
    readonly "provider.hint.baidu.fallback": "When enabled, clicking a spot without Baidu/Tencent coverage opens Google Street View instead.";
    readonly "provider.hint.baidu.prefer": "When preferred, blank clicks try Baidu/Tencent before other alts (e.g. Apple). If both Baidu and Tencent are enabled they are fetched in parallel — first response becomes the default pano, the other appears in the date picker. Existing pins always open by their own provider field.";
    readonly "provider.hint.tencent.fallback": "When enabled, clicking a spot without Baidu/Tencent coverage opens Google Street View instead.";
    readonly "provider.hint.tencent.prefer": "When preferred, blank clicks try Baidu/Tencent before other alts (e.g. Apple). If both Baidu and Tencent are enabled they are fetched in parallel — first response becomes the default pano, the other appears in the date picker. Existing pins always open by their own provider field.";
    readonly "provider.hint.yandex.fallback": "When enabled, clicking a spot without Yandex coverage opens Google Street View instead.";
    readonly "provider.hint.yandex.prefer": "When preferred, blank clicks try enabled inject providers (Baidu / Tencent / Yandex) in parallel — first response becomes the default pano, siblings appear in the date picker. Existing pins always open by their own provider field.";
    readonly "provider.lines": "Lines";
    readonly "provider.linesOpacity": "Lines opacity";
    readonly "provider.linesPmtiles": "Lines (PMTiles)";
    readonly "provider.linesRaster": "Lines (raster)";
    readonly "provider.linesRasterMvt": "Lines (raster + MVT)";
    readonly "provider.lineWidth": "Line width";
    readonly "provider.points": "Panorama points (z≥16)";
    readonly "provider.pointSize": "Point size";
    readonly "provider.pointsOpacity": "Points opacity";
    readonly "provider.preferOnClick": "Prefer on map click";
    readonly "provider.resetDefaults": "Reset to defaults";
    readonly "provider.section.behavior": "Behavior";
    readonly "provider.section.colors": "Colors";
    readonly "provider.section.coverage": "Coverage layers";
    readonly "provider.sidebarTitle": "Street View providers";
    readonly "provider.tencent": "Tencent";
    readonly "provider.trekkerLine": "Trekker line";
    readonly "provider.yandex": "Yandex";
    readonly "doclink.openBrowser": "Open in browser";
    readonly "doclink.pasteLinkPlaceholder": "Paste document link...";
    readonly "doclink.pin": "Pin panel";
    readonly "doclink.refresh": "Refresh";
    readonly "doclink.removeAllLinks": "Remove all links";
    readonly "doclink.showSection": "Show section only";
    readonly "doclink.showWholeDoc": "Show whole document";
    readonly "doclink.title": "Doclink";
    readonly "pano.badge.apple": "apple";
    readonly "pano.badge.backpack": "Backpack";
    readonly "pano.badge.badcam": "Badcam";
    readonly "pano.badge.baidu": "Baidu";
    readonly "pano.badge.bigCam": "Big Cam";
    readonly "pano.badge.gen1": "Gen1";
    readonly "pano.badge.gen2": "Gen2/3";
    readonly "pano.badge.gen4": "Gen4";
    readonly "pano.badge.lowCam": "Low Cam";
    readonly "pano.badge.smallCam": "Small Cam";
    readonly "pano.badge.tencent": "Tencent";
    readonly "pano.badge.trekker": "Trekker";
    readonly "pano.badge.tripod": "Tripod";
    readonly "pano.badge.unofficial": "unofficial";
    readonly "pano.badge.yandex": "Yandex";
    readonly "pano.compassTooltip": "Click to point north (N). Ctrl+click to cycle through linked panoramas.";
    readonly "pano.copyLinkHint": "Copy link — Shift: without tags, Alt: long URL";
    readonly "pano.default": "Default";
    readonly "pano.direction.E": "E";
    readonly "pano.direction.N": "N";
    readonly "pano.direction.S": "S";
    readonly "pano.direction.W": "W";
    readonly "pano.group.default": "Default / auto-updating";
    readonly "pano.group.specific": "Specific Panorama";
    readonly "pano.jumpBackward": "Jump backward 100m";
    readonly "pano.jumpForward": "Jump forward 100m";
    readonly "pano.nextLocation": "Go to next location (Control+Right)";
    readonly "pano.noDates": "No dates";
    readonly "pano.openInMaps": "Open in maps";
    readonly "pano.pinnedNo": "Pinned pano: no";
    readonly "pano.pinnedYes": "Pinned pano: yes";
    readonly "pano.pointNorth": "Point north";
    readonly "pano.prevLocation": "Go to previous location (Control+Left)";
    readonly "pano.resetZoom": "Reset zoom";
    readonly "pano.returnToSpawn": "Return to spawn (R)";
    readonly "pano.zoomIn": "Zoom in";
    readonly "pano.zoomOut": "Zoom out";
    readonly "command.applyFieldAsTags": "Apply metadata as tags";
    readonly "command.applySavedSelection": "Apply saved selection...";
    readonly "command.assignDoclinks": "Assign document links...";
    readonly "command.bulkClearFields": "Clear metadata fields";
    readonly "command.bulkDownloadPanoramas": "Download panoramas";
    readonly "command.bulkEnrich": "Enrich metadata fields";
    readonly "command.bulkHeadingRoad": "Pan headings along road";
    readonly "command.bulkPinPano": "Pin locations to pano ID";
    readonly "command.bulkSetField": "Set metadata field value";
    readonly "command.bulkValidate": "Validate locations";
    readonly "command.copyToMap": "Copy location to map via hotkeys...";
    readonly "command.deleteSelectedTags": "Delete selected tags";
    readonly "command.deselectAll": "Deselect everything";
    readonly "command.downloadPolygonGeojson": "Download polygon selections as GeoJSON";
    readonly "command.export": "Export";
    readonly "command.filterByMetadata": "Filter by metadata...";
    readonly "command.findDuplicates": "Find duplicates...";
    readonly "command.ghostSelections": "Ghost selections";
    readonly "command.import": "Import file";
    readonly "command.intersectSelections": "Intersect (AND) selections";
    readonly "command.invertSelection": "Invert selection";
    readonly "command.loadGeojson": "Load shapes from GeoJSON as selection";
    readonly "command.mergeDuplicates": "Merge duplicates...";
    readonly "command.openHistory": "Open version history";
    readonly "command.openSeen": "Open seen locations";
    readonly "command.quickCopyToMap": "Copy location to map...";
    readonly "command.redo": "Redo";
    readonly "command.reviewSelected": "Review selected locations";
    readonly "command.reviewSessions": "Review sessions";
    readonly "command.save": "Commit map";
    readonly "command.saveSelections": "Save current selections...";
    readonly "command.selectAll": "Select everything";
    readonly "command.selectionDeleteLocations": "Delete selected locations";
    readonly "command.selectNoPanoid": "Select non-Pano ID locations";
    readonly "command.selectPanoid": "Select Pano ID locations";
    readonly "command.selectRandom": "Pick random locations from selection";
    readonly "command.selectReviewed": "Select reviewed locations";
    readonly "command.selectSpaced": "Pick evenly spaced locations from selection";
    readonly "command.selectUncommitted": "Select uncommitted locations";
    readonly "command.selectUnpanned": "Select unpanned locations";
    readonly "command.selectUntagged": "Select untagged locations";
    readonly "command.tagDownloadCsv": "Download tag counts as CSV";
    readonly "command.tagFindReplace": "Find and replace in tag names";
    readonly "command.toggleSeenOverlay": "Toggle seen locations overlay";
    readonly "command.topK": "Select top/bottom K...";
    readonly "command.undo": "Undo";
    readonly "command.unionSelections": "Union (OR) selections";
    readonly "hotkey.centerRoad": "Center toward nearest road direction";
    readonly "hotkey.closeMap": "Close map";
    readonly "hotkey.copyLink": "Copy Street View link";
    readonly "hotkey.countrySelect": "Hold + click for country (+Shift for subdivision)";
    readonly "hotkey.cycleMovementMode": "Cycle movement mode";
    readonly "hotkey.deletePolygon": "Hold + click to delete polygon";
    readonly "hotkey.downloadPanoTile": "Download panorama";
    readonly "hotkey.duplicateLocation": "Duplicate location";
    readonly "hotkey.followRoad": "Follow linked panos along road";
    readonly "hotkey.jumpBackward": "Jump backward 100m";
    readonly "hotkey.jumpForward": "Jump forward 100m";
    readonly "hotkey.locationClose": "Close location";
    readonly "hotkey.locationDelete": "Delete location";
    readonly "hotkey.locationSave": "Save location";
    readonly "hotkey.mapZoomBounds": "Zoom to bounds";
    readonly "hotkey.mapZoomIn": "Zoom in";
    readonly "hotkey.mapZoomOut": "Zoom out";
    readonly "hotkey.mapZoomReset": "Zoom all the way out";
    readonly "hotkey.mapZoomSelection": "Zoom to selection bounds";
    readonly "hotkey.nextPanoDate": "Next date cycle";
    readonly "hotkey.openCommandPalette": "Open command palette";
    readonly "hotkey.openManualSearch": "Search the manual";
    readonly "hotkey.panDown": "Pan down";
    readonly "hotkey.panLeft": "Pan left";
    readonly "hotkey.panoLookDown": "Look down";
    readonly "hotkey.panoLookLeft": "Look left";
    readonly "hotkey.panoLookRight": "Look right";
    readonly "hotkey.panoLookUp": "Look up";
    readonly "hotkey.panoMoveBackward": "Move backward";
    readonly "hotkey.panoMoveForward": "Move forward";
    readonly "hotkey.panoZoomReset": "Zoom all the way out";
    readonly "hotkey.panRight": "Pan right";
    readonly "hotkey.panToLocation": "Pan map to location";
    readonly "hotkey.panUp": "Pan up";
    readonly "hotkey.pointNorth": "Point north";
    readonly "hotkey.prevPanoDate": "Previous date cycle";
    readonly "hotkey.quicktagSlot": "Quick-tag slot {n}";
    readonly "hotkey.refreshPano": "Refresh panorama";
    readonly "hotkey.returnToSpawn": "Return to spawn";
    readonly "hotkey.reviewNext": "Next location";
    readonly "hotkey.reviewPrev": "Previous location";
    readonly "hotkey.spin180": "Spin 180°";
    readonly "hotkey.toggleCrosshair": "Toggle crosshair";
    readonly "hotkey.toggleFullscreen": "Toggle fullscreen";
    readonly "hotkey.toggleFullscreenMap": "Toggle fullscreen map";
    readonly "hotkey.toggleHideCar": "Toggle hide car";
    readonly "hotkey.toggleMarkerOpacity": "Toggle marker layer opacity";
    readonly "hotkey.togglePanoUI": "Toggle pano UI";
    readonly "hotkey.toggleSelectOnly": "Toggle select-only mode";
    readonly "hotkey.toggleStats": "Toggle stats for nerds";
    readonly "hotkey.toggleSvOpacity": "Toggle Street View layer opacity";
    readonly "hotkey.viewportLock": "Lock viewport direction";
    readonly "hotkey.zoomIn": "Zoom in";
    readonly "hotkey.zoomOut": "Zoom out";
    readonly "plugin.pivot.activeSelections": "Active selections";
    readonly "plugin.pivot.allLocations": "All locations";
    readonly "plugin.pivot.bucketNumeric": "Bucket numeric values";
    readonly "plugin.pivot.bucketOff": "Off";
    readonly "plugin.pivot.bucketOffTooMany": "Off (too many values)";
    readonly "plugin.pivot.bucketsN": "{n} buckets";
    readonly "plugin.pivot.colPct": "Col %";
    readonly "plugin.pivot.columnField": "Column field";
    readonly "plugin.pivot.columnSortHint": "Click to sort. Ctrl+Click to select matching locations.";
    readonly "plugin.pivot.computing": "Computing...";
    readonly "plugin.pivot.count": "Count";
    readonly "plugin.pivot.emptyNoFields": "No extra fields on this map. Enrich locations first.";
    readonly "plugin.pivot.emptyNoLocations": "No locations on this map.";
    readonly "plugin.pivot.emptyNoSelections": "No active selections. Add selections to see pivot data.";
    readonly "plugin.pivot.emptySavedUnresolved": "Saved selection could not be resolved.";
    readonly "plugin.pivot.includeNa": "Include N/A";
    readonly "plugin.pivot.na": "N/A";
    readonly "plugin.pivot.rowPct": "Row %";
    readonly "plugin.pivot.rows": "Rows";
    readonly "plugin.pivot.selection": "Selection";
    readonly "plugin.pivot.tagLabel": "Tag {id}";
    readonly "plugin.pivot.tags": "Tags";
    readonly "plugin.pivot.title": "Pivot Table";
    readonly "plugin.pivot.total": "Total";
    readonly "plugin.pivot.values": "Values";
    readonly "plugin.gradient.apply": "Apply";
    readonly "plugin.gradient.applyTo": "Apply to";
    readonly "plugin.gradient.bucketRangeOnly": "Only applies to Range grouping";
    readonly "plugin.gradient.buckets": "Buckets";
    readonly "plugin.gradient.emptyNoFields": "No extra fields on this map. Enrich locations first.";
    readonly "plugin.gradient.field": "Field";
    readonly "plugin.gradient.gradient": "Gradient";
    readonly "plugin.gradient.groupBy": "Group by";
    readonly "plugin.gradient.high": "High";
    readonly "plugin.gradient.low": "Low";
    readonly "plugin.gradient.preset.blueRed": "Blue-Red";
    readonly "plugin.gradient.preset.coolWarm": "Cool-Warm";
    readonly "plugin.gradient.preset.greenYellowRed": "Green-Yellow-Red";
    readonly "plugin.gradient.preset.purpleOrange": "Purple-Orange";
    readonly "plugin.gradient.preset.viridis": "Viridis";
    readonly "plugin.gradient.projection.day": "Exact day";
    readonly "plugin.gradient.projection.hourOfDay": "Hour of day";
    readonly "plugin.gradient.projection.monthOfYear": "Month of year";
    readonly "plugin.gradient.projection.range": "Range";
    readonly "plugin.gradient.projection.value": "Value";
    readonly "plugin.gradient.projection.year": "Year";
    readonly "plugin.gradient.projection.yearMonth": "Year-month";
    readonly "plugin.gradient.resultApplied.one": "{count} group applied";
    readonly "plugin.gradient.resultApplied.other": "{count} groups applied";
    readonly "plugin.gradient.resultNoGroups": "No groups found";
    readonly "plugin.gradient.resultTooMany": "{groups} groups. Too many to color (max {max}).";
    readonly "plugin.gradient.reverse": "Reverse";
    readonly "plugin.gradient.title": "Gradient";
    readonly "plugin.generator.advancedFilters": "Advanced filters";
    readonly "plugin.generator.alongRoad": "Along road";
    readonly "plugin.generator.betweenYears": "Between years";
    readonly "plugin.generator.betweenYearsAnd": "and";
    readonly "plugin.generator.changeAllCaps": "Change all caps";
    readonly "plugin.generator.checkAllDates": "Check all dates";
    readonly "plugin.generator.checkLinkedPanos": "Check linked panos";
    readonly "plugin.generator.chooseRandomDate": "Choose random date in time range";
    readonly "plugin.generator.commaSeparatedTerms": "Comma-separated terms";
    readonly "plugin.generator.coverageSettings": "Coverage settings";
    readonly "plugin.generator.depth": "Depth";
    readonly "plugin.generator.deviation": "Deviation";
    readonly "plugin.generator.filterByDistance": "Filter by minimum distance from locations";
    readonly "plugin.generator.filterByLinks": "Filter by number of links";
    readonly "plugin.generator.filterByMonth": "Filter by month";
    readonly "plugin.generator.findCurveLocations": "Find curve locations";
    readonly "plugin.generator.findGeneration": "Find generation";
    readonly "plugin.generator.findIntersectionLocations": "Find intersection locations";
    readonly "plugin.generator.findTrekkerCoverage": "Find trekker coverage";
    readonly "plugin.generator.findUnofficialCoverage": "Find unofficial coverage";
    readonly "plugin.generator.from": "From";
    readonly "plugin.generator.fromMonth": "From month";
    readonly "plugin.generator.generalSettings": "General settings";
    readonly "plugin.generator.generators": "Generators";
    readonly "plugin.generator.gen1": "Gen 1";
    readonly "plugin.generator.gen23": "Gen 2/3";
    readonly "plugin.generator.gen4": "Gen 4";
    readonly "plugin.generator.km": "km";
    readonly "plugin.generator.locationSettings": "Location settings";
    readonly "plugin.generator.locationsCapAll": "Locations cap for all regions:";
    readonly "plugin.generator.locationsPerRegion": "Locations per region:";
    readonly "plugin.generator.mapMakingSettings": "Map making settings";
    readonly "plugin.generator.max": "Max";
    readonly "plugin.generator.min": "Min";
    readonly "plugin.generator.m": "m";
    readonly "plugin.generator.oneRegionAtATime": "Only check one country/polygon at a time";
    readonly "plugin.generator.onlyOnePano": "Only one panorama on location";
    readonly "plugin.generator.onlyOnePanoHint": "Only allow locations that don't have other nearby coverage in timeframe.";
    readonly "plugin.generator.output": "Output";
    readonly "plugin.generator.pause": "Pause";
    readonly "plugin.generator.pinpointableAngle": "Pinpointable angle";
    readonly "plugin.generator.pitchDeviation": "Pitch deviation";
    readonly "plugin.generator.adjustHeading": "Adjust heading";
    readonly "plugin.generator.adjustPitch": "Adjust pitch";
    readonly "plugin.generator.adjustZoom": "Adjust zoom";
    readonly "plugin.generator.radius": "Radius";
    readonly "plugin.generator.regions": "Regions ({count})";
    readonly "plugin.generator.rejectDateless": "Reject locations without date";
    readonly "plugin.generator.rejectGen1": "Reject gen 1";
    readonly "plugin.generator.rejectNoDescription": "Reject locations without description";
    readonly "plugin.generator.rejectUnofficial": "Reject unofficial";
    readonly "plugin.generator.resume": "Resume";
    readonly "plugin.generator.sampling": "Sampling";
    readonly "plugin.generator.sampling.blueline": "Coverage";
    readonly "plugin.generator.sampling.kernels": "Grow";
    readonly "plugin.generator.sampling.poisson": "Uniform";
    readonly "plugin.generator.sampling.random": "Random";
    readonly "plugin.generator.search.contains": "Contains";
    readonly "plugin.generator.search.endsWith": "Ends with";
    readonly "plugin.generator.search.exclude": "Exclude";
    readonly "plugin.generator.search.fullWord": "Full word";
    readonly "plugin.generator.search.include": "Include";
    readonly "plugin.generator.search.sectionMatch": "Section match";
    readonly "plugin.generator.search.startsWith": "Starts with";
    readonly "plugin.generator.searchInDescription": "Search in panorama description";
    readonly "plugin.generator.selectRegionHintPrefix": "Draw a polygon on the map or hold ";
    readonly "plugin.generator.selectRegionHintSuffix": " + click to select a country outline.";
    readonly "plugin.generator.showSearchCoverage": "Show search coverage";
    readonly "plugin.generator.showSearchCoverageHint": "Draw where the generator has searched, as a growing overlay. Clears when you stop.";
    readonly "plugin.generator.skipNearExisting": "Skip near existing map locations";
    readonly "plugin.generator.speed": "Speed";
    readonly "plugin.generator.start": "Start";
    readonly "plugin.generator.stop": "Stop";
    readonly "plugin.generator.summary.allowingDateless": "allowing dateless";
    readonly "plugin.generator.summary.allowingNoDescription": "allowing no-description";
    readonly "plugin.generator.summary.anyCoverage": "any coverage";
    readonly "plugin.generator.summary.betweenDates": "between {from} and {to}";
    readonly "plugin.generator.summary.checkingAllDates": "checking all dates";
    readonly "plugin.generator.summary.checkingLinks": "checking {depth} link hops";
    readonly "plugin.generator.summary.coverageSuffix": " coverage";
    readonly "plugin.generator.summary.curvesOver": "curves >{angle}°";
    readonly "plugin.generator.summary.excludingTerms": "excluding \"{terms}\"";
    readonly "plugin.generator.summary.facingHeading": "facing {ref}{dev}";
    readonly "plugin.generator.summary.inMonthRange": "in {fromMonth}–{toMonth}, {fromYear}–{toYear}";
    readonly "plugin.generator.summary.intersections": "intersections";
    readonly "plugin.generator.summary.kmFromExisting": "{radius}km from existing";
    readonly "plugin.generator.summary.kmRadius": "{radius}km radius";
    readonly "plugin.generator.summary.linksRange": "{min}–{max} links";
    readonly "plugin.generator.summary.matchingTerms": "matching \"{terms}\"";
    readonly "plugin.generator.summary.mRadius": "{radius}m radius";
    readonly "plugin.generator.summary.noGen1": " (no Gen 1)";
    readonly "plugin.generator.summary.officialCoverage": "official coverage";
    readonly "plugin.generator.summary.oneRegionAtATime": "one region at a time";
    readonly "plugin.generator.summary.pitchDev": "pitch ±{dev}°";
    readonly "plugin.generator.summary.randomDateInTimeline": "random date in timeline";
    readonly "plugin.generator.summary.ref.alongRoad": "along road";
    readonly "plugin.generator.summary.ref.backward": "To back of car";
    readonly "plugin.generator.summary.ref.forward": "To front of car";
    readonly "plugin.generator.summary.samplingMode": "{mode} sampling";
    readonly "plugin.generator.summary.skippingExisting": "skipping existing ({radius}m)";
    readonly "plugin.generator.summary.trekker": " trekker";
    readonly "plugin.generator.summary.uniqueInTimeframe": "unique in timeframe";
    readonly "plugin.generator.summary.unofficialCoverage": "unofficial coverage";
    readonly "plugin.generator.summary.workers": "{count} workers";
    readonly "plugin.generator.summary.zoomLevel": "zoom {level}";
    readonly "plugin.generator.tagAs": "Tag as:";
    readonly "plugin.generator.title": "Map Generator";
    readonly "plugin.generator.to": "To";
    readonly "plugin.generator.toBackOfCar": "To back of car";
    readonly "plugin.generator.toFrontOfCar": "To front of car";
    readonly "plugin.generator.toMonth": "to";
    readonly "plugin.generator.unnamedPolygon": "Unnamed polygon";
    readonly "plugin.generator.visualization": "Visualization";
    readonly "plugin.generator.zoomLevel": "Zoom level";
    readonly "plugin.distribution.coordinates": "Coordinates";
    readonly "plugin.distribution.countryCount.one": "country";
    readonly "plugin.distribution.countryCount.other": "countries";
    readonly "plugin.distribution.locationCount.one": "location";
    readonly "plugin.distribution.locationCount.other": "locations";
    readonly "plugin.distribution.metadata": "Metadata";
    readonly "plugin.distribution.metadataDisabledHint": "Enrich metadata fields to enable";
    readonly "plugin.distribution.summary": "{total} {locations} across {countries}";
    readonly "plugin.distribution.title": "Distribution";
    readonly "plugin.distribution.withoutCountryData": " ({count} without country data)";
    readonly "plugin.disambiguate.analyzing": "Analyzing…";
    readonly "plugin.disambiguate.badge.categorical": "Categorical";
    readonly "plugin.disambiguate.badge.circular": "Circular {period}";
    readonly "plugin.disambiguate.badge.date": "Date";
    readonly "plugin.disambiguate.badge.lowData": "low data";
    readonly "plugin.disambiguate.badge.month": "Month";
    readonly "plugin.disambiguate.badge.numeric": "Numeric";
    readonly "plugin.disambiguate.concentration": "conc";
    readonly "plugin.disambiguate.emptyHint": "Select at least two groups to compare - tags, polygons, or filters.";
    readonly "plugin.disambiguate.errorMinGroups": "Select at least 2 groups to disambiguate.";
    readonly "plugin.disambiguate.errorNoMap": "No map open";
    readonly "plugin.disambiguate.excludedOverlap": "{count} excluded (in multiple groups)";
    readonly "plugin.disambiguate.noData": "no data";
    readonly "plugin.disambiguate.presenceDiffers": "presence differs across groups (coverage {score})";
    readonly "plugin.disambiguate.title": "Disambiguate selections";
    readonly "plugin.sync.bothAdded": "Both sides added";
    readonly "plugin.sync.bothEdited": "Both sides edited";
    readonly "plugin.sync.changeKey": "Change key";
    readonly "plugin.sync.checkingConnection": "Checking connection";
    readonly "plugin.sync.connection": "Connection";
    readonly "plugin.sync.deletedHere": "Deleted here";
    readonly "plugin.sync.deletedOneEditedOther": "Deleted on one side, edited on the other";
    readonly "plugin.sync.deletedRemote": "Deleted on the remote";
    readonly "plugin.sync.fieldDiff": "{field}: local {local} · remote {remote}";
    readonly "plugin.sync.findRemoteMap": "Find a remote map";
    readonly "plugin.sync.firstSync": "First sync";
    readonly "plugin.sync.firstSyncPrompt": "This map ({localCount}) and \"{remoteName}\" ({remoteCount}) may both already have locations. How should the first sync go?";
    readonly "plugin.sync.keepLocal": "Keep local";
    readonly "plugin.sync.keepLocalAll": "Keep local for all";
    readonly "plugin.sync.keepRemote": "Keep remote";
    readonly "plugin.sync.keepRemoteAll": "Keep remote for all";
    readonly "plugin.sync.lastSynced": "Last synced";
    readonly "plugin.sync.linkedTo": "Linked to";
    readonly "plugin.sync.linkThisMap": "Link this map";
    readonly "plugin.sync.live": "Live";
    readonly "plugin.sync.liveHint": "Sync continuously while this map is open";
    readonly "plugin.sync.liveOff": "Off";
    readonly "plugin.sync.liveOn": "On";
    readonly "plugin.sync.loadingMaps": "Loading maps";
    readonly "plugin.sync.mergeKeepBoth": "Merge · keep everything on both sides";
    readonly "plugin.sync.never": "never";
    readonly "plugin.sync.off": "Off";
    readonly "plugin.sync.on": "On";
    readonly "plugin.sync.openInProvider": "Open in {provider}";
    readonly "plugin.sync.openMapToLink": "Open a map to link it.";
    readonly "plugin.sync.outcome": "Pushed +{pushedCreate} ~{pushedUpdate} -{pushedDelete} · Pulled +{pulledCreate} ~{pulledUpdate} -{pulledDelete}{adopted}{conflicts}";
    readonly "plugin.sync.outcomeAdopted": " · Adopted {count}";
    readonly "plugin.sync.outcomeConflicts": " · {count} conflict(s) held for review";
    readonly "plugin.sync.retryLoadingMaps": "Retry loading maps";
    readonly "plugin.sync.searchMaps.one": "Search {count} map";
    readonly "plugin.sync.searchMaps.other": "Search {count} maps";
    readonly "plugin.sync.sync": "Sync";
    readonly "plugin.sync.syncing": "Syncing...";
    readonly "plugin.sync.syncNow": "Sync now";
    readonly "plugin.sync.apiKey": "API key";
    readonly "plugin.sync.apiKeyHint": "Get one at map-making.app/keys";
    readonly "plugin.sync.apiKeyPlaceholder": "paste API key";
    readonly "plugin.sync.unlink": "Unlink";
    readonly "plugin.sync.useLocal": "Use local · delete remote-only pins";
    readonly "plugin.sync.useRemote": "Use remote · delete local-only pins";
    readonly "plugin.sync.validating": "Validating...";
    readonly "plugin.sync.validate": "Validate";
    readonly "plugin.sync.countUnknown": "count unknown";
    readonly "plugin.sync.unnamed": "(unnamed)";
    readonly "plugin.sync.noneValue": "none";
    readonly "datePicker.clearTime": "Clear time (whole day)";
    readonly "datePicker.time": "Time:";
    readonly "manual.close": "Close manual";
    readonly "manual.noResults": "No results.";
    readonly "manual.searchPlaceholder": "Search the manual...";
    readonly "manual.searchTitle": "Search the manual";
    readonly "manual.title": "Manual";
    readonly "map.searchPlaces": "Search for places…";
    readonly "editor.deleteMapConfirm": "Delete \"{name}\"? This permanently removes the map and its history.";
    readonly "editor.deleteSelected": "Delete selected";
    readonly "editor.deleteSelectedTooltip": "Delete selected locations";
    readonly "editor.keepSelected": "Keep selected";
    readonly "editor.keepSelectedTooltip": "Delete all duplicate locations, except the selected ones";
    readonly "editor.mapNameLabel": "Map name:";
    readonly "editor.noTags": "No tags";
    readonly "editor.sameLocationHeading.one": "{count} location";
    readonly "editor.sameLocationHeading.other": "{count} locations";
    readonly "editor.sameLocationIntro": "Multiple locations were selected around this coordinate. Click one of the thumbnails below to view that location.";
    readonly "editor.unnamed": "(unnamed)";
    readonly "stats.build": "Build";
    readonly "stats.commits": "Commits";
    readonly "stats.cpuPerFrame": "CPU / frame";
    readonly "stats.cpuPerFrameValue": "{ms} ms";
    readonly "stats.dbSize": "DB size";
    readonly "stats.deckLayersDrawn": "Deck layers drawn";
    readonly "stats.deckLayersDrawnValue": "{drawn} of {total}";
    readonly "stats.dpr": "DPR";
    readonly "stats.estFragments": "Est fragments";
    readonly "stats.estFragmentsValue": "{count}M / frame";
    readonly "stats.foreignKeys": "Foreign keys";
    readonly "stats.fps": "FPS";
    readonly "stats.fpsValue": "{fps} (p95 {p95} ms, worst {worst} ms)";
    readonly "stats.gpuMemory": "GPU memory";
    readonly "stats.gpuMemoryValue": "{total} (buf {buffer}, tex {texture})";
    readonly "stats.gpuPerFrame": "GPU / frame";
    readonly "stats.gpuPerFrameValue": "{ms} ms";
    readonly "stats.jsHeap": "JS heap";
    readonly "stats.journalMode": "Journal mode";
    readonly "stats.layers": "Layers";
    readonly "stats.locations": "Locations";
    readonly "stats.longTasks": "Long tasks";
    readonly "stats.longTasksValue": "{count} ({ms} ms)";
    readonly "stats.maps": "Maps";
    readonly "stats.markerQuad": "Marker quad";
    readonly "stats.markerQuadValue": "{size}px {style} x{markerSize} @ {dpr}dpr";
    readonly "stats.markers": "Markers";
    readonly "stats.markersNoMap": "no map open";
    readonly "stats.markersValue": "{total} ({onScreen} on screen)";
    readonly "stats.na": "n/a";
    readonly "stats.opensv": "opensv";
    readonly "stats.overdraw": "Overdraw";
    readonly "stats.overdrawValue": "{ratio}x viewport";
    readonly "stats.pendingSaves": "Pending saves";
    readonly "stats.renderingLive": "Rendering (live)";
    readonly "stats.selectionOverlay": "Selection overlay";
    readonly "stats.startup": "Startup";
    readonly "stats.tags": "Tags";
    readonly "stats.title": "Stats for nerds";
    readonly "stats.uptime": "Uptime";
    readonly "stats.userAgent": "User agent";
    readonly "stats.version": "Version";
    readonly "stats.viewport": "Viewport";
    readonly "stats.webgl": "WebGL";
    readonly "plugin.geoguessr.signIn": "Sign in to GeoGuessr";
    readonly "plugin.geoguessr.signOut": "Sign out";
    readonly "plugin.geoguessr.waitingSignIn": "Waiting for sign-in...";
    readonly "plugin.jsonEditor.created": "created:";
    readonly "plugin.jsonEditor.id": "id:";
    readonly "plugin.jsonEditor.modified": "modified:";
    readonly "plugin.vali.title": "Vali";
    readonly "plugin.hyperlapse.title": "Road Trip";
    readonly "plugin.hyperlapse.source": "Source";
    readonly "plugin.hyperlapse.locationsHint": "{count} locations selected (need ≥ 2). Order follows each panorama’s driving direction.";
    readonly "plugin.hyperlapse.parameters": "Parameters";
    readonly "plugin.hyperlapse.fov": "FOV ({n}°)";
    readonly "plugin.hyperlapse.fps": "Play FPS ({n})";
    readonly "plugin.hyperlapse.playbackMode": "Playback mode";
    readonly "plugin.hyperlapse.modeOnce": "Once";
    readonly "plugin.hyperlapse.modeLoop": "Loop";
    readonly "plugin.hyperlapse.modePingpong": "Ping-pong";
    readonly "plugin.hyperlapse.smooth": "Smooth camera transition";
    readonly "plugin.hyperlapse.panoZoom": "Pano zoom (1–3)";
    readonly "plugin.hyperlapse.look": "Look";
    readonly "plugin.hyperlapse.lookMode": "Look mode";
    readonly "plugin.hyperlapse.lookModeDrive": "Follow driving direction";
    readonly "plugin.hyperlapse.lookModeLookAt": "Look-at point";
    readonly "plugin.hyperlapse.lookModeFixed": "Fixed heading";
    readonly "plugin.hyperlapse.lookModeFree": "Free (texture forward)";
    readonly "plugin.hyperlapse.viewFilter": "Filter";
    readonly "plugin.hyperlapse.viewFilterNone": "None";
    readonly "plugin.hyperlapse.viewFilterVivid": "Vivid";
    readonly "plugin.hyperlapse.viewFilterVintage": "Vintage";
    readonly "plugin.hyperlapse.viewFilterMono": "Mono";
    readonly "plugin.hyperlapse.lookAt": "Look-at point";
    readonly "plugin.hyperlapse.lookAtHint": "In look-at mode the viewer locks heading; drag adjusts pitch and roll only.";
    readonly "plugin.hyperlapse.lookAtActive": "Aiming at {lat}, {lng}";
    readonly "plugin.hyperlapse.lookAtMissing": "No look-at point set — pick one in the sidebar.";
    readonly "plugin.hyperlapse.useMapCenter": "Map center";
    readonly "plugin.hyperlapse.pickLookAt": "Pick on map";
    readonly "plugin.hyperlapse.pickLookAtHint": "Click the map to set the look-at point";
    readonly "plugin.hyperlapse.needMap": "Map is not ready";
    readonly "plugin.hyperlapse.fixedPitch": "Fixed pitch";
    readonly "plugin.hyperlapse.headingDeg": "Heading (°)";
    readonly "plugin.hyperlapse.pitchDeg": "Pitch (°)";
    readonly "plugin.hyperlapse.generate": "Generate";
    readonly "plugin.hyperlapse.openViewer": "Open Road Trip viewer";
    readonly "plugin.hyperlapse.needLocations": "Select at least two locations with panoramas";
    readonly "plugin.hyperlapse.ready": "Ready — {count} frames (textures load on demand)";
    readonly "plugin.hyperlapse.progress": "{phase}: {percent}% ({resolved}/{total})";
    readonly "plugin.hyperlapse.sequences": "Sequences";
    readonly "plugin.hyperlapse.sequenceMeta": "{count} frames · edited {time}";
    readonly "plugin.hyperlapse.load": "Load";
    readonly "plugin.hyperlapse.renamed": "Sequence renamed";
    readonly "plugin.hyperlapse.deleteConfirm": "Delete this sequence?";
    readonly "plugin.hyperlapse.empty": "Select locations, then generate a Road Trip sequence.";
    readonly "plugin.hyperlapse.viewerTitle": "Road Trip viewer";
    readonly "plugin.hyperlapse.play": "Play";
    readonly "plugin.hyperlapse.pause": "Pause";
    readonly "plugin.hyperlapse.next": "Next frame";
    readonly "plugin.hyperlapse.prev": "Previous frame";
    readonly "plugin.hyperlapse.fullscreen": "Fullscreen canvas";
    readonly "plugin.hyperlapse.exitFullscreen": "Exit fullscreen";
    readonly "plugin.hyperlapse.resetRoll": "Reset roll";
    readonly "plugin.hyperlapse.resetView": "Reset view offsets";
    readonly "plugin.hyperlapse.viewerHint": "Drag to look · Alt/Shift/right-drag to roll";
    readonly "plugin.hyperlapse.viewerHintLookAt": "Drag for pitch · Alt/Shift/right-drag to roll";
    readonly "command.expandSvLinks": "Expand Street View links";
    readonly "command.expandSvLinksStop": "Stop expanding links";
    readonly "command.expandSvLinksStart": "Start";
    readonly "command.expandSvLinksStarted": "Expanding Street View links…";
    readonly "command.expandSvLinksStopped": "Link expansion stopped";
    readonly "command.expandSvLinksDone": "Added {count} linked panoramas";
    readonly "command.expandSvLinksProgress": "Added {count} linked panoramas…";
    readonly "command.expandSvLinksProgressDetail": "{added} / {max} added · {queued} queued";
    readonly "command.expandSvLinksHint": "Crawl linked panoramas from the selection (Google, Baidu, Tencent, Yandex) and add them as new locations.";
    readonly "command.expandSvLinksMax": "Maximum locations to add";
    readonly "command.expandSvLinksNeedSelection": "Select at least one Google / Baidu / Tencent / Yandex location";
    readonly "command.expandSvLinksNeedProvider": "Selection has no Google / Baidu / Tencent / Yandex panoramas";
    readonly "plugin.geoguessrGame.title": "LocalGuessr";
    readonly "plugin.geoguessrGame.mapSection": "Map pool";
    readonly "plugin.geoguessrGame.currentMap": "Current map";
    readonly "plugin.geoguessrGame.poolSize": "Locations in pool";
    readonly "plugin.geoguessrGame.modeSection": "Game mode";
    readonly "plugin.geoguessrGame.movementMode": "Movement";
    readonly "plugin.geoguessrGame.roundMode": "Rounds";
    readonly "plugin.geoguessrGame.classic": "Classic";
    readonly "plugin.geoguessrGame.infinite": "Infinite";
    readonly "plugin.geoguessrGame.rounds": "Rounds ({n})";
    readonly "plugin.geoguessrGame.timerSection": "Timer";
    readonly "plugin.geoguessrGame.timerMode": "Timer mode";
    readonly "plugin.geoguessrGame.timerOff": "Off";
    readonly "plugin.geoguessrGame.timerCountdown": "Countdown";
    readonly "plugin.geoguessrGame.timerCountup": "Count up";
    readonly "plugin.geoguessrGame.timeLimit": "Time limit ({n}s)";
    readonly "plugin.geoguessrGame.statusMap": "MAP";
    readonly "plugin.geoguessrGame.stausScore": "SCORE";
    readonly "plugin.geoguessrGame.statusRound": "ROUND";
    readonly "plugin.geoguessrGame.streakSection": "Streak";
    readonly "plugin.geoguessrGame.streakMode": "Streak mode";
    readonly "plugin.geoguessrGame.streakOff": "Off";
    readonly "plugin.geoguessrGame.streakCountry": "Country";
    readonly "plugin.geoguessrGame.streakState": "State / Province";
    readonly "plugin.geoguessrGame.streakOn": "Country + State";
    readonly "plugin.geoguessrGame.countryStreak": "Country Streak";
    readonly "plugin.geoguessrGame.stateStreak": "State Streak";
    readonly "plugin.geoguessrGame.countryStreakShort": "C";
    readonly "plugin.geoguessrGame.stateStreakShort": "S";
    readonly "plugin.geoguessrGame.streakTooltip": "{mode}: {n}";
    readonly "plugin.geoguessrGame.scoreTimeX": "Time";
    readonly "plugin.geoguessrGame.scoreTimeY": "Avg Score";
    readonly "plugin.geoguessrGame.geocodeBackend": "Reverse geocode";
    readonly "plugin.geoguessrGame.geocodeLocal": "Local";
    readonly "plugin.geoguessrGame.geocodeNominatim": "Nominatim";
    readonly "plugin.geoguessrGame.nominatimKey": "Nominatim API key";
    readonly "plugin.geoguessrGame.start": "Start game";
    readonly "plugin.geoguessrGame.analytics": "Analytics";
    readonly "plugin.geoguessrGame.analyticsSub": "Your local game history and accuracy";
    readonly "plugin.geoguessrGame.noMapOpen": "Open a map to play";
    readonly "plugin.geoguessrGame.noLocations": "This map has no locations";
    readonly "plugin.geoguessrGame.roundOf": "Round {n} / {total}";
    readonly "plugin.geoguessrGame.streak": "Streak {n}";
    readonly "plugin.geoguessrGame.guess": "Guess";
    readonly "plugin.geoguessrGame.scoring": "Scoring…";
    readonly "plugin.geoguessrGame.clickToGuess": "Click the map to place your guess";
    readonly "plugin.geoguessrGame.placePinOnMap": "Place your pin on the map";
    readonly "plugin.geoguessrGame.guessPlaced": "Guess placed — hit Guess to submit";
    readonly "plugin.geoguessrGame.expandMap": "Expand map";
    readonly "plugin.geoguessrGame.shrinkMap": "Shrink map";
    readonly "plugin.geoguessrGame.checkpoint": "Set checkpoint";
    readonly "plugin.geoguessrGame.returnCheckpoint": "Return to checkpoint";
    readonly "plugin.geoguessrGame.returnToSpawn": "Return to spawn";
    readonly "plugin.geoguessrGame.hideCar": "Hide car (Ctrl+H)";
    readonly "plugin.geoguessrGame.showCar": "Show car (Ctrl+H)";
    readonly "plugin.geoguessrGame.nmpzHint": "NMPZ — place your guess on the map";
    readonly "plugin.geoguessrGame.distanceAway": "{distance} away";
    readonly "plugin.geoguessrGame.fromLocation": "From location";
    readonly "plugin.geoguessrGame.ofMaxPoints": "Of {max} points";
    readonly "plugin.geoguessrGame.noGuess": "No guess placed";
    readonly "plugin.geoguessrGame.streakHit": "Streak continues! ({n})";
    readonly "plugin.geoguessrGame.streakMiss": "Streak broken";
    readonly "plugin.geoguessrGame.streakEndedCountry": "Your streak ended after correctly guessing {n} countries in a row";
    readonly "plugin.geoguessrGame.streakEndedState": "Your streak ended after correctly guessing {n} states in a row";
    readonly "plugin.geoguessrGame.streakIndeedCountry": "It was indeed {name}. Streaks: {n}";
    readonly "plugin.geoguessrGame.streakIndeedState": "It was indeed {name}. Streaks: {n}";
    readonly "plugin.geoguessrGame.streakGuessWrongCountry": "You guessed {guess}, the correct answer is {correct}. Streaks: 0";
    readonly "plugin.geoguessrGame.streakGuessWrongState": "You guessed {guess}, the correct answer is {correct}. Streaks: 0";
    readonly "plugin.geoguessrGame.timerShort": "Time";
    readonly "plugin.geoguessrGame.ongoingGamesEmpty": "No unfinished games yet.";
    readonly "plugin.geoguessrGame.nextRound": "Next round";
    readonly "plugin.geoguessrGame.viewSummary": "View summary";
    readonly "plugin.geoguessrGame.hitSpace": "Hit";
    readonly "plugin.geoguessrGame.toContinue": "to continue";
    readonly "plugin.geoguessrGame.streakShort": "Streak";
    readonly "plugin.geoguessrGame.gameBreakdown": "Game Breakdown";
    readonly "plugin.geoguessrGame.scoreOf": "{score} / {max} ({pct}%)";
    readonly "plugin.geoguessrGame.finalStreak": "Streak: {n}";
    readonly "plugin.geoguessrGame.playAgain": "Play again";
    readonly "plugin.geoguessrGame.backToConfig": "Back";
    readonly "plugin.geoguessrGame.noGamesYet": "No games played yet. Start a round to build analytics.";
    readonly "plugin.geoguessrGame.filterCurrentMap": "Current map only";
    readonly "plugin.geoguessrGame.gamesPlayed": "Games";
    readonly "plugin.geoguessrGame.avgScore": "Avg score";
    readonly "plugin.geoguessrGame.bestScore": "Best score";
    readonly "plugin.geoguessrGame.bestStreak": "Best streak";
    readonly "plugin.geoguessrGame.perfectRounds": "5K rounds";
    readonly "plugin.geoguessrGame.totalRounds": "Total rounds";
    readonly "plugin.geoguessrGame.scoreTrend": "Score trend";
    readonly "plugin.geoguessrGame.byCountry": "By country";
    readonly "plugin.geoguessrGame.byMap": "By map";
    readonly "plugin.geoguessrGame.byProvider": "By provider";
    readonly "plugin.geoguessrGame.byMode": "By movement mode";
    readonly "plugin.geoguessrGame.scoreTrendFilterCountry": "Country";
    readonly "plugin.geoguessrGame.scoreTrendFilterMap": "Map";
    readonly "plugin.geoguessrGame.scoreTrendFilterProvider": "Provider";
    readonly "plugin.geoguessrGame.scoreTrendFilterMode": "Mode";
    readonly "plugin.geoguessrGame.scoreTrendFilterAll": "All";
    readonly "plugin.geoguessrGame.replay": "Replay";
    readonly "plugin.geoguessrGame.recentGames": "Recently played";
    readonly "plugin.geoguessrGame.ongoingGames": "Ongoing games";
    readonly "plugin.geoguessrGame.resumeGame": "Resume game";
    readonly "plugin.geoguessrGame.roundsShort": "rounds";
    readonly "plugin.geoguessrGame.clearHistory": "Clear history";
};
export type MessageKey = keyof typeof en;

declare function getLocale(): AppLocale;
/** Translate a message key with optional `{param}` interpolation. */
declare function t(key: MessageKey, params?: MessageParams): string;
/** Bases that have `.one` / `.other` variants in the English catalog. */
export type PluralBase = {
    [K in MessageKey]: K extends `${infer B}.one` ? B : never;
}[MessageKey];
/**
 * Plural-aware translate. Looks up `key.one` / `key.other` (etc.) via
 * `Intl.PluralRules`, then falls back to `key.other`.
 */
declare function tp(key: PluralBase, count: number, params?: MessageParams): string;

/** Commands */
declare const commands: {
    /**
     *  Write arbitrary text content to a named temp file (`mma_{name}`). Returns the path.
     *  Used by JS to pass large payloads via file instead of IPC serialization.
     */
    writeTempFile: (name: string, content: string) => Promise<string>;
    /**  Read a file from disk as UTF-8 text. Used by JS to read temp files and plugin sources. */
    readFile: (path: string) => Promise<string>;
    appReady: () => Promise<number>;
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
     *  Spawn a plugin's installed sidecar binary. Streams stdout/stderr lines as
     *  `sidecar-stdout` / `sidecar-stderr` events and the exit as `sidecar-exit`,
     *  keyed by the returned run id. Runs in the sidecar dir so co-located dlls resolve.
     */
    sidecarSpawn: (pluginId: string, name: string, args: string[]) => Promise<number>;
    /**  Kill a running sidecar process by run id (no-op if already exited). */
    sidecarKill: (runId: number) => Promise<null>;
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
    /**
     *  Copy locations into another map, skipping ones the target already has. Tags and extra
     *  fields carry over.
     */
    storeCopyLocationsToMap: (targetMapId: string, ids: number[]) => Promise<CopyToMapResult>;
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
    /**  Fetch a single location by ID. Returns `None` if the ID is dead or doesn't exist. */
    storeGetLocation: (id: number) => Promise<Location | null>;
    /**  Fetch multiple locations by ID. Silently skips IDs that don't exist. */
    storeGetLocationsByIds: (ids: number[]) => Promise<Location[]>;
    /**
     *  Dump every alive location to a temp JSON file. Returns the file path.
     *  Used by export and plugins that need the full dataset.
     */
    storeGetAllLocations: () => Promise<string>;
    /**
     *  Count locations by country (offline point-in-polygon). Returns unsorted (ISO-A2, count) pairs.
     *  `level` selects border precision, falling back to "light" if unavailable.
     */
    storeCountryDistribution: (level: string) => Promise<[string, number][]>;
    /**
     *  Compute the bounding box [west, south, east, north]. O(N).
     *  When `selected_only` is true, restricts to the current selection.
     */
    storeBounds: (selectedOnly: boolean) => Promise<[number, number, number, number] | null>;
    /**  Find all locations within `radius_m` metres of (`lat`, `lng`). */
    storeFindNearby: (lat: number, lng: number, radiusM: number) => Promise<Location[]>;
    /**
     *  For each input point, whether any existing location lies within `radius_m` metres.
     *  Bulk form so callers probing many coordinates (e.g. the map generator skipping
     *  already-covered spots) pay one IPC round-trip, not one per point.
     */
    storeNearAny: (lats: number[], lngs: number[], radiusM: number) => Promise<boolean[]>;
    /**
     *  Collect all distinct values for an `extra` field across all alive locations. O(N).
     *  Used by the filter UI to populate dropdown options.
     */
    storeExtraFieldValues: (field: string) => Promise<string[]>;
    /**
     *  Create tags by name. Deduplicates case-insensitively: if a tag with the same name
     *  already exists, it is made visible instead of creating a duplicate.
     *
     *  `location_ids` assigns every resulting tag to those locations in the same mutation.
     *  Doing both here is not a convenience: creating and assigning as two commands leaves the
     *  tag visible at count 0 for the round trip in between, and makes the caller fetch every
     *  location into JS just to append an id Rust already has.
     */
    storeCreateTags: (names: string[], locationIds: number[]) => Promise<MutationResult>;
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
    /**  Return the union of all currently selected location IDs. */
    storeGetSelectedIdsList: () => Promise<number[]>;
    /**
     *  Pick an evenly spaced subset of the current selection. Exactly one of `target_count`
     *  (thin to N, maximizing spacing) or `min_distance_m` (keep as many as fit at that spacing)
     *  must be provided.
     */
    storePickSpaced: (targetCount: number | null, minDistanceM: number | null) => Promise<SpacedPickResult>;
    /**
     *  Resolve a single selection to its matching location IDs without persisting it.
     *  Used by plugins and one-off queries (e.g., tag merge, export filtered).
     */
    storeResolveSelection: (props: SelectionProps) => Promise<number[]>;
    /**
     *  Group locations by a derived key, returning `{ key, ids, bin }` per group.
     *  `scope` restricts to a selection; `None` partitions the whole map.
     */
    storePartition: (field: string, key: KeySpec, scope: Scope) => Promise<PartitionBucket[]>;
    /**
     *  Transitive spatial duplicate groups (connected components, size >= 2) within `distance`
     *  metres. Read-only; used to preview a merge. Returns groups of location IDs.
     */
    storeDuplicateGroups: (distance: number) => Promise<number[][]>;
    /**
     *  Merge each duplicate group within `distance` metres into one survivor location, unioning
     *  tags and extra fields. One undoable edit.
     */
    storeMergeDuplicates: (distance: number) => Promise<MutationResult>;
    /**
     *  Thin duplicates among `ids` within `distance` metres, keeping the best location per
     *  cluster. Informational locations are never pruned. One undoable edit.
     */
    storePruneDuplicates: (ids: number[], distance: number, keepTagIds: number[]) => Promise<MutationResult>;
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
    /**  Export locations as a `{name, customCoordinates}` JSON file, including tags and field defs. */
    storeExportJson: (opts: ExportOpts) => Promise<string>;
    /**  Export locations as a minimal lat/lng CSV file. */
    storeExportCsv: (scope: number[] | null) => Promise<string>;
    /**
     *  Export locations as a GeoJSON FeatureCollection of Point features.
     *  Each feature carries its tag names in `properties.tags`.
     */
    storeExportGeojson: (scope: number[] | null, tagsJson: string) => Promise<string>;
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
    /**  Cancel an in-flight vali generate or download. */
    valiCancel: () => Promise<void>;
    /**  Subdivision weights for a country (JSON text, same shape as `vali subdivisions`). */
    valiSubdivisions: (country: string) => Promise<string>;
};
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
/**
 *  A swap-removal from a render cell. JS must move the last element into `cell_index`
 *  and pop the array to mirror the Rust-side swap-remove.
 */
type CellRemoval = {
    cell: string;
    cellIndex: number;
    id: number;
};
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
    /**  When `Some`, restricts export to these location IDs (e.g. current selection). */
    scope: number[] | null;
    mapName: string;
    /**
     *  Serialized `{id: {name, color}}` tag definitions from the store, used to
     *  convert numeric tag IDs back to human-readable names in the output.
     */
    tagsJson: string;
    extraFieldsJson: string | null;
};
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
    /**  Alternate Street View providers (Apple Look Around, …). */
    providers: ProvidersSettings;
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
    id: string;
    name: string;
    description: string;
    icon: string;
    main: string;
    version: string;
    experimental: boolean;
    sidecar: PluginSidecar_Deserialize | null;
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
    /**  `None` = drawn by the base layer, `Some(rgb)` = drawn by the selection overlay. */
    sel: [number, number, number] | null;
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
    sel: [number, number, number] | null;
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
 *  JSON-text columns; `source_props` is the originating `SelectionProps` (opaque here).
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
/**  Result of `store_save_dirty`: bytes written to the delta sidecar (0 = skipped). */
type SaveResult = {
    savedBytes: number;
};
/**
 *  Which locations to operate on: the whole map or the current selection. Resolved in Rust
 *  against the maintained selection set.
 */
type Scope = {
    kind: "all";
} | {
    kind: "selected";
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
 *  A named, colored selection. `key` is deterministic (e.g., `"tag:5"`, `"polygon:abc"`)
 *  so JS can diff selections across syncs. `color` is the RGB overlay color.
 */
type Selection = {
    key: string;
    color: [number, number, number];
    props: SelectionProps;
};
/**  Input for `store_sync_selections`: selection criteria + display color. */
type SelectionInput = {
    /**  Deterministic selection key (e.g. `"tag:5"`), used to return per-node counts back keyed. */
    key: string;
    props: SelectionProps;
    color: [number, number, number];
    /**  Counted, but kept out of the overlay and the selected set. */
    ghosted?: boolean;
};
/**
 *  Discriminated union of all selection types. Serialized with `{ "type": "..." }` tag
 *  for JS interop. Simple types (Tag, Untagged, PanoIds, etc.) resolve in O(N) with
 *   parallel batch scans. Composites (Intersection, Union, Invert) recursively resolve
 *  children. Duplicates uses a grid-accelerated spatial scan.
 */
type SelectionProps = {
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
} | {
    type: "TopK";
    field: string;
    k: number;
    ascending: boolean;
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
type SideCounts = {
    create: number;
    update: number;
    delete: number;
};
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
/**
 *  Per-map config for a virtual tag-tree node — a folder node with no underlying
 *  tag (e.g. "a" when only "a/b" and "a/c" exist). Keyed by the node's full slash
 *  path in `MapSettings::virtual_tags`. Tree-view only; never creates a real tag.
 */
type VirtualTag = {
    color?: string | null;
};

export type LatLng = google.maps.LatLngLiteral;
export type Bounds = google.maps.LatLngBoundsLiteral;
/** Panorama source type from Google's internal metadata. */
declare const enum PanoType {
    Official = 2,
    Unknown = 3,
    UserUploaded = 10
}
/** A location you already hold in full, or just its id to fetch on demand.
 *  Lets the pick -> activate path carry "materialized or not" as plain data;
 *  `resolveLocation` (in the store) fetches only the id case. */
export type MaybeLocation = Location | number;
/** Build a Location from lat/lng plus overrides. `id` stays 0 until `addLocations`
 *  writes the real id back into the object. */
declare function createLocation(partial: Partial<Location> & LatLng): Location;
export type TagSortMode = "default" | "name" | "amount";
export type WorkArea = "overview" | "location" | "duplicates" | "import" | "plugin" | "providers" | "diff";
/** Hex like "#1098ad"; legacy stored prefs may hold an Open Props ramp name. */
export type SvColor = string;
export type MapTypeKey = "map" | "satellite" | "osm" | "vector";
export type SvCoverageType = "official" | "unofficial" | "default";
export type SvThickness = "default" | "high";
export type MarkerStyle = "pin" | "circle" | "arrow";

/**
 * Pure planning logic for bulk metadata-field operations (rename / merge / delete / set).
 * These compute `extra` merge patches (RFC 7386: null deletes a key) and selection-reference
 * rewrites; the store orchestrates IPC, definitions, and persistence. Side-effect-free.
 */

/** When a move target already holds a value, which field's value survives. */
export type MergeWinner = "from" | "to";

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

/** Pure selection transforms. These only manipulate the JS selection tree; Rust resolves the actual bitmasks. */

/** Variants that wrap children — derived as exactly those carrying a `selections` array. */
export type CompositeType = Extract<SelectionProps, {
    selections: Selection[];
}>["type"];
/** Composite variants that wrap exactly one child (operators, not bags). They never collapse — a
 *  one-child group is degenerate, but one child is a unary node's only valid arity. */
export type UnaryType = "Invert";
/** Composite variants that are flat n-ary groups. */
export type GroupType = Exclude<CompositeType, UnaryType>;
declare enum ValidationState {
    Ok = 0,
    UpdateAvailable = 1,
    UpdateApplied = 2,
    NotFound = 3,
    PanoIdBroke = 4,
    Unofficial = 5,
    GoodcamAvailable = 6
}

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
/** Fetch every location in the map. */
declare function fetchAllLocations(): Promise<Location[]>;
/** Fetch one location by id, or null if it doesn't exist. */
declare function fetchLocation(id: number): Promise<Location | null>;
/** Fetch locations by id (missing ids are skipped). Prefer this over per-id fetches. */
declare function fetchLocationsByIds(ids: number[]): Promise<Location[]>;
/** Active (non-ghosted) selections, the default for any operational logic. */
declare const getActiveSelections: () => Selection[];
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
/** Toggle a selection's ghosted state and re-sync (excludes/includes it from the overlay). */
declare function toggleGhostSelection(key: string): Promise<void>;
/** "Solo" a selection: ghost every other top-level selection, keep this one visible.
 *  If it is already the only visible one, un-ghost everything (toggle back). */
declare function isolateSelection(key: string): Promise<void>;
/** Ghost every top-level selection; if all are already ghosted, un-ghost them all. */
declare function toggleGhostAllSelections(): Promise<void>;
/** Add selections to the sidebar and highlight their locations. Same-key selections replace. */
declare function addSelections(props: SelectionProps[]): Promise<void>;
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
 *  No-op when nothing is selected. Returns the number of ids actually picked. */
declare function selectRandomFromSelection(count: number): number;
/** Replace the current selection with a single Manual selection of ids picked from the
 *  current selection, spaced apart in Rust: either `count` ids maximizing spacing, or as
 *  many as fit at `minDistanceM`. No-op when the pick returns nothing. */
declare function selectSpacedFromSelection(opts: {
    count?: number;
    minDistanceM?: number;
}): Promise<{
    picked: number;
    distanceM: number;
}>;
/** Read-only preview of transitive duplicate groups (size >= 2) within `distance` metres. */
declare function previewDuplicateGroups(distance: number): Promise<number[][]>;
/** Merge each transitive duplicate group into one survivor (tags unioned). One undoable edit. */
declare function mergeDuplicates(distance: number): Promise<void>;
/**
 * Prune duplicates within a resolved selection: keeps the most relevant location per
 * cluster (<= 25m) or thins to enforce spacing (> 25m). Locations tagged "keep pano"
 * get a +5 score bonus. Returns the number pruned.
 */
declare function pruneDuplicates(props: SelectionProps, distance: number): Promise<number>;
/** Edit an existing filter (or any selection) in place by key, preserving its
 *  position inside any AND/OR/Invert composite. Carries ghost state to the new key. */
declare function updateFilterSelection(oldKey: string, props: SelectionProps): Promise<void>;
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
declare function toggleProvidersMode(): void;
declare function exitProvidersMode(): void;
/** Open a plugin's sidebar (switches the editor pane to "plugin"). */
declare function setPluginMode(pluginId: string): void;
/** Close the plugin sidebar and return to the overview. */
declare function exitPluginMode(): void;
/** Get-or-create tags by name. Returns the tag objects for use
 *  in subsequent location updates. Idempotent — existing tags are returned
 *  as-is, new names get auto-generated colors.
 *
 *  Pass `locationIds` to assign the tags in the same mutation. Prefer that over a follow-up
 *  `addTagToLocations`: it is one round trip instead of three, and the tag never renders at
 *  count 0 in between. */
declare function createTags(names: string[], locationIds?: number[]): Promise<Tag[]>;
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
declare const store_cancelAutosave: typeof cancelAutosave;
declare const store_checkoutCommit: typeof checkoutCommit;
declare const store_closeDuplicates: typeof closeDuplicates;
declare const store_commitMap: typeof commitMap;
declare const store_composeSelections: typeof composeSelections;
declare const store_createTags: typeof createTags;
declare const store_decomposeChild: typeof decomposeChild;
declare const store_deleteField: typeof deleteField;
declare const store_deleteTags: typeof deleteTags;
declare const store_discardOpenMap: typeof discardOpenMap;
declare const store_duplicateLocation: typeof duplicateLocation;
declare const store_emitBitmask: typeof emitBitmask;
declare const store_exitPluginMode: typeof exitPluginMode;
declare const store_exitProvidersMode: typeof exitProvidersMode;
declare const store_fetchAllLocations: typeof fetchAllLocations;
declare const store_fetchLocation: typeof fetchLocation;
declare const store_fetchLocationsByIds: typeof fetchLocationsByIds;
declare const store_flushSave: typeof flushSave;
declare const store_getActiveSelections: typeof getActiveSelections;
declare const store_getMapState: typeof getMapState;
declare const store_getSelectedTagIds: typeof getSelectedTagIds;
declare const store_getTag: typeof getTag;
declare const store_getVisibleTags: typeof getVisibleTags;
declare const store_initStore: typeof initStore;
declare const store_isolateSelection: typeof isolateSelection;
declare const store_mapOpen: typeof mapOpen;
declare const store_mergeDuplicates: typeof mergeDuplicates;
declare const store_mutate: typeof mutate;
declare const store_openDuplicateLocation: typeof openDuplicateLocation;
declare const store_openStagedLocation: typeof openStagedLocation;
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
declare const store_resolveLocation: typeof resolveLocation;
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
  export { store_addLocations as addLocations, store_addSelections as addSelections, store_addTagToLocations as addTagToLocations, store_cancelAutosave as cancelAutosave, store_checkoutCommit as checkoutCommit, store_closeDuplicates as closeDuplicates, closeMap$1 as closeMap, store_commitMap as commitMap, store_composeSelections as composeSelections, store_createTags as createTags, store_decomposeChild as decomposeChild, store_deleteField as deleteField, store_deleteTags as deleteTags, store_discardOpenMap as discardOpenMap, store_duplicateLocation as duplicateLocation, store_emitBitmask as emitBitmask, store_exitPluginMode as exitPluginMode, store_exitProvidersMode as exitProvidersMode, store_fetchAllLocations as fetchAllLocations, store_fetchLocation as fetchLocation, store_fetchLocationsByIds as fetchLocationsByIds, store_flushSave as flushSave, store_getActiveSelections as getActiveSelections, store_getMapState as getMapState, store_getSelectedTagIds as getSelectedTagIds, store_getTag as getTag, store_getVisibleTags as getVisibleTags, store_initStore as initStore, store_isolateSelection as isolateSelection, store_mapOpen as mapOpen, store_mergeDuplicates as mergeDuplicates, store_mutate as mutate, store_openDuplicateLocation as openDuplicateLocation, openMap$1 as openMap, store_openStagedLocation as openStagedLocation, store_previewDuplicateGroups as previewDuplicateGroups, store_previewVirtualLocation as previewVirtualLocation, store_pruneDuplicates as pruneDuplicates, store_redo as redo, store_removeChildFromSelection as removeChildFromSelection, store_removeDuplicate as removeDuplicate, store_removeLocations as removeLocations, store_removeSelections as removeSelections, store_removeTagFromAllLocations as removeTagFromAllLocations, store_removeTagFromLocations as removeTagFromLocations, store_renameField as renameField, store_renameMap as renameMap, store_reorderSelection as reorderSelection, store_reorderTags as reorderTags, store_resetSelections as resetSelections, store_resolveLocation as resolveLocation, store_scheduleAutoCommit as scheduleAutoCommit, store_scheduleSave as scheduleSave, store_selectIntersection as selectIntersection, store_selectInverse as selectInverse, store_selectRandomFromSelection as selectRandomFromSelection, store_selectSpacedFromSelection as selectSpacedFromSelection, store_selectUnion as selectUnion, store_setActiveLocation as setActiveLocation, store_setMapExtraFields as setMapExtraFields, store_setPluginMode as setPluginMode, store_setPolygonName as setPolygonName, store_setSelectedLocationIds as setSelectedLocationIds, store_setSelectionColors as setSelectionColors, store_setWorkArea as setWorkArea, store_toggleGhostAllSelections as toggleGhostAllSelections, store_toggleGhostSelection as toggleGhostSelection, store_toggleManualSelection as toggleManualSelection, store_toggleProvidersMode as toggleProvidersMode, store_toggleTagSelections as toggleTagSelections, store_undo as undo, store_updateFilterSelection as updateFilterSelection, store_updateLocations as updateLocations, store_updateMapLabels as updateMapLabels, store_updateMapMeta as updateMapMeta, store_updateTags as updateTags, store_useMapState as useMapState, store_waitForInflightPersist as waitForInflightPersist };
  export type { store_MapState as MapState };
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
        label: string;
        icon: string;
        group: "Map";
        defaultBinding: string;
        aliases: string[];
        execute: () => Promise<string>;
        enabled: () => boolean;
    };
    import: {
        label: string;
        icon: string;
        group: "Map";
        execute: () => void;
        enabled: typeof requiresMap;
    };
    copyToMap: {
        label: string;
        icon: string;
        group: "Map";
        execute: () => void;
        enabled: typeof requiresMap;
    };
    quickCopyToMap: {
        label: string;
        icon: string;
        group: "Map";
        execute: () => void;
        enabled: typeof hasActiveLocation;
    };
    undo: {
        label: string;
        icon: string;
        group: "Map";
        defaultBinding: string;
        execute: typeof undo;
        enabled: () => boolean;
    };
    redo: {
        label: string;
        icon: string;
        group: "Map";
        defaultBinding: string;
        execute: typeof redo;
        enabled: () => boolean;
    };
    export: {
        label: string;
        icon: string;
        group: "Map";
        execute: () => void;
        enabled: typeof requiresMap;
    };
    "open-history": {
        label: string;
        icon: string;
        group: "Map";
        execute: () => void;
        enabled: typeof requiresMap;
    };
    "open-seen": {
        label: string;
        icon: string;
        group: "Map";
        execute: () => void;
        enabled: typeof requiresMap;
    };
    "toggle-seen-overlay": {
        label: string;
        icon: string;
        group: "Map";
        execute: () => void;
        enabled: typeof requiresMap;
    };
    selectAll: {
        label: string;
        icon: string;
        group: "Selections";
        defaultBinding: string;
        execute: () => Promise<void>;
    };
    "select-untagged": {
        label: string;
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => Promise<void>;
    };
    "select-unpanned": {
        label: string;
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
    };
    "select-panoid": {
        label: string;
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
    };
    "select-no-panoid": {
        label: string;
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
    };
    "select-uncommitted": {
        label: string;
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
    };
    "select-reviewed": {
        label: string;
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
        enabled: typeof requiresMap;
    };
    "invert-selection": {
        label: string;
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
    };
    "intersect-selections": {
        label: string;
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
    };
    "union-selections": {
        label: string;
        icon: string;
        group: "Selections";
        execute: () => Promise<void>;
    };
    "load-geojson": {
        label: string;
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: typeof loadGeoJSON;
    };
    "download-polygon-geojson": {
        label: string;
        icon: string;
        group: "Selections";
        enabled: () => boolean;
        execute: () => void;
    };
    deselectAll: {
        label: string;
        icon: string;
        group: "Selections";
        defaultBinding: string;
        execute: typeof resetSelections;
        enabled: typeof hasAnySelections;
    };
    "expand-sv-links": {
        label: string;
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => void;
        enabled: () => boolean;
    };
    "find-duplicates": {
        label: string;
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => void;
    };
    "merge-duplicates": {
        label: string;
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => void;
    };
    "filter-by-metadata": {
        label: string;
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => void;
    };
    "top-k": {
        label: string;
        icon: string;
        group: "Selections";
        execute: () => void;
    };
    "review-selected": {
        label: string;
        icon: string;
        group: "Selections";
        enabled: typeof hasSelection;
        execute: () => void;
    };
    "review-sessions": {
        label: string;
        icon: string;
        group: "Selections";
        execute: () => void;
    };
    "select-random": {
        label: string;
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => void;
        enabled: typeof hasSelection;
    };
    "select-spaced": {
        label: string;
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => void;
        enabled: typeof hasSelection;
    };
    "ghost-selections": {
        label: string;
        icon: string;
        group: "Selections";
        aliases: string[];
        execute: () => Promise<void>;
        enabled: typeof hasAnySelections;
    };
    "save-selections": {
        label: string;
        icon: string;
        group: "Selections";
        execute: () => void;
        enabled: typeof hasAnySelections;
    };
    "apply-saved-selection": {
        label: string;
        icon: string;
        group: "Selections";
        execute: () => void;
    };
    "selection-delete-locations": {
        label: string;
        icon: string;
        group: "Selections";
        enabled: typeof hasSelection;
        execute: () => void;
    };
    "bulk-validate": {
        label: string;
        icon: string;
        group: "Bulk Operations";
        aliases: string[];
        execute: () => void;
    };
    "bulk-enrich": {
        label: string;
        icon: string;
        group: "Bulk Operations";
        aliases: string[];
        execute: () => void;
    };
    "bulk-set-field": {
        label: string;
        icon: string;
        group: "Bulk Operations";
        aliases: string[];
        execute: () => void;
    };
    "bulk-clear-fields": {
        label: string;
        icon: string;
        group: "Bulk Operations";
        aliases: string[];
        execute: () => void;
    };
    "bulk-pin-pano": {
        label: string;
        icon: string;
        group: "Bulk Operations";
        aliases: string[];
        execute: () => void;
    };
    "bulk-heading-road": {
        label: string;
        icon: string;
        group: "Bulk Operations";
        aliases: string[];
        execute: () => void;
    };
    "bulk-download-panoramas": {
        label: string;
        icon: string;
        group: "Bulk Operations";
        aliases: string[];
        execute: () => void;
    };
    "delete-selected-tags": {
        label: string;
        icon: string;
        group: "Tags";
        execute: () => Promise<void>;
        enabled: () => boolean;
    };
    "tag-download-csv": {
        label: string;
        icon: string;
        group: "Tags";
        execute: () => void;
    };
    "tag-find-replace": {
        label: string;
        icon: string;
        group: "Tags";
        aliases: string[];
        execute: () => void;
        enabled: typeof requiresMap;
    };
    "apply-field-as-tags": {
        label: string;
        icon: string;
        group: "Tags";
        aliases: string[];
        execute: () => void;
        enabled: typeof requiresMap;
    };
    "assign-doclinks": {
        label: string;
        icon: string;
        group: "Tags";
        aliases: string[];
        execute: () => void;
        enabled: typeof requiresMap;
    };
};
export type CommandId = keyof typeof COMMANDS;
export type PinnedEntry = CommandId | "---" | (string & {});

export interface SavedSelectionItem {
    props: SavedSelectionProps;
    color: [number, number, number];
}
export interface SavedSelection {
    id: string;
    name: string;
    items: SavedSelectionItem[];
    createdAt: number;
}
export type SavedSelectionProps = {
    type: "Everything";
} | {
    type: "Polygon";
    polygon: PolygonGeometry;
    includeInformational: boolean;
} | {
    type: "TagName";
    tagName: string;
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
    type: "Duplicates";
    distance: number;
} | {
    type: "Filter";
    field: string;
    op: FilterOp;
    value: unknown;
    value2?: unknown;
} | {
    type: "TopK";
    field: string;
    k: number;
    ascending: boolean;
} | {
    type: "Intersection";
    selections: SavedSelectionProps[];
} | {
    type: "Union";
    selections: SavedSelectionProps[];
} | {
    type: "Invert";
    selections: SavedSelectionProps[];
};
/** Resolve a saved rule against the open map, or null when it no longer applies
 *  (e.g. the tag name doesn't exist here). */
declare function savedToSelectionProps(saved: SavedSelectionProps): SelectionProps | null;
/** Short human-readable description of a saved-selection rule. */
declare function describeRule(props: SavedSelectionProps): string;
/** All saved selection rules (global, name-based; shared across maps). */
declare function getSavedSelections(): SavedSelection[];

export type RGB = {
    r: number;
    g: number;
    b: number;
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
    readonly medium: "High (~10MB)";
    readonly heavy: "Ultra (~46MB)";
};
declare const SUBDIVISION_DETAILS: {
    readonly off: "Off";
    readonly adm1: "States / provinces";
};
declare const PREVIEW_ASPECT_RATIOS: {
    readonly "4 / 3": "4:3";
    readonly "16 / 10": "16:10";
    readonly "16 / 9": "16:9";
    readonly "21 / 9": "21:9";
    readonly "32 / 9": "32:9";
    readonly free: "Free";
};
export type MovementMode = keyof typeof MOVEMENT_MODES;
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
    showPanoMetadata: boolean;
    exactDateFormat: ExactDateFormat;
    dateTimezone: DateTimezone;
    showNavArrow: boolean;
    showGroundArrow: boolean;
    hidePanoUI: boolean;
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
    /** Reopen the maps that were open when the session last ended (main window closed). */
    restoreSession: boolean;
    /** Discord Rich Presence: off, generic (no map name), or full (map name + count). */
    discordPresence: DiscordPresenceMode;
    /** Per-label color overrides (hex), keyed by lowercased label name. Shared across all maps. */
    labelColors: Record<string, string>;
    geocodeProvider: GeocodeProvider;
    nominatimApiKey: string;
    panToImported: boolean;
    /** Min half-extent (degrees) a single pasted/imported point is padded to before fitBounds */
    pastePadding: number;
    followActiveInReview: boolean;
    markerColor: RGB;
    activeLocationColor: RGB;
    importPreviewColor: RGB;
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
    /** Tree view only: render each tag as the shortest path suffix that's still unique. */
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
    savedSelections: SavedSelection[];
    /** Local REST transport for window.MMA (Settings > Advanced). */
    remoteApi: boolean;
    remoteApiKey: string;
    pinnedCommands: PinnedEntry[];
    hasSeenWelcome: boolean;
    /** UI language (`en`, `zh-Hans`, …). Catalogs live under `src/locales/`. */
    language: AppLocale;
};
export type AppSettings = typeof DEFAULTS;
declare function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;

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

/** The user-facing "which locations" concept: Rust's mechanical Scope widened with
 *  saved selections, which resolve to ids in JS (Rust never sees saved definitions). */
export type SourceScope = Scope | {
    kind: "saved";
    id: string;
};
export interface ScopeController<S extends SourceScope = Scope> {
    scope: S;
    setScope(s: S): void;
    allCount: number;
    selectionCount: number;
    /** Opt-in: ScopeSelector offers saved selections. Only for consumers that
     *  narrow via resolveScopeIds rather than passing the scope to Rust. */
    saved?: boolean;
}
/** Narrow a materialized pool of id-bearing records to the scope's subset (JS-side). */
declare function applyScope(scope: Scope, pool: Location[]): Location[];
/** The id-set a scope narrows to, or null for "all". Saved scopes resolve in Rust. */
declare function resolveScopeIds(scope: SourceScope): Promise<{
    has(id: number): boolean;
    size: number;
} | null>;
/** Group the scoped location set by a derived key - entirely in Rust, no locations fetched.
 *  Numeric bins arrive in bound order; projection keys are sorted naturally for display. */
declare function partition(field: string, key: KeySpec, scope: Scope): Promise<PartitionBucket[]>;
/** Reactive scope state + live counts, owned by the calling React component. Defaults to
 *  the current selection when one exists at mount, else all locations. Use this for plugins
 *  whose scope lives entirely in a React sidebar; reach for `createScope` when an imperative
 *  renderer (e.g. a deck.gl overlay) outside React also needs to read the scope. */
declare function useScope(initial?: Scope): ScopeController;
/** A per-consumer scope store that lives outside React, so an imperative renderer can read it
 *  synchronously and subscribe to changes while a React sidebar drives it via `use()`. Mirrors
 *  the module-store + hook idiom (cf. settings). Isolated per call - one consumer's choice never
 *  leaks into another's. */
export interface ScopeHandle {
    get(): Scope;
    set(scope: Scope): void;
    subscribe(listener: () => void): () => void;
    /** React view of this handle: re-renders on change, with live counts. */
    use(): ScopeController;
}
/** A standalone "all locations vs current selection" switch, for features that operate on a subset. */
declare function createScope(initial?: Scope): ScopeHandle;

export type scope_ScopeController<S extends SourceScope = Scope> = ScopeController<S>;
export type scope_ScopeHandle = ScopeHandle;
export type scope_SourceScope = SourceScope;
declare const scope_applyScope: typeof applyScope;
declare const scope_createScope: typeof createScope;
declare const scope_partition: typeof partition;
declare const scope_resolveScopeIds: typeof resolveScopeIds;
declare const scope_useScope: typeof useScope;
declare namespace scope {
  export { scope_applyScope as applyScope, scope_createScope as createScope, scope_partition as partition, scope_resolveScopeIds as resolveScopeIds, scope_useScope as useScope };
  export type { scope_ScopeController as ScopeController, scope_ScopeHandle as ScopeHandle, scope_SourceScope as SourceScope };
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
 *  refreshProjection's props so the key and color match an in-progress projection. */
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

export type Cmd = typeof commands;

/** Standard right-hand sidebar chrome (title, back button, scrollable body). Use for plugin sidebars. */
declare function Sidebar({ title, onBack, actions, className, flush, children, }: {
    title: ReactNode;
    onBack?: () => void;
    actions?: ReactNode;
    className?: string;
    flush?: boolean;
    children: ReactNode;
}): react_jsx_runtime.JSX.Element;
/** Collapsible titled section inside a Sidebar. */
declare function Section({ title, defaultOpen, collapsible, addons, children, }: {
    title: ReactNode;
    defaultOpen?: boolean;
    collapsible?: boolean;
    addons?: ReactNode;
    children: ReactNode;
}): react_jsx_runtime.JSX.Element;
/** Labelled form row (label left, control right) for sidebar sections. */
declare function Field({ label, hint, row, children, }: {
    label: ReactNode;
    hint?: ReactNode;
    row?: boolean;
    children: ReactNode;
}): react_jsx_runtime.JSX.Element;
/** Centered icon + message for empty panels. */
declare function EmptyState({ icon, children }: {
    icon?: string;
    children: ReactNode;
}): react_jsx_runtime.JSX.Element;
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
}): react_jsx_runtime.JSX.Element;

declare function ScopeSelector({ ctl, className, }: {
    ctl: ScopeController<SourceScope>;
    className?: string;
}): react_jsx_runtime.JSX.Element;

declare function toast(message: string, duration?: number, container?: HTMLElement): void;

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

export interface EnrichFieldOption {
    key: string;
    label: string;
    /** Excluded from the default field set (null enrichFields); user must opt in. */
    defaultOff?: boolean;
}
/** Offer extra fields in the enrichment UI. Unregistered when the plugin deactivates. */
declare function registerEnrichFields(fields: EnrichFieldOption[]): void;
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
    enrich(locations: Location[], enrichFields: string[] | null, ctx?: EnrichCtx): Promise<Map<number, Record<string, unknown>>>;
    fieldDefs: Record<string, ExtraFieldDef>;
    /** Fields this provider reads: schedules it into a later dependency wave than any
     *  provider producing them (core-written fields like imageDate precede wave 1). */
    requires?: string[];
    /** Progress units this provider would contribute in bulk (absent = instant). */
    units?(locations: Location[], enrichFields: string[] | null, force?: boolean): number;
    /** Transform a raw partition value per-location. Return null to skip. */
    transform?(field: string, value: string, location: Location): string | null;
}
/** Register a provider that computes extra fields during enrichment (e.g. sun position).
 *  Unregistered when the plugin deactivates. */
declare function registerEnrichmentProvider(provider: EnrichmentProvider): void;

/** Look up metadata for a single field key. Returns `undefined` if no metadata exists. */
declare function getFieldDef(key: string): ExtraFieldDef | undefined;
/** Merged view of all field definitions across all layers. */
declare function getAllFieldDefs(): Record<string, ExtraFieldDef>;

export interface SelectionBitmaskPayload {
    selColors: [number, number, number][];
    cellEntries: SelCellEntry[];
    setIds: (ids: SelectedIds) => void;
}
declare const EVENT_DEFS: {
    "location:add": Location[];
    "location:remove": number[];
    "location:update": Update<LocationPatch_Deserialize>[];
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
    "settings:changed": void;
    "locale:changed": void;
    "fullscreen:changed": void;
    "plugins:changed": void;
    "hotkeys:changed": void;
    "toasts:changed": void;
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

/** Fetch a page of the seen (visited-panorama) history. */
declare function getSeenEntries(limit?: number, offset?: number, filter?: SeenFilter, thumbnails?: boolean): Promise<SeenEntry[]>;
/** Number of seen entries matching the filter (all when omitted). */
declare function getSeenCount(filter?: SeenFilter): Promise<number>;
/** Delete the entire seen history. Not undoable. */
declare function clearSeen(): Promise<void>;

/** Open a seen entry's panorama in the Street View viewer. */
declare function loadSeenPano(entry: SeenEntry): Promise<void>;

/** True when the location is missing any of the given enrich fields (default: the enabled set). */
declare function needsEnrichment(loc: Location, enrichFields?: string[]): boolean;
/** One summary row per pass that did work: the core metadata pass, then every
 *  provider that updated or failed at least one location. */
export interface EnrichOutcome {
    id: string;
    label: string;
    success: number[];
    failed: number[];
}
export type EnrichResult = EnrichOutcome[];
/** Bulk enrich: selector over the resolver engine. Runs `enrichMeta`, then the
 *  enrichment providers (exact date among them) in dependency waves. */
declare function enrichAll(locations: Location[], opts?: {
    signal?: AbortSignal;
    force?: boolean;
    onProgress?: (done: number, total: number, label?: string) => void;
}): Promise<EnrichResult>;

/** Pin each location to a resolved panorama (sets `panoId`), so it always loads the same pano. */
declare function bulkPinToPano(locations: Location[], opts?: {
    signal?: AbortSignal;
    force?: boolean;
    useLatest?: boolean;
    onProgress?: (done: number, total: number) => void;
}): Promise<number>;

export interface ValidationProgress {
    progress: number;
    results: Map<ValidationState, Location[]>;
}
/** Check that each location's Street View coverage still exists; returns locations grouped
 *  by validation state. */
declare function validateLocations(locations: Location[], opts?: {
    signal?: AbortSignal;
    onProgress?: (p: ValidationProgress) => void;
}): Promise<Map<ValidationState, Location[]>>;

/** Fetch full pano metadata directly from Google's internal RPC (bypasses StreetViewService). */
declare function fetchSvMetadata(panoIds: string[]): Promise<(google.maps.StreetViewResolvedPanoramaData | null)[]>;

/** URL that serves a local file over the `mma-buf://` protocol (binary Rust-to-JS transfers). */
declare function mmaBufUrl(path: string): string;

export interface MapEmbedPrefs {
    svOpacity: number;
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
    markerSize: number;
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
    useBlobby: boolean;
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

/**
 * This refers to the main editor map only.
 */
declare function getMapHost(): MapHost | null;
/**
 * Wait for the main editor map to be ready.
 */
declare function waitForMapHost(): Promise<MapHost>;

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
declare const legacy_waitForGoogleMap: typeof waitForGoogleMap;
declare namespace legacy {
  export {
    legacy_getActiveLocation as getActiveLocation,
    legacy_getAllSelections as getAllSelections,
    legacy_getCurrentMap as getCurrentMap,
    legacy_getCurrentMapId as getCurrentMapId,
    legacy_getDirtyCount as getDirtyCount,
    legacy_getGhostedSelections as getGhostedSelections,
    legacy_getGoogleMap as getGoogleMap,
    legacy_getKnownFieldKeys as getKnownFieldKeys,
    legacy_getSelectedLocationIds as getSelectedLocationIds,
    legacy_getSelections as getSelections,
    legacy_getTagCounts as getTagCounts,
    legacy_getWorkArea as getWorkArea,
    legacy_waitForGoogleMap as waitForGoogleMap,
  };
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

export interface LocationStore {
    locations: Map<number, Location>;
    /** The materialized locations narrowed to a scope (defaults to all). */
    get(scope?: Scope): Location[];
    onChange(cb: () => void): () => void;
    destroy(): void;
}
/** A live id-to-Location map of the whole map, kept in sync via store events.
 *  Call `destroy()` when done. */
declare function createLocationStore(): Promise<LocationStore>;
/** A running sidecar process. Callbacks fire per line; listeners self-remove on exit. */
export interface SidecarRun {
    runId: number;
    onLine(cb: (line: string) => void): void;
    onStderr(cb: (line: string) => void): void;
    onExit(cb: (code: number | null) => void): void;
    kill(): void;
}
/** Run an installed plugin's sidecar binary. Register onLine/onExit right after this
 *  resolves -- listeners attach before the process starts, so no output is missed. */
declare function spawnSidecar(pluginId: string, name: string, args: string[]): Promise<SidecarRun>;
/** Explicitly exposed functions not in other APIs. */
declare const surface: {
    ready: boolean;
    cmd: Cmd;
    invoke: typeof invoke;
    shell: {
        Command: typeof Command;
    };
    dialog: {
        open: typeof open;
        save: typeof save;
    };
    sidecar: {
        installedVersion: (pluginId: string) => Promise<string | null>;
        spawn: typeof spawnSidecar;
    };
    registerPlugin: typeof registerPlugin;
    registerEnrichFields: typeof registerEnrichFields;
    registerEnrichmentProvider: typeof registerEnrichmentProvider;
    preloadModules: typeof preloadModules;
    getAvailableExternals: typeof getAvailableExternals;
    createLocationStore: typeof createLocationStore;
    ui: {
        Sidebar: typeof Sidebar;
        Section: typeof Section;
        Field: typeof Field;
        EmptyState: typeof EmptyState;
        SegmentedControl: typeof SegmentedControl;
        ScopeSelector: typeof ScopeSelector;
    };
    toast: typeof toast;
    storage: typeof createPluginStorage;
    usePluginState: typeof usePluginState;
    getFieldDef: typeof getFieldDef;
    getAllFieldDefs: typeof getAllFieldDefs;
    createLocation: typeof createLocation;
    getMapHost: typeof getMapHost;
    waitForMapHost: typeof waitForMapHost;
    setSetting: typeof setSetting;
    getSettings: () => {
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
        showPanoMetadata: boolean;
        exactDateFormat: ExactDateFormat;
        dateTimezone: DateTimezone;
        showNavArrow: boolean;
        showGroundArrow: boolean;
        hidePanoUI: boolean;
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
        restoreSession: boolean;
        discordPresence: DiscordPresenceMode;
        labelColors: Record<string, string>;
        geocodeProvider: GeocodeProvider;
        nominatimApiKey: string;
        panToImported: boolean;
        pastePadding: number;
        followActiveInReview: boolean;
        markerColor: RGB;
        activeLocationColor: RGB;
        importPreviewColor: RGB;
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
        savedSelections: SavedSelection[];
        remoteApi: boolean;
        remoteApiKey: string;
        pinnedCommands: PinnedEntry[];
        hasSeenWelcome: boolean;
        language: AppLocale;
    };
    t: typeof t;
    tp: typeof tp;
    getLocale: typeof getLocale;
    LOCALES: {
        readonly en: "English";
        readonly "zh-Hans": "简体中文";
    };
    getSavedSelections: typeof getSavedSelections;
    savedToSelectionProps: typeof savedToSelectionProps;
    describeRule: typeof describeRule;
    on<E extends EditorEvent>(event: E, handler: EventHandler<E>): () => void;
    getSeenEntries: typeof getSeenEntries;
    getSeenCount: typeof getSeenCount;
    clearSeen: typeof clearSeen;
    loadSeenPano: typeof loadSeenPano;
    enrichAll: typeof enrichAll;
    bulkPinToPano: typeof bulkPinToPano;
    validateLocations: typeof validateLocations;
    needsEnrichment: typeof needsEnrichment;
    fetchSvMetadata: typeof fetchSvMetadata;
    mmaBufUrl: typeof mmaBufUrl;
    _test: typeof testApi;
};
export type StoreApi = typeof store;
export type ImportStagingApi = typeof importStaging;
export type CommitDiffApi = typeof commitDiff;
export type ScopeApi = typeof scope;
export type MapListApi = typeof mapList;
export type ReviewApi = typeof review;
export type SurfaceApi = typeof surface;
export type LegacyApi = typeof legacy;
export interface MMA extends StoreApi, ImportStagingApi, CommitDiffApi, ScopeApi, MapListApi, ReviewApi, SurfaceApi, LegacyApi {
}
declare global {
    interface Window {
        MMA: MMA;
    }
    const MMA: MMA;
}

export { MMA as MMAApi, PanoType, commands };
export type { AltBasemapSettings, AltBasemapSlot, AltProviderSettings, AltProviderSettings_Deserialize, CellRemoval, CommitDelta, CommitDiff, CommitInfo, ComparisonType, Conflict, ConflictKind, CopyToMapResult, DataLocation, DatePart, DbStats, DbTableInfo, EditorImportPreview, EditorImportResult, ExportOpts, ExtraFieldDef, ExtraFieldType, FieldCount, FilterOp, FirstSyncMode, GeoResult, GgUser, ImportPreviewEntry, ImportedMapInfo, KeySpec, Location, LocationPatch, LocationPatch_Deserialize, MapData, MapData_Deserialize, MapExtra, MapKeyAction, MapKeyBinding, MapMeta, MapMetaPatch, MapMetaPatch_Deserialize, MapMeta_Deserialize, MapSettings, MapSettings_Deserialize, MutationResult, NormalizedSyncLocation, NumericBinning, PartitionBucket, PluginManifest, PluginManifest_Deserialize, PluginSidecar, PluginSidecar_Deserialize, PolygonGeometry, PresenceActivity, ProvidersSettings, ProvidersSettings_Deserialize, PullCreate, PullUpdate, RemoteMappingRow, RenderDelta, RenderEntry, RenderPatchEntry, RenderRequest, ResolutionSide, ReviewCreate, ReviewSession, ReviewUpdate, SaveResult, Scope, ScoreBounds, SeenEntry, SeenFilter, SeenMapInfo, SeenWriteEntry, Selection, SelectionInput, SelectionProps, SelectionSync, SideCounts, SpacedPickResult, StoreStatus, SummaryResult, SyncPatch, SyncReconcileResult, Tag, TagPatch, Update, ValiLocation, ValiLocation_Deserialize, VirtualTag };
