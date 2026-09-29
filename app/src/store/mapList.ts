import { useCallback } from "react";
import type { CommitDiff, MapMeta } from "@/bindings.gen";
import { emit as tauriEmit } from "@tauri-apps/api/event";
import { cmd } from "@/lib/commands";
import {
	emit as emitEvent,
	subscribe,
	subscribeMany,
	useEventValue,
	type EditorEvent,
} from "@/lib/events";
import { msg, t } from "@/lib/i18n";
import { getSettings } from "@/store/settings";

let cachedMapList: MapMeta[] = [];

/** Reactive list of all maps (metadata only). */
export function useMapList(): MapMeta[] {
	return useEventValue("map-list:changed", () => cachedMapList);
}

/** The list of all maps (metadata only). */
export function getMapList() {
	return cachedMapList;
}

export async function reloadMapList() {
	cachedMapList = await cmd.storeListMaps();
	emitEvent("map-list:changed");
}

/** Re-fetch the map list from the database. */
export async function invalidateMapList() {
	await reloadMapList();
	tauriEmit("map-list-changed");
}

/** Set the cached map list directly (used by initStore). */
export function setCachedMapList(list: MapMeta[]) {
	cachedMapList = list;
}

/** Create a new empty map and return its metadata. */
export async function createMap(name: string, folder: string | null = null) {
	const { meta } = await cmd.storeCreateMap(name, folder);
	await invalidateMapList();
	return meta;
}

/** Permanently delete a map and all its data. Not undoable. */
export async function deleteMap(id: string) {
	await cmd.storeDeleteMap(id);
	await invalidateMapList();
	tauriEmit("map-deleted", id);
}

export async function renameFolder(from: string, to: string) {
	cachedMapList = cachedMapList.map((m) => (m.folder === from ? { ...m, folder: to } : m));
	emitEvent("map-list:changed");
	await cmd.storeRenameFolder(from, to);
	await invalidateMapList();
}

export async function moveMapToFolder(mapId: string, folder: string | null) {
	const idx = cachedMapList.findIndex((m) => m.id === mapId);
	if (idx !== -1) {
		cachedMapList = cachedMapList.map((m) => (m.id === mapId ? { ...m, folder } : m));
		emitEvent("map-list:changed");
	}
	await cmd.storeUpdateMapMeta(mapId, { folder: folder ?? null });
	tauriEmit("map-list-changed");
}

export async function deleteFolder(name: string) {
	await cmd.storeDeleteFolder(name);
	await invalidateMapList();
}

/** A mark drawn on one map-list row. */
export type MapBadge = { key: string; title: string } & ({ icon: string } | { diff: CommitDiff });

export interface BadgeSource {
	id: string;
	label: string;
	events: readonly EditorEvent[];
	collect(): Iterable<[mapId: string, badge: MapBadge]>;
}

const sources = new Map<string, BadgeSource>();
let badgeCache: Map<string, MapBadge[]> | null = null;
const NO_BADGES: MapBadge[] = [];
let settingsHooked = false;

function hiddenBadgeIds(): Set<string> {
	return new Set(getSettings().hiddenMapBadges);
}

function computeBadges(): Map<string, MapBadge[]> {
	const hide = hiddenBadgeIds();
	const byMap = new Map<string, MapBadge[]>();
	for (const source of sources.values()) {
		if (hide.has(source.id)) continue;
		for (const [mapId, badge] of source.collect()) {
			const list = byMap.get(mapId);
			if (list) list.push(badge);
			else byMap.set(mapId, [badge]);
		}
	}
	return byMap;
}

function badgeSnapshot(): Map<string, MapBadge[]> {
	if (!badgeCache) badgeCache = computeBadges();
	return badgeCache;
}

function invalidateMapBadges() {
	badgeCache = null;
	emitEvent("map-badges:changed");
}

export function registerMapBadges(source: BadgeSource) {
	sources.set(source.id, source);
	if (!settingsHooked) {
		settingsHooked = true;
		subscribe("settings:changed", invalidateMapBadges);
	}
	subscribeMany(source.events, invalidateMapBadges);
	invalidateMapBadges();
}

export function getMapBadgeSources(): BadgeSource[] {
	return [...sources.values()];
}

export function getMapBadges(mapId: string): MapBadge[] {
	return badgeSnapshot().get(mapId) ?? NO_BADGES;
}

/** Re-renders when a badge source changes. Returns the badges for one map. */
export function useMapBadges(): (mapId: string) => MapBadge[] {
	const all = useEventValue("map-badges:changed", badgeSnapshot);
	return useCallback((mapId: string) => all.get(mapId) ?? NO_BADGES, [all]);
}

registerMapBadges({
	id: "uncommitted",
	label: msg("Uncommitted changes"),
	events: ["map-list:changed"],
	collect() {
		const out: [string, MapBadge][] = [];
		for (const m of cachedMapList) {
			const pending = m.pending;
			if (!pending || pending.added + pending.removed + pending.modified === 0) continue;
			out.push([
				m.id,
				{
					key: "uncommitted",
					title: t("Changes since the last commit"),
					diff: pending,
				},
			]);
		}
		return out;
	},
});
