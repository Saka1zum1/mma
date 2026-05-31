import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";

export interface HeatmapSettings {
	visible: boolean;
	intensity: number;
	radiusPixels: number;
	opacity: number;
	threshold: number;
	filterTags: Set<number> | null;
}

export const DEFAULT_SETTINGS: HeatmapSettings = {
	visible: true,
	intensity: 1,
	radiusPixels: 30,
	opacity: 0.6,
	threshold: 0.05,
	filterTags: null,
};

interface LocPoint {
	lat: number;
	lng: number;
	tags: number[];
}

let overlay: GoogleMapsOverlay | null = null;
let locStore: { locations: Map<number, unknown>; onChange(cb: () => void): () => void; destroy(): void } | null = null;
let settings: HeatmapSettings = { ...DEFAULT_SETTINGS };
let onSettingsChange: (() => void) | null = null;

export function getSettings(): HeatmapSettings {
	return settings;
}

export function getLocationCount(): number {
	return filterLocations(allLocations()).length;
}

function allLocations(): LocPoint[] {
	if (!locStore) return [];
	const out: LocPoint[] = [];
	for (const l of locStore.locations.values()) {
		const loc = l as { lat: number; lng: number; tags: number[] };
		out.push({ lat: loc.lat, lng: loc.lng, tags: loc.tags });
	}
	return out;
}

export function setOnSettingsChange(cb: (() => void) | null) {
	onSettingsChange = cb;
}

export function updateSettings(patch: Partial<HeatmapSettings>) {
	settings = { ...settings, ...patch };
	rebuild();
	onSettingsChange?.();
}

function filterLocations(locs: LocPoint[]): LocPoint[] {
	const tags = settings.filterTags;
	if (!tags || tags.size === 0) return locs;
	return locs.filter((loc) => loc.tags.some((t) => tags.has(t)));
}

function rebuild() {
	if (!overlay) return;
	if (!settings.visible) {
		overlay.setProps({ layers: [] });
		return;
	}
	const data = filterLocations(allLocations());

	const layer = new HeatmapLayer({
		id: "mma-heatmap",
		data,
		getPosition: (d: LocPoint) => [d.lng, d.lat],
		getWeight: 1,
		radiusPixels: settings.radiusPixels,
		intensity: settings.intensity,
		threshold: settings.threshold,
		opacity: settings.opacity,
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

	return () => {
		unsubStore();
		locStore?.destroy();
		locStore = null;
		if (overlay) {
			overlay.setMap(null);
			overlay.finalize();
			overlay = null;
		}
		settings = { ...DEFAULT_SETTINGS };
		onSettingsChange = null;
	};
}
