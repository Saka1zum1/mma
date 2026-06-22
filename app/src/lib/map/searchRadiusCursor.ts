// A cursor-following circle showing the exact radius a click would search for SV coverage.
// Self-contained overlay (own GoogleMapsOverlay + listeners) so the high-frequency updates
// never touch the core scene render.
//
// We track the cursor as a container *pixel* (not a frozen lat/lng): on every zoom/pan we
// reproject that pixel to a fresh lat/lng, so the ring stays under the cursor and resizes
// live mid-zoom instead of waiting for the next mousemove.

import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { ScatterplotLayer } from "@deck.gl/layers";
import { clickSearchRadius } from "@/lib/sv/lookup";
import { getGoogleMap } from "@/lib/map/mapState";
import { getCurrentMap } from "@/store/useMapStore";
import { google } from "@/lib/sv/opensv";

const LAYER_ID = "mma-search-radius-cursor";

/** Mount the cursor picker. Returns a teardown for the caller's effect cleanup. */
export function mountSearchRadiusCursor(): () => void {
	const map = getGoogleMap();
	if (!map) return () => {};
	const gmap: google.maps.Map = map;

	const overlay = new GoogleMapsOverlay({ layers: [] });
	overlay.setMap(gmap);

	// A bare OverlayView purely to borrow the live container-pixel <-> latLng projection.
	const projector = new google.maps.OverlayView();
	projector.onAdd = () => {};
	projector.onRemove = () => {};
	projector.draw = () => {};
	projector.setMap(gmap);

	let pixel: google.maps.Point | null = null;

	function render() {
		const projection = projector.getProjection();
		if (!pixel || !projection) return;
		const latLng = projection.fromContainerPixelToLatLng(pixel);
		if (!latLng) return;
		const zoom = gmap.getZoom() ?? 2;
		const minRadius = getCurrentMap()?.meta.settings.searchRadius ?? undefined;
		const radius = clickSearchRadius(latLng.lat(), zoom, minRadius);
		overlay.setProps({
			layers: [
				new ScatterplotLayer<{ lat: number; lng: number }>({
					id: LAYER_ID,
					data: [{ lat: latLng.lat(), lng: latLng.lng() }],
					getPosition: (d) => [d.lng, d.lat],
					getRadius: radius,
					radiusUnits: "meters",
					getFillColor: [0, 140, 255, 40],
					getLineColor: [0, 140, 255, 170],
					stroked: true,
					filled: true,
					lineWidthMinPixels: 1,
					pickable: false,
				}),
			],
		});
	}

	const div = gmap.getDiv();
	const onMove = (e: MouseEvent) => {
		const rect = div.getBoundingClientRect();
		pixel = new google.maps.Point(e.clientX - rect.left, e.clientY - rect.top);
		render();
	};
	const onLeave = () => {
		pixel = null;
		overlay.setProps({ layers: [] });
	};
	div.addEventListener("mousemove", onMove);
	div.addEventListener("mouseleave", onLeave);

	// Reproject the held pixel as the camera moves so the ring tracks the cursor mid-zoom/pan.
	const onCamera = gmap.addListener("bounds_changed", render);

	return () => {
		div.removeEventListener("mousemove", onMove);
		div.removeEventListener("mouseleave", onLeave);
		google.maps.event.removeListener(onCamera);
		projector.setMap(null);
		overlay.setMap(null);
		overlay.finalize();
	};
}
