import { useCallback } from "react";
import { addSelections } from "@/store/useMapStore";
import { getSettings } from "@/store/settings";
import { cmd } from "@/lib/commands";
import { useHeldHotkeyClick } from "@/lib/map/useHeldHotkeyClick";
import { toast } from "@/lib/util/toast";

export function useCountrySelect() {
	useHeldHotkeyClick(
		"countrySelect",
		useCallback((lat, lng, shiftKey) => {
			const { borderDetail, subdivisionDetail } = getSettings();
			if (shiftKey && subdivisionDetail === "off") {
				toast("Subdivision borders are off — enable them in Settings");
				return;
			}
			const level = shiftKey ? subdivisionDetail : borderDetail;
			void (async () => {
				const lookup = () => cmd.borderLookup(lat, lng, level);
				let geometry;
				try {
					geometry = await lookup();
				} catch (e) {
					if (level === "light" || (await cmd.checkBorderFile(level))) throw e;
					toast("Border data missing -- downloading...");
					try {
						await cmd.downloadBorderFile(level);
					} catch {
						toast("Couldn't download border data -- check your connection");
						return;
					}
					geometry = await lookup();
				}
				if (geometry)
					addSelections([{ type: "Polygon", polygon: geometry, includeInformational: false }]);
			})();
		}, []),
		{ ignoreShift: true },
	);
}
