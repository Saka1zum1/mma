import { useEffect } from "react";
import { setClickInterceptor } from "@/lib/map/mapState";
import { selectPolygon } from "@/store/useMapStore";
import { getBinding } from "@/lib/util/hotkeys";
import { parseHotkey, matchesKey, isEditableElement } from "@/lib/hooks/useHotkey";
import { getSettings } from "@/store/settings";
import { cmd } from "@/lib/commands";

export function useCountrySelect() {
	useEffect(() => {
		let held = false;

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.repeat || isEditableElement(e.target)) return;
			const binding = getBinding("countrySelect");
			if (!binding) return;
			const parsed = parseHotkey(binding);
			for (const alt of parsed) {
				if (alt.length === 1 && matchesKey(e, alt[0])) {
					held = true;
					document.body.style.cursor = "crosshair";
					return;
				}
			}
		};

		const onKeyUp = (e: KeyboardEvent) => {
			if (!held) return;
			const binding = getBinding("countrySelect");
			if (!binding) return;
			const parsed = parseHotkey(binding);
			for (const alt of parsed) {
				if (alt.length === 1 && e.key.toLowerCase() === alt[0].key) {
					held = false;
					document.body.style.cursor = "";
					return;
				}
			}
		};

		const onBlur = () => {
			if (held) {
				held = false;
				document.body.style.cursor = "";
			}
		};

		const interceptor = (lat: number, lng: number): boolean => {
			if (!held) return false;
			const { borderDetail } = getSettings();
			(async () => {
				const geometry = await cmd.borderLookup(lat, lng, borderDetail);
				if (geometry) selectPolygon(geometry, false);
			})();
			return true;
		};

		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", onBlur);
		setClickInterceptor(interceptor);

		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", onBlur);
			setClickInterceptor(null);
			document.body.style.cursor = "";
		};
	}, []);
}
