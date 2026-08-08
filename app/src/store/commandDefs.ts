import {
	mdiUndo,
	mdiRedo,
	mdiFileImportOutline,
	mdiFileExportOutline,
	mdiContentSave,
	mdiSelectRemove,
	mdiSetCenter,
	mdiSetAll,
	mdiSelectInverse,
	mdiCodeJson,
	mdiFileDelimitedOutline,
	mdiCheckDecagram,
	mdiDatabaseArrowUp,
	mdiMapMarkerCheck,
	mdiHistory,
	mdiEye,
	mdiEyeOutline,
	mdiTagRemove,
	mdiTagMultipleOutline,
	mdiTrashCanOutline,
	mdiDatabaseRemoveOutline,
	mdiDatabaseEditOutline,
	mdiFindReplace,
	mdiGhostOutline,
	mdiCompassOutline,
	mdiDiceMultiple,
	mdiDotsGrid,
	mdiMapPlus,
	mdiMapMarkerPlus,
	mdiVectorPolygon,
	mdiMapSearchOutline,
	mdiFilterOutline,
	mdiPodium,
	mdiCallMerge,
	mdiPlayOutline,
	mdiBookmarkOutline,
	mdiBookmarkCheckOutline,
	mdiSelectAll,
	mdiTagOffOutline,
	mdiCompassOffOutline,
	mdiImageOutline,
	mdiImageOffOutline,
	mdiContentSaveAlertOutline,
	mdiEyeCheckOutline,
	mdiBookOpenOutline,
	mdiDownloadBoxOutline,
	mdiFileDocumentOutline,
	mdiGraphOutline,
	mdiClipboardTextOutline,
} from "@mdi/js";
import { registerCommand, type CommandDef } from "./commands";
import {
	undo,
	redo,
	addSelections,
	selectInverse,
	selectIntersection,
	selectUnion,
	resetSelections,
	commitMap,
	getMapState,
	deleteTags,
	getActiveSelections,
	removeLocations,
	toggleGhostAllSelections,
	getVisibleTags,
} from "./useMapStore";
import { hasCommitDiff } from "./commitDiff";
import { loadGeoJSON } from "@/lib/util/loadGeoJSON";
import { downloadBlob } from "@/lib/util/util";
import { toggleSeenOverlay } from "@/lib/seen/seenOverlay";
import { selectReviewedHistory } from "@/lib/review/review";
import { openDialog } from "./dialogBus";
import { isExpandingSvLinks, stopExpandSvLinks } from "@/lib/sv/expandLinks";
import { toast } from "@/lib/util/toast";
import { t } from "@/lib/i18n";

const requiresMap = () => getMapState().map !== null;
const hasActiveLocation = () => getMapState().activeLocation != null;
const hasSelection = () => getMapState().selectedLocationIds.size > 0;
const hasAnySelections = () => getMapState().selections.length > 0;
const openBulkOp = (op: string) => () => openDialog("bulk-op", op);
const openInlinePanel = (id: string) => () => openDialog("inline-panel", id);

