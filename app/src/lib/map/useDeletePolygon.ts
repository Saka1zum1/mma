import { useCallback } from "react";
import { getMapState, removeSelections } from "@/store/useMapStore";
import { polygonSelectionsContaining } from "@/store/selections";
import { useHeldHotkeyClick } from "@/lib/map/useHeldHotkeyClick";

export function useDeletePolygon() {
	useHeldHotkeyClick(
		"deletePolygon",
		useCallback((lat, lng) => {
			const keys = polygonSelectionsContaining(getMapState().selections, lat, lng);
			if (keys.length) void removeSelections(keys);
		}, []),
	);
}
