import { useCallback } from "react";
import { addSelections } from "@/store/useMapStore";
import { getSettings } from "@/store/settings";
import { cmd } from "@/lib/commands";
import { useHeldHotkeyClick } from "@/lib/map/useHeldHotkeyClick";
import { toast } from "@/lib/util/toast";
import { t } from "@/lib/i18n";

export function useCountrySelect() {
	useHeldHotkeyClick(
		"countrySelect",
		useCallback((lat, lng, shiftKey) => {
			const { borderDetail, subdivisionDetail } = getSettings();
			if (shiftKey && subdivisionDetail === "off") {
				toast(t("toast.subdivisionOff"));
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
					toast(t("toast.borderDownloading"));
					try {
						await cmd.downloadBorderFile(level);
					} catch {
						toast(t("toast.borderDownloadFailed"));
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