/** Every editor command (palette entries; all are hotkey-bindable in Settings). */
const COMMANDS = {
	save: {
		label: "Commit map",
		icon: mdiContentSave,
		group: "Map",
		defaultBinding: "Mod+s",
		aliases: ["save", "snapshot"],
		execute: () => commitMap(),
		enabled: () => requiresMap() && hasCommitDiff(),
	},
	import: {
		label: "Import file",
		icon: mdiFileImportOutline,
		group: "Map",
		execute: () => openDialog("import"),
		enabled: requiresMap,
	},
	copyToMap: {
		label: "Copy location to map via hotkeys...",
		icon: mdiMapPlus,
		group: "Map",
		execute: () => openDialog("copy-to-map"),
		enabled: requiresMap,
	},
	quickCopyToMap: {
		label: "Copy location to map...",
		icon: mdiMapMarkerPlus,
		group: "Map",
		execute: () => {
			const id = getMapState().activeLocation?.id;
			if (id != null) openDialog("quick-copy-to-map", id);
		},
		enabled: hasActiveLocation,
	},
	undo: {
		label: "Undo",
		icon: mdiUndo,
		group: "Map",
		defaultBinding: "Mod+z",
		execute: undo,
		enabled: () => getMapState().canUndo,
	},
	redo: {
		label: "Redo",
		icon: mdiRedo,
		group: "Map",
		defaultBinding: "Mod+y, Mod+Shift+z",
		execute: redo,
		enabled: () => getMapState().canRedo,
	},
	export: {
		label: "Export",
		icon: mdiFileExportOutline,
		group: "Map",
		execute: () => openDialog("export"),
		enabled: requiresMap,
	},
	"open-history": {
		label: "Open version history",
		icon: mdiHistory,
		group: "Map",
		execute: () => openDialog("history"),
		enabled: requiresMap,
	},
	"open-seen": {
		label: "Open seen locations",
		icon: mdiEye,
		group: "Map",
		execute: () => openDialog("seen"),
		enabled: requiresMap,
	},
	"toggle-seen-overlay": {
		label: "Toggle seen locations overlay",
		icon: mdiEyeOutline,
		group: "Map",
		execute: () => toggleSeenOverlay(),
		enabled: requiresMap,
	},
	selectAll: {
		label: "Select everything",
		icon: mdiSelectAll,
		group: "Selections",
		defaultBinding: "Mod+a",
		execute: () => addSelections([{ type: "Everything" }]),
	},
	"select-untagged": {
		label: "Select untagged locations",
		icon: mdiTagOffOutline,
		group: "Selections",
		aliases: ["find untagged", "missing tags"],
		execute: () => addSelections([{ type: "Untagged" }]),
	},
	"select-unpanned": {
		label: "Select unpanned locations",
		icon: mdiCompassOffOutline,
		group: "Selections",
		execute: () => addSelections([{ type: "Unpanned" }]),
	},
	"select-panoid": {
		label: "Select Pano ID locations",
		icon: mdiImageOutline,
		group: "Selections",
		execute: () => addSelections([{ type: "PanoIds" }]),
	},
	"select-no-panoid": {
		label: "Select non-Pano ID locations",
		icon: mdiImageOffOutline,
		group: "Selections",
		execute: () => addSelections([{ type: "NotPanoIds" }]),
	},
	"select-uncommitted": {
		label: "Select uncommitted locations",
		icon: mdiContentSaveAlertOutline,
		group: "Selections",
		execute: () => addSelections([{ type: "Uncommitted" }]),
	},
	"select-reviewed": {
		label: "Select reviewed locations",
		icon: mdiEyeCheckOutline,
		group: "Selections",
		execute: () => selectReviewedHistory(),
		enabled: requiresMap,
	},
	"invert-selection": {
		label: "Invert selection",
		icon: mdiSelectInverse,
		group: "Selections",
		execute: () => selectInverse(),
	},
	"intersect-selections": {
		label: "Intersect (AND) selections",
		icon: mdiSetCenter,
		group: "Selections",
		execute: () => selectIntersection(),
	},
	"union-selections": {
		label: "Union (OR) selections",
		icon: mdiSetAll,
		group: "Selections",
		execute: () => selectUnion(),
	},
	"load-geojson": {
		label: "Load shapes from GeoJSON as selection",
		icon: mdiCodeJson,
		group: "Selections",
		aliases: ["import polygon", "load polygon"],
		execute: loadGeoJSON,
	},
	"download-polygon-geojson": {
		label: "Download polygon selections as GeoJSON",
		icon: mdiVectorPolygon,
		group: "Selections",
		enabled: () => getActiveSelections().some((s) => s.props.type === "Polygon"),
		execute: () => {
			const features: unknown[] = [];
			for (const sel of getActiveSelections()) {
				if (sel.props.type !== "Polygon") continue;
				features.push({
					type: "Feature",
					properties: sel.props.polygon.properties ?? {},
					geometry: { type: "Polygon", coordinates: sel.props.polygon.coordinates },
				});
			}
			const blob = new Blob([JSON.stringify({ type: "FeatureCollection", features })], {
				type: "application/geo+json",
			});
			downloadBlob(blob, "selections.geojson");
		},
	},
	deselectAll: {
		label: "Deselect everything",
		icon: mdiSelectRemove,
		group: "Selections",
		defaultBinding: "Mod+d",
		execute: resetSelections,
		enabled: hasAnySelections,
	},
	"expand-sv-links": {
		label: "Expand Street View links",
		icon: mdiGraphOutline,
		group: "Selections",
		aliases: ["crawl links", "hyperlapse links", "baidu links", "google links"],
		execute: () => {
			if (isExpandingSvLinks()) stopExpandSvLinks();
			else openDialog("expand-sv-links");
		},
		enabled: () => isExpandingSvLinks() || hasSelection(),
	},
	"find-duplicates": {
		label: "Find duplicates...",
		icon: mdiMapSearchOutline,
		group: "Selections",
		aliases: ["dedupe", "duplicate check"],
		execute: openInlinePanel("find-duplicates"),
	},
	"merge-duplicates": {
		label: "Merge duplicates...",
		icon: mdiCallMerge,
		group: "Selections",
		aliases: ["dedupe", "combine duplicates"],
		execute: () => openDialog("merge-duplicates"),
	},
	"filter-by-metadata": {
		label: "Filter by metadata...",
		icon: mdiFilterOutline,
		group: "Selections",
		aliases: ["search by field", "field filter"],
		execute: openInlinePanel("filter-by-metadata"),
	},
	"top-k": {
		label: "Select top/bottom K...",
		icon: mdiPodium,
		group: "Selections",
		execute: openInlinePanel("top-k"),
	},
	"review-selected": {
		label: "Review selected locations",
		icon: mdiPlayOutline,
		group: "Selections",
		enabled: hasSelection,
		execute: () => openDialog("review-selected"),
	},
	"review-sessions": {
		label: "Review sessions",
		icon: mdiBookOpenOutline,
		group: "Selections",
		execute: () => openDialog("review-sessions"),
	},
	"select-random": {
		label: "Pick random locations from selection",
		icon: mdiDiceMultiple,
		group: "Selections",
		aliases: ["sample", "random sample"],
		execute: openInlinePanel("select-random"),
		enabled: hasSelection,
	},
	"select-spaced": {
		label: "Pick evenly spaced locations from selection",
		icon: mdiDotsGrid,
		group: "Selections",
		aliases: ["spaced", "thin", "reduce density", "distribute"],
		execute: openInlinePanel("select-spaced"),
		enabled: hasSelection,
	},
	"ghost-selections": {
		label: "Ghost selections",
		icon: mdiGhostOutline,
		group: "Selections",
		aliases: ["hide selections", "dim selections"],
		execute: () => toggleGhostAllSelections(),
		enabled: hasAnySelections,
	},
	"save-selections": {
		label: "Save current selections...",
		icon: mdiBookmarkOutline,
		group: "Selections",
		execute: () => openDialog("save-selections"),
		enabled: hasAnySelections,
	},
	"apply-saved-selection": {
		label: "Apply saved selection...",
		icon: mdiBookmarkCheckOutline,
		group: "Selections",
		execute: () => openDialog("apply-saved-selection"),
	},
	"selection-delete-locations": {
		label: "Delete selected locations",
		icon: mdiTrashCanOutline,
		group: "Selections",
		enabled: hasSelection,
		execute: () => {
			const ids = getMapState().selectedLocationIds;
			if (ids.size > 0) removeLocations(ids);
		},
	},
	"bulk-validate": {
		label: "Validate locations",
		icon: mdiCheckDecagram,
		group: "Bulk Operations",
		aliases: ["check locations", "verify"],
		execute: openBulkOp("validate"),
	},
	"bulk-enrich": {
		label: "Enrich metadata fields",
		icon: mdiDatabaseArrowUp,
		group: "Bulk Operations",
		aliases: ["autotag", "fetch metadata", "auto-enrich"],
		execute: openBulkOp("enrich"),
	},
	"bulk-set-field": {
		label: "Set metadata field value",
		icon: mdiDatabaseEditOutline,
		group: "Bulk Operations",
		aliases: ["edit field", "assign field"],
		execute: openBulkOp("setField"),
	},
	"bulk-clear-fields": {
		label: "Clear metadata fields",
		icon: mdiDatabaseRemoveOutline,
		group: "Bulk Operations",
		aliases: ["remove fields", "strip metadata"],
		execute: openBulkOp("clearFields"),
	},
	"bulk-pin-pano": {
		label: "Pin locations to pano ID",
		icon: mdiMapMarkerCheck,
		group: "Bulk Operations",
		aliases: ["snap to pano", "lock pano"],
		execute: openBulkOp("pinPano"),
	},
	"bulk-heading-road": {
		label: "Pan headings along road",
		icon: mdiCompassOutline,
		group: "Bulk Operations",
		aliases: ["align headings", "road direction"],
		execute: openBulkOp("headingRoad"),
	},
	"bulk-download-panoramas": {
		label: "Download panoramas",
		icon: mdiDownloadBoxOutline,
		group: "Bulk Operations",
		aliases: ["bulk download", "export panoramas", "download street view"],
		execute: openBulkOp("downloadPanoramas"),
	},
	"delete-selected-tags": {
		label: "Delete selected tags",
		icon: mdiTagRemove,
		group: "Tags",
		execute: async () => {
			await deleteTags(
				getActiveSelections()
					.filter((s) => s.props.type === "Tag")
					.map((s) => (s.props as { type: "Tag"; tagId: number }).tagId),
			);
		},
		enabled: () => getActiveSelections().some((s) => s.props.type === "Tag"),
	},
	"tag-download-csv": {
		label: "Download tag counts as CSV",
		icon: mdiFileDelimitedOutline,
		group: "Tags",
		execute: () => {
			const map = getMapState().map;
			if (!map) return;
			const counts = getMapState().tagCounts;
			const rows = Object.entries(counts)
				.map(([id, count]) => ({ name: getMapState().tags[Number(id)]?.name ?? id, count }))
				.sort((a, b) => b.count - a.count);
			const csv =
				"name,count\n" + rows.map((r) => `"${r.name.replace(/"/g, '""')}",${r.count}`).join("\n");
			downloadBlob(new Blob([csv], { type: "text/csv" }), `${map.meta.name} tags.csv`);
		},
	},
	"copy-tags-count": {
		label: "Copy tags count",
		icon: mdiClipboardTextOutline,
		group: "Tags",
		aliases: ["copy tag counts", "clipboard tag counts"],
		execute: async () => {
			const counts = getMapState().tagCounts;
			const text = getVisibleTags()
				.map((tag) => ({ name: tag.name, count: counts[tag.id] ?? 0 }))
				.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
				.map((r) => `${r.name}: ${r.count}`)
				.join(", ");
			try {
				await navigator.clipboard.writeText(text);
				toast(t("toast.copiedTagsCount"));
			} catch {
				toast(t("toast.copyFailed"));
			}
		},
		enabled: requiresMap,
	},
	"tag-find-replace": {
		label: "Find and replace in tag names",
		icon: mdiFindReplace,
		group: "Tags",
		aliases: ["rename tags", "bulk rename"],
		execute: () => openDialog("tag-find-replace"),
		enabled: requiresMap,
	},
	"apply-field-as-tags": {
		label: "Apply metadata as tags",
		icon: mdiTagMultipleOutline,
		group: "Tags",
		aliases: ["group by field", "metadata to tags"],
		execute: () => openDialog("apply-field-as-tags"),
		enabled: requiresMap,
	},
	"assign-doclinks": {
		label: "Assign document links...",
		icon: mdiFileDocumentOutline,
		group: "Tags",
		aliases: ["doclinks", "link document"],
		execute: () => openDialog("doclink-assign"),
		enabled: requiresMap,
	},
} satisfies Record<string, CommandDef>;

export type CommandId = keyof typeof COMMANDS;
export type PinnedEntry = CommandId | "---" | (string & {});

for (const [id, def] of Object.entries(COMMANDS)) {
	registerCommand({ id, ...def });
}
