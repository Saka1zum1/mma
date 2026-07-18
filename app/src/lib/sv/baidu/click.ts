/**
 * Create / activate Baidu Street View locations from map blank-clicks.
 */
import type { Location } from "@/bindings.gen";
import { resolveBaiduNear } from "@/lib/sv/baidu/api";
import { buildBaiduExtra } from "@/lib/sv/baidu/panoExtra";
import { getProviderSettings } from "@/lib/sv/providers/settings";
import { showToast } from "@/lib/sv/lookup";
import { log } from "@/lib/util/log";
import { getMapHost, getGoogleMap } from "@/lib/map/mapState";
import { addLocations, setActiveLocation } from "@/store/useMapStore";
import { createLocation } from "@/types";

function toastNoBaiduCoverage(): void {
	const container = getMapHost()?.container ?? getGoogleMap()?.getDiv?.() ?? null;
	if (container) showToast(container, "No Baidu Street View coverage at this location.", 3000);
}

export async function createBaiduLocationAtLatLng(
	lat: number,
	lng: number,
): Promise<{ loc: Location | null; consumed: boolean }> {
	let meta;
	try {
		meta = await resolveBaiduNear(lat, lng);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		log.warn("[baidu] search failed:", msg);
		toastNoBaiduCoverage();
		return { loc: null, consumed: true };
	}
	if (!meta) {
		if (getProviderSettings("baidu").fallbackToGoogle) return { loc: null, consumed: false };
		toastNoBaiduCoverage();
		return { loc: null, consumed: true };
	}

	const loc = createLocation({
		lat: meta.lat,
		lng: meta.lng,
		heading: meta.heading,
		pitch: meta.pitch,
		panoId: meta.id,
		provider: "baidu",
		extra: buildBaiduExtra(meta),
	});

	await addLocations([loc], { hideInDelta: true });
	setActiveLocation(loc);
	return { loc, consumed: true };
}
