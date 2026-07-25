import { useCallback } from "react";
import { useMapState } from "@/store/useMapStore";
import { useHotkey } from "@/lib/hooks/useHotkey";
import { useBinding } from "@/lib/util/hotkeys";
import { togglePanoFullscreen, toggleFullscreenMap } from "./fullscreenModeState";

/** Keeps fullscreen-map and pano-fullscreen shortcuts in sync (entering one exits the other). */
export function useFullscreenModeHotkeys() {
	const location = useMapState((s) => s.activeLocation);

	const handleTogglePanoFullscreen = useCallback(() => {
		if (location) togglePanoFullscreen();
	}, [location]);

	const handleToggleMapFullscreen = useCallback(() => {
		toggleFullscreenMap();
	}, []);

	useHotkey(useBinding("toggleFullscreen"), handleTogglePanoFullscreen);
	useHotkey(useBinding("toggleFullscreenMap"), handleToggleMapFullscreen);

	return {
		togglePanoFullscreen: handleTogglePanoFullscreen,
		toggleMapFullscreen: handleToggleMapFullscreen,
	};
}
