import type { MapSettings } from "@/bindings.gen";
import { useCurrentMap, updateMapMeta } from "@/store/useMapStore";

/**
 * Reactive accessor for a single per-map setting.
 */
export function useMapSetting<K extends keyof MapSettings>(
	key: K,
): [Exclude<MapSettings[K], undefined>, (v: MapSettings[K]) => void] {
	const map = useCurrentMap();
	const settings = map?.meta.settings;
	const set = (v: MapSettings[K]) => {
		if (settings) updateMapMeta({ settings: { ...settings, [key]: v } });
	};
	// Rust always materializes complete settings, so the value is present
	// whenever a map is open (the only context this hook is used). `Exclude`
	// strips the `undefined` from the optional binding while keeping `| null`.
	return [settings?.[key] as Exclude<MapSettings[K], undefined>, set];
}
