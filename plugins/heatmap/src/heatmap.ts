import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { DeckOverlayHandle, LatLng, LocationStore, SourceScope } from "mma-plugin-types";
import {
	DEFAULT_GRADIENT_ID,
	gradientIdFromLegacyIndex,
	isBuiltinGradient,
	newCustomGradient,
	normalizeGradient,
	resolveGradient,
	sampleColorRange,
	type HeatmapGradient,
} from "./gradients";

export interface HeatmapLayerSettings {
	id: string;
	visible: boolean;
	intensity: number;
	radiusPixels: number;
	opacity: number;
	threshold: number;
	gradientId: string;
	source: SourceScope;
}

export const LAYER_DEFAULTS: Omit<HeatmapLayerSettings, "id" | "source"> = {
	visible: true,
	intensity: 1,
	radiusPixels: 30,
	opacity: 0.6,
	threshold: 0.05,
	gradientId: DEFAULT_GRADIENT_ID,
};

const store = MMA.storage("heatmap");

function defaultSource(): SourceScope {
	return MMA.getMapState().selectedLocationIds.size > 0 ? { kind: "selected" } : { kind: "all" };
}

function newLayer(): HeatmapLayerSettings {
	return { id: crypto.randomUUID(), source: defaultSource(), ...LAYER_DEFAULTS };
}

type StoredLayer = Partial<HeatmapLayerSettings> & { gradientIndex?: unknown };

function migrateLayer(stored: StoredLayer): HeatmapLayerSettings {
	const { gradientIndex, ...rest } = stored;
	const layer = { ...newLayer(), ...rest };
	if (rest.gradientId === undefined) layer.gradientId = gradientIdFromLegacyIndex(gradientIndex);
	return layer;
}

// Pre-1.1 versions stored a single settings object under "settings".
function loadLayers(): HeatmapLayerSettings[] {
	const stored = store.get<StoredLayer[]>("layers");
	if (stored?.length) return stored.map(migrateLayer);
	const legacy = store.get<StoredLayer>("settings");
	return [migrateLayer(legacy ?? {})];
}

function loadGradients(): HeatmapGradient[] {
	return (store.get<HeatmapGradient[]>("gradients") ?? []).map(normalizeGradient);
}

let overlay: DeckOverlayHandle | null = null;
let locStore: LocationStore | null = null;
let layers: HeatmapLayerSettings[] = loadLayers();
let customGradients: HeatmapGradient[] = loadGradients();
let onSettingsChange: (() => void) | null = null;

export function getLayers(): HeatmapLayerSettings[] {
	return layers;
}

export function getCustomGradients(): HeatmapGradient[] {
	return customGradients;
}

export function setOnSettingsChange(cb: (() => void) | null) {
	onSettingsChange = cb;
}

function commit() {
	store.set("layers", layers);
	rebuild();
	onSettingsChange?.();
}

export function updateLayer(id: string, patch: Partial<HeatmapLayerSettings>) {
	layers = layers.map((l) => (l.id === id ? { ...l, ...patch } : l));
	commit();
}

export function addLayer() {
	layers = [...layers, newLayer()];
	commit();
}

export function removeLayer(id: string) {
	layers = layers.filter((l) => l.id !== id);
	commit();
}

export function resetLayers() {
	layers = [newLayer()];
	commit();
}

function commitGradients() {
	store.set("gradients", customGradients);
	commit();
}

/** Adds an editable copy of `from` and points `layerId` at it. Returns the new gradient. */
export function addCustomGradient(layerId: string, from: HeatmapGradient): HeatmapGradient {
	const gradient = newCustomGradient(from);
	customGradients = [...customGradients, gradient];
	layers = layers.map((l) => (l.id === layerId ? { ...l, gradientId: gradient.id } : l));
	commitGradients();
	return gradient;
}

export function updateCustomGradient(id: string, patch: Partial<Omit<HeatmapGradient, "id">>) {
	if (isBuiltinGradient(id)) return;
	customGradients = customGradients.map((g) => (g.id === id ? { ...g, ...patch } : g));
	commitGradients();
}

export function removeCustomGradient(id: string) {
	customGradients = customGradients.filter((g) => g.id !== id);
	// Layers always point at a gradient that exists, so the swatch grid can't end up
	// with nothing selected.
	layers = layers.map((l) => (l.gradientId === id ? { ...l, gradientId: DEFAULT_GRADIENT_ID } : l));
	commitGradients();
}

async function sourceData(source: SourceScope): Promise<LatLng[]> {
	if (!locStore) return [];
	const pool = locStore.get();
	const ids = await MMA.resolveScopeIds(source);
	const subset = ids ? pool.filter((l) => ids.has(l.id)) : pool;
	return subset.map((l) => ({ lat: l.lat, lng: l.lng }));
}

let rebuildToken = 0;

async function rebuild() {
	if (!overlay) return;
	const token = ++rebuildToken;

	const visible = layers.filter((l) => l.visible);
	const datas = await Promise.all(visible.map((l) => sourceData(l.source)));
	if (token !== rebuildToken || !overlay) return;

	const deckLayers = visible.map(
		(l, i) =>
			new HeatmapLayer({
				id: `mma-heatmap-${l.id}`,
				data: datas[i],
				getPosition: (d: LatLng) => [d.lng, d.lat],
				getWeight: 1,
				radiusPixels: l.radiusPixels,
				intensity: l.intensity,
				threshold: l.threshold,
				opacity: l.opacity,
				colorRange: sampleColorRange(resolveGradient(l.gradientId, customGradients).stops),
				debounceTimeout: 100,
			}),
	);

	overlay.setProps({ layers: deckLayers });
}

export async function init(): Promise<() => void> {
	const host = MMA.getMapHost();
	if (!host) throw new Error("No map instance");

	locStore = await MMA.createLocationStore();

	overlay = host.createDeckOverlay();
	void rebuild();

	const onChange = () => {
		void rebuild();
		onSettingsChange?.();
	};
	const unsubStore = locStore.onChange(onChange);
	const unsubSel = MMA.on("selection:change", onChange);

	return () => {
		unsubStore();
		unsubSel();
		locStore?.destroy();
		locStore = null;
		if (overlay) {
			overlay.finalize();
			overlay = null;
		}
		layers = loadLayers();
		customGradients = loadGradients();
		onSettingsChange = null;
	};
}
