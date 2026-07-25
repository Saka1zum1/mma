/**
 * Duck-typed StreetViewPanorama over the Yandex Photo Sphere Viewer.
 */
import { getMapState } from "@/store/useMapStore";
import { SV_JUMP_RADIUS } from "@/lib/sv/constants";
import type { PanoDateEntry } from "@/lib/sv/panoProvider";
import type { YandexPanoMeta } from "./api";
import { fetchYandexMeta, resolveYandexNear } from "./api";
import { buildYandexExtra } from "./panoExtra";
import { patchLocationExtra } from "@/lib/sv/lookaround/patchExtra";
import type { YandexViewerHandle } from "./viewer";
import { compassToPsvYaw, psvYawToCompass } from "./psv/orientation";
import { yandexTimelineEntries } from "./service";

type ListenerMap = Map<string, Set<() => void>>;

export interface YandexPanoramaProxy {
	panorama: google.maps.StreetViewPanorama & { __destroyProxy?: () => void };
	getAlternateDates(): PanoDateEntry[];
	subscribeAlternateDates(cb: () => void): () => void;
	getAltitude(): number | null;
	spawnPanoId: string;
	destroy(): void;
}

function toGoogleLatLng(lat: number, lng: number): google.maps.LatLng {
	const g = (globalThis as { google?: typeof google }).google;
	if (g?.maps?.LatLng) return new g.maps.LatLng(lat, lng);
	return {
		lat: () => lat,
		lng: () => lng,
		toJSON: () => ({ lat, lng }),
	} as google.maps.LatLng;
}

function streetViewLinks(meta: YandexPanoMeta): google.maps.StreetViewLink[] {
	const byOid = new Map<string, google.maps.StreetViewLink>();
	for (const l of [...meta.links, ...meta.neighbors]) {
		if (!l.oid || byOid.has(l.oid)) continue;
		byOid.set(l.oid, {
			pano: l.oid,
			heading: Number.isFinite(l.heading) ? l.heading : 0,
			description: l.description ?? "",
		});
	}
	return [...byOid.values()];
}

