/**
 * Create / activate Yandex Street View locations from map blank-clicks.
 */
import type { Location } from "@/bindings.gen";
import { log } from "@/lib/util/log";
import { addLocations, setActiveLocation } from "@/store/useMapStore";
import { createLocation, LocationFlag } from "@/types";
import { resolveYandexNear } from "./api";
import { buildYandexExtra } from "./panoExtra";
import { setHotYandexMeta } from "./sessionStore";

/** Create a Yandex location at lat/lng, or null if no coverage. */
export async function createYandexLocationAtLatLng(
	lat: number,
	lng: number,
	radiusM?: number,
): Promise<Location | null> {
	let meta;
	try {
		meta = await resolveYandexNear(lat, lng, radiusM);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		log.warn("[yandex] resolveNear failed:", msg);
		return null;
	}
	if (!meta) return null;

	setHotYandexMeta(meta);

	const loc = createLocation({
		lat: meta.lat,
		lng: meta.lng,
		heading: meta.heading,
		pitch: 0,
		panoId: meta.id,
		provider: "yandex",
		flags: LocationFlag.LoadAsPanoId,
		extra: buildYandexExtra(meta),
	});

	await addLocations([loc]);
	setActiveLocation(loc);
	return loc;
}
