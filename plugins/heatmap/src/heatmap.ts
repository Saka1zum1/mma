import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { Scope, LocationStore } from "mma-plugin-types";

export interface HeatmapSettings {
	visible: boolean;
	intensity: number;
	radiusPixels: number;
	opacity: number;
	threshold: number;
	gradientIndex: number;
}

export const DEFAULT_SETTINGS: HeatmapSettings = {
	visible: true,
	intensity: 1,
	radiusPixels: 30,
	opacity: 0.6,
	threshold: 0.05,
	gradientIndex: 0,
};

const STORAGE_KEY = "mma_heatmap_settings";

function loadSettings(): HeatmapSettings {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
	} catch {
		// ignored
	}
	return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: HeatmapSettings) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
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
	{ name: "Heat", stops: [[0, 0, 255], [0, 255, 255], [0, 255, 0], [255, 255, 0], [255, 0, 0]] },
	{ name: "Blue-Red", stops: [[66, 133, 244], [234, 67, 53]] },
	{ name: "Green-Yellow-Red", stops: [[52, 168, 83], [251, 188, 4], [234, 67, 53]] },
	{ name: "Purple-Orange", stops: [[136, 84, 208], [255, 152, 0]] },
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

interface LocPoint {
	lat: number;
	lng: number;
}

let overlay: GoogleMapsOverlay | null = null;
let locStore: LocationStore | null = null;
let settings: HeatmapSettings = loadSettings();
let scope: Scope = { kind: "selected" };
let onSettingsChange: (() => void) | null = null;

export function getSettings(): HeatmapSettings {
	return settings;
}

export function getScope(): Scope {
	return scope;
}

export function setScope(next: Scope): void {
	if (scope.kind === next.kind) return;
	scope = next;
	rebuild();
	onSettingsChange?.();
}

export function getLocationCount(): number {
	return scopedLocations().length;
}

// The renderer's pool is the plugin's own LocationStore; the scope just narrows it.
function scopedLocations(): LocPoint[] {
	if (!locStore) return [];
	return locStore.get(scope).map((l) => ({ lat: l.lat, lng: l.lng }));
}

export function setOnSettingsChange(cb: (() => void) | null) {
	onSettingsChange = cb;
}

export function updateSettings(patch: Partial<HeatmapSettings>) {
	settings = { ...settings, ...patch };
	saveSettings(settings);
	rebuild();
	onSettingsChange?.();
}

function rebuild() {
	if (!overlay) return;
	if (!settings.visible) {
		overlay.setProps({ layers: [] });
		return;
	}
	const data = scopedLocations();

	const layer = new HeatmapLayer({
		id: "mma-heatmap",
		data,
		getPosition: (d: LocPoint) => [d.lng, d.lat],
		getWeight: 1,
		radiusPixels: settings.radiusPixels,
		intensity: settings.intensity,
		threshold: settings.threshold,
		opacity: settings.opacity,
		colorRange: sampleColorRange((GRADIENTS[settings.gradientIndex] ?? GRADIENTS[0]).stops),
		debounceTimeout: 100,
	});

	overlay.setProps({ layers: [layer] });
}

export async function init(): Promise<() => void> {
	const map = MMA.getGoogleMap();
	if (!map) throw new Error("No map instance");

	locStore = await MMA.createLocationStore();

	overlay = new GoogleMapsOverlay({ layers: [] });
	overlay.setMap(map);
	rebuild();

	const unsubStore = locStore.onChange(() => {
		rebuild();
		onSettingsChange?.();
	});
	const unsubSel = MMA.on("selection:change", () => {
		rebuild();
		onSettingsChange?.();
	});

	return () => {
		unsubStore();
		unsubSel();
		locStore?.destroy();
		locStore = null;
		if (overlay) {
			overlay.setMap(null);
			overlay.finalize();
			overlay = null;
		}
		settings = loadSettings();
		scope = { kind: "selected" };
		onSettingsChange = null;
	};
}
