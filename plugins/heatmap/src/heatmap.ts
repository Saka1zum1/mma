import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { LatLng, LocationStore, ScopeHandle } from "mma-plugin-types";

export interface HeatmapLayerSettings {
	id: string;
	visible: boolean;
	intensity: number;
	radiusPixels: number;
	opacity: number;
	threshold: number;
	gradientIndex: number;
}

export const LAYER_DEFAULTS: Omit<HeatmapLayerSettings, "id"> = {
	visible: true,
	intensity: 1,
	radiusPixels: 30,
	opacity: 0.6,
	threshold: 0.05,
	gradientIndex: 0,
};

const store = MMA.storage("heatmap");

function newLayer(): HeatmapLayerSettings {
	return { id: crypto.randomUUID(), ...LAYER_DEFAULTS };
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

let overlay: GoogleMapsOverlay | null = null;
let locStore: LocationStore | null = null;
let layers: HeatmapLayerSettings[] = loadLayers();
let onSettingsChange: (() => void) | null = null;

// Externalized scope: the sidebar drives it via scopeHandle.use(), the renderer reads it
// synchronously and rebuilds via subscribe() — no hand-rolled state, no React bridge.
export const scopeHandle: ScopeHandle = MMA.createScope();

export function getLayers(): HeatmapLayerSettings[] {
	return layers;
}

// The renderer's pool is the plugin's own LocationStore; the scope just narrows it.
function scopedLocations(): LatLng[] {
	if (!locStore) return [];
	return locStore.get(scopeHandle.get()).map((l) => ({ lat: l.lat, lng: l.lng }));
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

function rebuild() {
	if (!overlay) return;
	const data = scopedLocations();

	const deckLayers = layers
		.filter((l) => l.visible)
		.map(
			(l) =>
				new HeatmapLayer({
					id: `mma-heatmap-${l.id}`,
					data,
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
	const map = MMA.getGoogleMap();
	if (!map) throw new Error("No map instance");

	locStore = await MMA.createLocationStore();
	// Default to the current selection if there is one, else all locations.
	scopeHandle.set(MMA.getSelectedLocationIds().size > 0 ? { kind: "selected" } : { kind: "all" });

	overlay = new GoogleMapsOverlay({ layers: [] });
	overlay.setMap(map);
	rebuild();

	const onChange = () => {
		rebuild();
		onSettingsChange?.();
	};
	const unsubStore = locStore.onChange(onChange);
	const unsubSel = MMA.on("selection:change", onChange);
	const unsubScope = scopeHandle.subscribe(onChange);

	return () => {
		unsubStore();
		unsubSel();
		unsubScope();
		locStore?.destroy();
		locStore = null;
		if (overlay) {
			overlay.setMap(null);
			overlay.finalize();
			overlay = null;
		}
		layers = loadLayers();
		onSettingsChange = null;
	};
}
