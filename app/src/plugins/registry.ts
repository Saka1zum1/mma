import type { ComponentType } from "react";

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
	settings?: PluginSettingDef[];
	activate(): void | (() => void);
	modal?: ComponentType<{ onClose: () => void }>;
	sidebar?: ComponentType<{ onClose: () => void }>;
	locationPanel?: ComponentType;
}

export interface PluginManifest {
	id: string;
	name: string;
	description: string;
	icon: string;
	main: string;
}

export type PluginBehavior = Partial<Plugin> & {
	activate(): void | (() => void);
};

// --- Registry ---

const plugins = new Map<string, Plugin>();
const cleanups = new Map<string, () => void>();
let pendingManifest: PluginManifest | null = null;

export function setPendingManifest(manifest: PluginManifest | null) {
	pendingManifest = manifest;
}

const ENABLED_KEY = "mma_plugins_enabled";

function loadEnabled(): Set<string> {
	try {
		return new Set(JSON.parse(localStorage.getItem(ENABLED_KEY) || "[]"));
	} catch {
		return new Set();
	}
}

function saveEnabled(set: Set<string>) {
	localStorage.setItem(ENABLED_KEY, JSON.stringify([...set]));
}

const enabledSet = loadEnabled();

export function registerPlugin(plugin: Plugin | PluginBehavior) {
	if (pendingManifest) {
		const merged: Plugin = {
			id: pendingManifest.id,
			name: pendingManifest.name,
			description: pendingManifest.description || undefined,
			icon: pendingManifest.icon,
			...plugin,
		};
		plugins.set(merged.id, merged);
		pendingManifest = null;
	} else {
		plugins.set((plugin as Plugin).id, plugin as Plugin);
	}
}

export function getPlugins(): Plugin[] {
	return [...plugins.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getPlugin(id: string): Plugin | undefined {
	return plugins.get(id);
}

export function isPluginEnabled(id: string): boolean {
	return enabledSet.has(id);
}

export function setPluginEnabled(id: string, enabled: boolean) {
	if (enabled) enabledSet.add(id);
	else enabledSet.delete(id);
	saveEnabled(enabledSet);
	registryVersion++;
	registryListeners.forEach((fn) => fn());
}

export function getEnabledPlugins(): Plugin[] {
	return [...plugins.values()].filter((p) => enabledSet.has(p.id));
}

// --- Activation lifecycle ---

export function activatePlugins() {
	for (const plugin of getEnabledPlugins()) {
		if (!cleanups.has(plugin.id)) {
			const cleanup = plugin.activate();
			if (cleanup) cleanups.set(plugin.id, cleanup);
		}
	}
	registryVersion++;
	registryListeners.forEach((fn) => fn());
}

export function deactivatePlugins() {
	for (const [_id, cleanup] of cleanups) {
		cleanup();
	}
	cleanups.clear();
}

export function activatePlugin(id: string) {
	const plugin = plugins.get(id);
	if (!plugin || cleanups.has(id)) return;
	const cleanup = plugin.activate();
	if (cleanup) cleanups.set(id, cleanup);
}

export function deactivatePlugin(id: string) {
	const cleanup = cleanups.get(id);
	if (cleanup) {
		cleanup();
		cleanups.delete(id);
	}
}

// --- React subscription for registry changes ---

let registryVersion = 0;
let registryListeners: (() => void)[] = [];

export function subscribeRegistry(fn: () => void) {
	registryListeners.push(fn);
	return () => {
		registryListeners = registryListeners.filter((l) => l !== fn);
	};
}

export function getRegistrySnapshot() {
	return registryVersion;
}
