import { useSyncExternalStore } from "react";
import { CellManager } from "@/lib/render/CellManager";
import { cmd } from "@/lib/commands";
import { mmaBufUrl } from "@/lib/util/util";
import { log } from "@/lib/util/log";
import { trace } from "@/lib/util/debug";
import {
	getActiveLocation,
	getSelectedLocationIds,
	mapOpenMark,
	renderDeltaBus,
	selBitmaskBus,
	subscribeStore,
} from "@/store/useMapStore";
import type { MarkerStyle } from "@/components/editor/map/mapSettingsTypes";

// Owns marker/scene data for every map surface. The editor map drives the
// engine (fetch + lifecycle); both it and the minimap render from the same `CellManager`.
// There can be exactly one producer — `store_fill_render_file` is unsafe for a second caller
// (ignores bounds, rebuilds the picking index, shared file path).

const ACTIVE_HIDDEN: [number, number, number, number] = [0, 0, 0, 0];
const MARKER_DEFAULT: [number, number, number, number] = [42, 42, 42, 255];

const scene = new CellManager();
let version = 0;
let prevActiveId: number | null = null;
let lastMarkerStyle: MarkerStyle = "pin";
let loadToken = 0;
let listeners: Array<() => void> = [];

function bumpScene() {
	version++;
	for (const l of listeners) l();
}

export function getScene(): CellManager {
	return scene;
}

function getSceneVersion() {
	return version;
}

export function subscribeScene(fn: () => void): () => void {
	listeners.push(fn);
	return () => {
		listeners = listeners.filter((l) => l !== fn);
	};
}

/** Reactive scene version. Bumps on load, delta, selection, and active-location change. */
export function useScene(): number {
	return useSyncExternalStore(subscribeScene, getSceneVersion);
}

function patchMarker(id: number, rgba: [number, number, number, number]) {
	for (const cb of scene.cells.values()) {
		const idx = cb.idToIndex.get(id);
		if (idx != null) {
			cb.patchColor(idx, rgba[0], rgba[1], rgba[2], rgba[3]);
			return;
		}
	}
}

// Reflect the active location in the scene: hide its base marker (the active overlay draws
// it) and restore the previously-active one — unless it's selected. Fast path: no refetch.
function applyActive() {
	const activeId = getActiveLocation()?.id ?? null;
	if (prevActiveId != null && prevActiveId !== activeId && !getSelectedLocationIds().has(prevActiveId)) {
		patchMarker(prevActiveId, MARKER_DEFAULT);
	}
	prevActiveId = activeId;
	if (activeId != null) patchMarker(activeId, ACTIVE_HIDDEN);
}

/** Full (re)load from Rust for the whole world. Editor-driven on open / marker-style change. */
export async function loadScene(markerStyle: MarkerStyle): Promise<void> {
	lastMarkerStyle = markerStyle;
	const token = ++loadToken;
	const t = trace("render", { summary: true });
	try {
		const filePath = await cmd.storeFillRenderFile({
			west: -180,
			south: -90,
			east: 180,
			north: 90,
			markerStyle,
		});
		t.step("fill");
		const resp = await fetch(mmaBufUrl(filePath));
		if (!resp.ok) throw new Error(`render fetch ${resp.status}: ${await resp.text()}`);
		const buf = await resp.arrayBuffer();
		t.step("fetch");
		if (token !== loadToken) return; // superseded by a newer load
		scene.initFromBinary(buf);
		t.step("parse");
		mapOpenMark("markers");
		applyActive();
		t.end({ cells: scene.cells.size, total: scene.totalCount, bytes: buf.byteLength });
		bumpScene();
	} catch (e) {
		log.error("[scene] loadScene failed:", e);
	}
}

export function clearScene() {
	scene.clear();
	prevActiveId = null;
	bumpScene();
}

// Subscriptions live for the editor map's lifetime (one producer). Returns a stop fn.
export function startSceneEngine(): () => void {
	const unsubDelta = renderDeltaBus.on((delta) => {
		if (delta.fullReset) {
			void loadScene(lastMarkerStyle);
			return;
		}
		const t = trace("delta", { summary: true });
		const affected = scene.applyDelta(delta);
		const aid = getActiveLocation()?.id ?? null;
		if (aid != null) patchMarker(aid, ACTIVE_HIDDEN);
		if (delta.colorPatches.length > 0) {
			const selPatches = delta.colorPatches.filter((cp) => !(cp.r === 42 && cp.g === 42 && cp.b === 42));
			scene.appendToSelectionOverlay(selPatches);
		}
		t.end({ affected: affected.size, added: delta.added.length, removed: delta.removed.length });
		if (affected.size > 0 || delta.colorPatches.length > 0) bumpScene();
	});

	const unsubSel = selBitmaskBus.on((selColors, cellEntries, setIds) => {
		const t = trace("selection", { summary: true });
		const ids = scene.applySelectionBitmasks(selColors, cellEntries);
		setIds(ids);
		t.end({ cells: cellEntries.length, sels: selColors.length, ids: ids.size });
		bumpScene();
	});

	// Active-location switch fires a plain store mutation (store_set_active is fire-and-forget,
	// no delta). Re-derive the scene's active highlight when the id changes.
	const unsubStore = subscribeStore(() => {
		const activeId = getActiveLocation()?.id ?? null;
		if (activeId !== prevActiveId) {
			applyActive();
			bumpScene();
		}
	});

	return () => {
		unsubDelta();
		unsubSel();
		unsubStore();
		clearScene();
	};
}
