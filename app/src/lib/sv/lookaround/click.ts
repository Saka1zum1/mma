/**
 * Create / activate Apple Look Around locations from map blank-clicks.
 * Pin clicks are handled by mapClick via location.provider — not here.
 */
import type { Location } from "@/bindings.gen";
import { META_OPEN } from "@/lib/sv/lookaround/api";
import { getClosestPano } from "@/lib/sv/lookaround/tile";
import {
	buildPanoExtra,
	headingPitchDeg,
} from "@/lib/sv/lookaround/panoExtra";
import { setHotPano } from "@/lib/sv/lookaround/sessionStore";
import { getProviderSettings } from "@/lib/sv/providers/settings";
import { showToast } from "@/lib/sv/lookup";
import { log } from "@/lib/util/log";
import { getMapHost, getGoogleMap } from "@/lib/map/mapState";
import { addLocations, setActiveLocation } from "@/store/useMapStore";
import { createLocation } from "@/types";

function toastNoAppleCoverage(): void {
	const container = getMapHost()?.container ?? getGoogleMap()?.getDiv?.() ?? null;
	if (container) showToast(container, "No Apple Look Around coverage at this location.", 3000);
}

/**
 * Create (or activate) an Apple Look Around location at lat/lng.
 * @returns the location if created/activated; null if no coverage and fallback allowed;
 *          throws nothing — returns null on hard miss when fallback disabled after toast.
 */
export async function createAppleLocationAtLatLng(
	lat: number,
	lng: number,
): Promise<{ loc: Location | null; consumed: boolean }> {
	let pano;
	try {
		pano = await getClosestPano(lat, lng, META_OPEN);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		log.warn("[lookaround] closest failed:", msg);
		toastNoAppleCoverage();
		return { loc: null, consumed: true };
	}
	if (!pano) {
		if (getProviderSettings("apple").fallbackToGoogle) return { loc: null, consumed: false };
		toastNoAppleCoverage();
		return { loc: null, consumed: true };
	}

	setHotPano(pano);

	const { heading, pitch } = headingPitchDeg(pano);
	const loc = createLocation({
		lat: pano.lat,
		lng: pano.lon,
		heading,
		pitch,
		panoId: pano.panoid,
		provider: "apple",
		extra: buildPanoExtra(pano),
	});

	await addLocations([loc], { hideInDelta: true });
	setActiveLocation(loc);
	return { loc, consumed: true };
}
