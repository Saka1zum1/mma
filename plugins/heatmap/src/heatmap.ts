import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";

export interface HeatmapSettings {
	intensity: number;
	radiusPixels: number;
	opacity: number;
	threshold: number;
	filterTags: Set<number> | null;
}

export const DEFAULT_SETTINGS: HeatmapSettings = {
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
let allLocations: LocPoint[] = [];
let settings: HeatmapSettings = { ...DEFAULT_SETTINGS };
let onSettingsChange: (() => void) | null = null;

export function getSettings(): HeatmapSettings {
	return settings;
}

export function getLocationCount(): number {
	return filterLocations().length;
}

export function setOnSettingsChange(cb: (() => void) | null) {
	onSettingsChange = cb;
}

export function updateSettings(patch: Partial<HeatmapSettings>) {
	settings = { ...settings, ...patch };
	rebuild();
	onSettingsChange?.();
}

function filterLocations(): LocPoint[] {
	const tags = settings.filterTags;
	if (!tags || tags.size === 0) return allLocations;
	return allLocations.filter((loc) => loc.tags.some((t) => tags.has(t)));
}

function rebuild() {
	if (!overlay) return;
	const data = filterLocations();

	const layer = new HeatmapLayer({
		id: "mma-heatmap",
		data,
		getPosition: (d: LocPoint) => [d.lng, d.lat],
		getWeight: 1,
		radiusPixels: settings.radiusPixels,
		intensity: settings.intensity,
		threshold: settings.threshold,
		opacity: settings.opacity,
	});

	overlay.setProps({ layers: [layer] });
}

export async function init(): Promise<() => void> {
	const map = MMA.getGoogleMap();
	if (!map) throw new Error("No map instance");

	allLocations = (await MMA.fetchAllLocations()).map((l) => ({
		lat: l.lat,
		lng: l.lng,
		tags: l.tags,
	}));

	overlay = new GoogleMapsOverlay({ layers: [] });
	overlay.setMap(map);
	rebuild();

	const unsubs = [
		MMA.on("location:add", async () => {
			allLocations = (await MMA.fetchAllLocations()).map((l) => ({
				lat: l.lat,
				lng: l.lng,
				tags: l.tags,
			}));
			rebuild();
			onSettingsChange?.();
		}),
		MMA.on("location:remove", async () => {
			allLocations = (await MMA.fetchAllLocations()).map((l) => ({
				lat: l.lat,
				lng: l.lng,
				tags: l.tags,
			}));
			rebuild();
			onSettingsChange?.();
		}),
	];

	return () => {
		unsubs.forEach((u) => u());
		if (overlay) {
			overlay.setMap(null);
			overlay.finalize();
			overlay = null;
		}
		allLocations = [];
		settings = { ...DEFAULT_SETTINGS };
		onSettingsChange = null;
	};
}