export function createYandexPanoramaProxy(
	viewer: YandexViewerHandle,
	initial: YandexPanoMeta,
): YandexPanoramaProxy {
	let meta = initial;
	const spawnPanoId = initial.id;
	const listeners: ListenerMap = new Map();
	let zoom = 1;
	const metaById = new Map<string, YandexPanoMeta>([[initial.id, initial]]);
	const dateListeners = new Set<() => void>();
	let alternateDates = yandexTimelineEntries(initial);
	let links = streetViewLinks(initial);

	const emit = (event: string) => {
		const set = listeners.get(event);
		if (!set) return;
		for (const cb of [...set]) cb();
	};

	const onPsvPosition = () => emit("pov_changed");
	const onPsvZoom = () => {
		zoom = viewer.getZoomLevel() / 50;
		emit("zoom_changed");
	};

	viewer.addEventListener("position-updated", onPsvPosition);
	viewer.addEventListener("zoom-updated", onPsvZoom);

	const applyMeta = (next: YandexPanoMeta) => {
		meta = next;
		metaById.set(next.id, next);
		for (const t of next.timeline) {
			if (!metaById.has(t.oid)) {
				/* timeline ids resolve on demand via setPano */
			}
		}
		alternateDates = yandexTimelineEntries(next);
		links = streetViewLinks(next);
		for (const cb of [...dateListeners]) cb();
		emit("links_changed");

		const active = getMapState().activeLocation;
		if (active) void patchLocationExtra(active, buildYandexExtra(next));
	};

	viewer.onMetaChanged = (next) => {
		applyMeta(next);
		emit("pano_changed");
		emit("position_changed");
		emit("status_changed");
	};

	queueMicrotask(() => {
		for (const cb of [...dateListeners]) cb();
		emit("status_changed");
		emit("pov_changed");
	});

	const api = {
		getPov: () => {
			const pos = viewer.getPosition();
			return {
				// PSV yaw 0 = image centre; expose true compass for UI / hotkeys.
				heading: psvYawToCompass(pos.yaw, meta.heading),
				pitch: (pos.pitch * 180) / Math.PI,
			};
		},
		setPov: (pov: google.maps.StreetViewPov) => {
			viewer.rotate({
				yaw: compassToPsvYaw(Number(pov.heading ?? 0), meta.heading),
				pitch: (Number(pov.pitch ?? 0) * Math.PI) / 180,
			});
			emit("pov_changed");
		},
		getZoom: () => zoom,
		setZoom: (z: number) => {
			zoom = z;
			viewer.zoom(Math.max(0, Math.min(100, z * 50)));
			emit("zoom_changed");
		},
		getPosition: () => toGoogleLatLng(meta.lat, meta.lng),
		setPosition: (latLng: google.maps.LatLng | google.maps.LatLngLiteral) => {
			// PanoControls jump forward/back calls setPosition(~100 m along POV).
			// Resolve nearest Yandex coverage and navigate in-viewer (Look Around parity).
			const lat =
				typeof (latLng as google.maps.LatLng).lat === "function"
					? (latLng as google.maps.LatLng).lat()
					: Number((latLng as google.maps.LatLngLiteral).lat);
			const lng =
				typeof (latLng as google.maps.LatLng).lng === "function"
					? (latLng as google.maps.LatLng).lng()
					: Number((latLng as google.maps.LatLngLiteral).lng);
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
			void resolveYandexNear(lat, lng, SV_JUMP_RADIUS * 1.5).then((next) => {
				if (!next || next.id === meta.id) return;
				metaById.set(next.id, next);
				void viewer.navigateTo(next, false);
			});
		},
		getPano: () => meta.id,
		setPano: (id: string) => {
			if (!id || id === meta.id) return;
			const cached = metaById.get(id);
			if (cached) {
				void viewer.navigateTo(cached, false);
				return;
			}
			void fetchYandexMeta(id).then((next) => {
				if (!next) return;
				metaById.set(next.id, next);
				void viewer.navigateTo(next, false);
			});
		},
		getLocation: () =>
			({
				description: meta.name || "Yandex Panorama",
				pano: meta.id,
				latLng: api.getPosition(),
			}) as google.maps.StreetViewLocation,
		getLinks: () => links,
		getStatus: () => "OK" as google.maps.StreetViewStatus,
		setVisible: (_v: boolean) => {},
		getVisible: () => true,
		setOptions: (opts: google.maps.StreetViewPanoramaOptions) => {
			if (opts.pov) api.setPov(opts.pov);
			if (opts.zoom != null) api.setZoom(opts.zoom);
		},
		addListener: (eventName: string, handler: () => void) => {
			let set = listeners.get(eventName);
			if (!set) {
				set = new Set();
				listeners.set(eventName, set);
			}
			set.add(handler);
			if (eventName === "status_changed") queueMicrotask(() => handler());
			return { remove: () => set!.delete(handler) } as google.maps.MapsEventListener;
		},
		__destroyProxy: () => {
			viewer.removeEventListener("position-updated", onPsvPosition);
			viewer.removeEventListener("zoom-updated", onPsvZoom);
			viewer.onMetaChanged = null;
			listeners.clear();
			dateListeners.clear();
		},
	};

	return {
		panorama: api as unknown as google.maps.StreetViewPanorama & {
			__destroyProxy?: () => void;
		},
		getAlternateDates: () => alternateDates,
		subscribeAlternateDates: (cb: () => void) => {
			dateListeners.add(cb);
			queueMicrotask(() => cb());
			return () => dateListeners.delete(cb);
		},
		getAltitude: () => null,
		spawnPanoId,
		destroy() {
			api.__destroyProxy();
		},
	};
}
