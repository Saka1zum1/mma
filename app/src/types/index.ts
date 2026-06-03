import type { Location_Serialize, Tag as _Tag, EditorImportResult_Serialize, EditorImportPreview } from "@/bindings.gen";

export type Location = Location_Serialize;
export type Tag = _Tag;
export type ImportResult = EditorImportResult_Serialize;
export type ImportPreview = EditorImportPreview;

export const enum LocationFlag {
	None = 0,
	LoadAsPanoId = 1,
	Informational = 2,
}

/** Panorama source type from Google's internal metadata. */
export const enum PanoType {
	Official = 2,
	Unknown = 3,
	UserUploaded = 10,
}

export const LOCATION_CORE_KEYS = new Set([
	"lat",
	"lng",
	"heading",
	"pitch",
	"zoom",
	"panoId",
	"flags",
	"tags",
	"extra",
]);

export function hasLoadAsPanoId(loc: Location): boolean {
	return (loc.flags & LocationFlag.LoadAsPanoId) !== 0;
}

export function isInformational(loc: Location): boolean {
	return (loc.flags & LocationFlag.Informational) !== 0;
}

export function isPinnedToPano(loc: Location): boolean {
	return hasLoadAsPanoId(loc) && loc.panoId != null;
}

export function createLocation(
	partial: Partial<Location> & { lat: number; lng: number },
): Location {
	return {
		id: 0, // placeholder; Rust assigns the real ID
		heading: 0,
		pitch: 0,
		zoom: 0,
		panoId: null,
		flags: LocationFlag.None,
		tags: [],
		createdAt: new Date().toISOString(),
		...partial,
	};
}

export type { ExtraFieldDef, MapSettings, MapMeta, MapData, MapExtra, ScoreBounds } from "@/bindings.gen";

export type SortMode = "name" | "created" | "opened" | "amount";
export type TagSortMode = "default" | "name" | "amount";

export type WorkArea = "overview" | "location" | "duplicates" | "import" | "plugin" | "diff";

export interface DuplicateGroup {
	distance: number;
	locations: Location[];
}

export type { CommitInfo } from "@/bindings.gen";
