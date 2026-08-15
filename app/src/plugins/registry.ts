import { useState, useCallback, type ComponentType, type SetStateAction } from "react";
import { emit as emitEvent } from "@/lib/events";
import { runAsPlugin, disposePlugin } from "@/plugins/scope";
import { cmpVersion } from "@/lib/util/util";
import { cmd } from "@/lib/commands";
import type { PluginManifest } from "@/bindings.gen";
import { getLocal, setLocal } from "@/lib/hooks/useLocalStorage";

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
	modal?: ComponentType<{ onClose: () => void }>;
	sidebar?: ComponentType<{ onClose: () => void }>;
	locationPanel?: ComponentType;
}

export type PluginBehavior = Partial<Plugin> & {
	activate(): void | (() => void);
};

// The registry serves only the latest build of each plugin, so a stale app offered a
// fresh plugin has exactly two options: take it or keep what it has. `minAppVersion`
// lets the plugin declare when "take it" would break.
export function isPluginCompatible(
	minAppVersion: string | null | undefined,
	appVersion: string,
): boolean {
	return !minAppVersion || cmpVersion(appVersion, minAppVersion) >= 0;
}

// An installed plugin is updatable when the registry has a NEWER version than what
// is installed. If installed is newer than registry (e.g. side-loaded), no update
// is needed. Empty/unknown versions never prompt an update.
export function isPluginUpdatable(
	installedVersion: string | undefined,
	latestVersion: string | undefined,
): boolean {
	return !!installedVersion && !!latestVersion && cmpVersion(latestVersion, installedVersion) > 0;
}

// A plugin needs updating when its JS version drifts OR its sidecar drifts. A registry
// sidecar version that differs from what's installed (including a missing sidecar, where
// the installed version is null/undefined) means the sidecar must be (re)downloaded.
export function needsUpdate(
	installedVersion: string | undefined,
	latestVersion: string | undefined,
	installedSidecarVersion: string | null | undefined,
	latestSidecarVersion: string | undefined,
): boolean {
	if (isPluginUpdatable(installedVersion, latestVersion)) return true;
	return !!latestSidecarVersion && installedSidecarVersion !== latestSidecarVersion;
}

// --- Registry ---

const plugins = new Map<string, Plugin>();
const cleanups = new Map<string, () => void>();
let pendingManifest: PluginManifest | null = null;

export function setPendingManifest(manifest: PluginManifest | null) {
	pendingManifest = manifest;
}

const ENABLED_KEY = "mma_plugins_enabled";
function saveEnabled(set: Set<string>) {
	setLocal(ENABLED_KEY, [...set]);
}

const enabledSet = new Set(getLocal<string[]>(ENABLED_KEY, []));

/** Register a plugin. `activate` runs when a map opens; its returned cleanup runs on map close. */
export function registerPlugin(plugin: Plugin | PluginBehavior) {
	if (pendingManifest) {
		const merged: Plugin = {
			id: pendingManifest.id,
			name: pendingManifest.name,
			description: pendingManifest.description || undefined,
			icon: pendingManifest.icon,
			experimental: pendingManifest.experimental,
			...plugin,
		};
		plugins.set(merged.id, merged);
		pendingManifest = null;
	} else {
		plugins.set((plugin as Plugin).id, plugin as Plugin);
	}
	emitEvent("plugins:changed");
}

