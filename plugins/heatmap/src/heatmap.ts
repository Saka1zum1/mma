import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { DeckOverlayHandle, LatLng, LocationStore, SourceScope } from "mma-plugin-types";

export interface HeatmapLayerSettings {
	id: string;
	visible: boolean;
	intensity: number;
	radiusPixels: number;
	opacity: number;
	threshold: number;
	gradientIndex: number;
	source: SourceScope;
}

export const LAYER_DEFAULTS: Omit<HeatmapLayerSettings, "id" | "source"> = {
	visible: true,
	intensity: 1,
	radiusPixels: 30,
	opacity: 0.6,
	threshold: 0.05,
	gradientIndex: 0,
};

const store = MMA.storage("heatmap");

function defaultSource(): SourceScope {
	return MMA.getSelectedLocationIds().size > 0 ? { kind: "selected" } : { kind: "all" };
}

function newLayer(): HeatmapLayerSettings {
	return { id: crypto.randomUUID(), source: defaultSource(), ...LAYER_DEFAULTS };
}

// Pre-1.1 versions stored a single settings object under "settings".
function loadLayers(): HeatmapLayerSettings[] {
	const stored = store.get<Partial<HeatmapLayerSettings>[]>("layers");
	if (stored?.length) return stored.map((l) => ({ ...newLayer(), ...l }));
	const legacy = store.get<Partial<Omit<HeatmapLayerSettings, "id">>>("settings");
	return [{ ...newLayer(), ...(legacy ?? {}) }];
}

type RGB = [number, number, number];

export interface HeatmapGradient {
	name: string;
	stops: RGB[];
}

export const GRADIENTS: HeatmapGradient[] = [
	// deck.gl's built-in default colorRange (6-step ColorBrewer YlOrRd) — the original look.
	{ name: "Classic", stops: [[255, 255, 178], [254, 217, 118], [254, 178, 76], [253, 141, 60], [240, 59, 32], [189, 0, 38]] },
	{ name: "Viridis", stops: [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]] },
	{ name: "Inferno", stops: [[0, 0, 4], [87, 16, 110], [188, 55, 84], [249, 142, 9], [252, 255, 164]] },
	{ name: "Plasma", stops: [[13, 8, 135], [126, 3, 168], [204, 71, 120], [248, 149, 64], [240, 249, 33]] },
	{ name: "Magma", stops: [[0, 0, 4], [81, 18, 124], [183, 55, 121], [252, 137, 97], [252, 253, 191]] },
	{ name: "Cividis", stops: [[0, 32, 76], [87, 92, 109], [170, 156, 116], [255, 234, 70]] },
	{ name: "Heat", stops: [[0, 0, 255], [0, 255, 255], [0, 255, 0], [255, 255, 0], [255, 0, 0]] },
	{ name: "Blue-Red", stops: [[66, 133, 244], [234, 67, 53]] },
	{ name: "Green-Yellow-Red", stops: [[52, 168, 83], [251, 188, 4], [234, 67, 53]] },
	{ name: "Purple-Orange", stops: [[136, 84, 208], [255, 152, 0]] },
	{ name: "Blues", stops: [[222, 235, 247], [158, 202, 225], [49, 130, 189]] },
	{ name: "Reds", stops: [[254, 224, 210], [252, 146, 114], [222, 45, 38]] },
	{ name: "Greens", stops: [[229, 245, 224], [161, 217, 155], [49, 163, 84]] },
	{ name: "Purples", stops: [[239, 237, 245], [188, 189, 220], [117, 107, 177]] },
];

// deck.gl's HeatmapLayer builds a continuous color texture from colorRange, so a
// handful of evenly-sampled stops gives a smooth ramp.
function sampleColorRange(stops: RGB[], n = 6): RGB[] {
	if (stops.length === 1) return Array.from({ length: n }, () => stops[0]);
	const out: RGB[] = [];
	for (let i = 0; i < n; i++) {
		const t = (i / (n - 1)) * (stops.length - 1);
		const idx = Math.min(Math.floor(t), stops.length - 2);
		const f = t - idx;
		const a = stops[idx];
		const b = stops[idx + 1];
		out.push([
			Math.round(a[0] + (b[0] - a[0]) * f),
			Math.round(a[1] + (b[1] - a[1]) * f),
			Math.round(a[2] + (b[2] - a[2]) * f),
		]);
	}
	return out;
}

let overlay: DeckOverlayHandle | null = null;
let locStore: LocationStore | null = null;
let layers: HeatmapLayerSettings[] = loadLayers();
let onSettingsChange: (() => void) | null = null;

export function getLayers(): HeatmapLayerSettings[] {
	return layers;
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
				colorRange: sampleColorRange((GRADIENTS[l.gradientIndex] ?? GRADIENTS[0]).stops),
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
		onSettingsChange = null;
	};
}
