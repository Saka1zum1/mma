import type { LatLng } from "@/types";
import type { Location } from "@/bindings.gen";

export interface ContextMenuTarget {
	location: Location | null;
	latLng: LatLng;
}

let cmTarget: ContextMenuTarget = { location: null, latLng: { lat: 0, lng: 0 } };

export function openContextMenuLatLng(latLng: LatLng) {
	cmTarget = { location: null, latLng };
}

export function openContextMenuLocation(loc: Location) {
	cmTarget = { location: loc, latLng: { lat: loc.lat, lng: loc.lng } };
}

export function getContextMenuTarget() {
	return cmTarget;
}