export function getPlugins(): Plugin[] {
	return [...plugins.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getPlugin(id: string): Plugin | undefined {
	return plugins.get(id);
}

/** A plugin with no sidebar, modal, or location panel — it only contributes data
 *  (enrichment fields) and never shows UI of its own. Unknown for plugins that
 *  aren't loaded, so uninstalled registry entries report false. */
export function isBackgroundPlugin(id: string): boolean {
	const plugin = plugins.get(id);
	return !!plugin && !plugin.sidebar && !plugin.modal && !plugin.locationPanel;
}

export function unregisterPlugin(id: string) {
	plugins.delete(id);
	emitEvent("plugins:changed");
}

export function isPluginEnabled(id: string): boolean {
	return enabledSet.has(id);
}

export function setPluginEnabled(id: string, enabled: boolean) {
	if (enabled) enabledSet.add(id);
	else enabledSet.delete(id);
	saveEnabled(enabledSet);
	emitEvent("plugins:changed");
}

export function getEnabledPlugins(): Plugin[] {
	return [...plugins.values()].filter((p) => enabledSet.has(p.id));
}

// --- Plugin storage (namespaced localStorage, one JSON object per plugin) ---

export interface PluginStorage {
	get<T = unknown>(key: string, fallback?: T): T;
	set(key: string, value: unknown): void;
	remove(key: string): void;
	keys(): string[];
}

function pluginStoreKey(id: string): string {
	return `mma_plugin:${id}`;
}

function readPluginStore(id: string): Record<string, unknown> {
	return getLocal<Record<string, unknown>>(pluginStoreKey(id), {});
}

function writePluginStore(id: string, data: Record<string, unknown>) {
	setLocal(pluginStoreKey(id), data);
}

/** Persistent key-value storage namespaced to a plugin. Survives restarts. */
export function createPluginStorage(id: string): PluginStorage {
	return {
		get<T = unknown>(key: string, fallback?: T): T {
			const data = readPluginStore(id);
			return (key in data ? data[key] : fallback) as T;
		},
		set(key, value) {
			const data = readPluginStore(id);
			data[key] = value;
			writePluginStore(id, data);
		},
		remove(key) {
			const data = readPluginStore(id);
			delete data[key];
			writePluginStore(id, data);
		},
		keys() {
			return Object.keys(readPluginStore(id));
		},
	};
}

/** useState persisted through the plugin's namespaced store. UI state saved this
 *  way survives sidebar unmount and app restart. Values are global, not per-map —
 *  callers must fall back gracefully when a stored value doesn't resolve against
 *  the current map (e.g. a field key or saved-selection id). */
export function usePluginState<T>(pluginId: string, key: string, initial: T | (() => T)) {
	const [value, setValue] = useState<T>(() => {
		const data = readPluginStore(pluginId);
		if (key in data) return data[key] as T;
		return typeof initial === "function" ? (initial as () => T)() : initial;
	});
	const set = useCallback(
		(action: SetStateAction<T>) => {
			setValue((prev) => {
				const next = typeof action === "function" ? (action as (p: T) => T)(prev) : action;
				createPluginStorage(pluginId).set(key, next);
				return next;
			});
		},
		[pluginId, key],
	);
	return [value, set] as const;
}

// Declarative settings (Plugin.settings) are backed by the same namespaced store,
// falling back to each def's `default` when unset.
export function getPluginSetting<T = unknown>(plugin: Plugin, key: string): T {
	const data = readPluginStore(plugin.id);
	if (key in data) return data[key] as T;
	return plugin.settings?.find((s) => s.key === key)?.default as T;
}

export function setPluginSetting(id: string, key: string, value: unknown) {
	createPluginStorage(id).set(key, value);
	emitEvent("plugins:changed");
}

// --- Activation lifecycle ---

export function activatePlugins() {
	for (const plugin of getEnabledPlugins()) {
		if (!cleanups.has(plugin.id)) {
			const cleanup = runAsPlugin(plugin.id, () => plugin.activate());
			if (cleanup) cleanups.set(plugin.id, cleanup);
		}
	}
	emitEvent("plugins:changed");
}

export function deactivatePlugins() {
	for (const [_id, cleanup] of cleanups) {
		cleanup();
	}
	cleanups.clear();
	// Nothing is active any more, so nothing should still be running. Covers plugins
	// that registered no cleanup of their own.
	cmd.sidecarStopAll().catch(() => {});
}

export function activatePlugin(id: string) {
	const plugin = plugins.get(id);
	if (!plugin || cleanups.has(id)) return;
	const cleanup = runAsPlugin(id, () => plugin.activate());
	if (cleanup) cleanups.set(id, cleanup);
}

export function deactivatePlugin(id: string) {
	const cleanup = cleanups.get(id);
	if (cleanup) {
		cleanup();
		cleanups.delete(id);
	}
	// A disabled plugin keeps no processes, whether or not it cleaned up after itself.
	cmd.sidecarStop(id).catch(() => {});
	// Reverse every host registration the plugin made during activation, even when it
	// returned no cleanup — so a disabled plugin's providers/fields/listeners stop.
	disposePlugin(id);
}
