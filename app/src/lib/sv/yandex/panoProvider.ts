/**
 * Register Yandex Street View as a PanoProvider (PSV viewport, like Look Around).
 */
import type { Location } from "@/bindings.gen";
import { registerPanoProvider } from "@/lib/sv/panoProvider";
import { getLocationPanoId, getLocationProvider } from "@/lib/sv/providers/types";
import { getMapState } from "@/store/useMapStore";
import { fetchYandexMeta } from "./api";
import { buildYandexExtra } from "./panoExtra";
import { createYandexPanoramaProxy } from "./panoramaProxy";
import { patchLocationExtra } from "@/lib/sv/lookaround/patchExtra";
import { stripYandex } from "./prefix";
import { YANDEX_CAMERA_BADGE } from "./session";
import { setHotYandexMeta, takeHotYandexMeta } from "./sessionStore";
import { openYandexPano } from "./viewer";
import { MovementPlugin } from "@/lib/sv/lookaround/psv/MovementPlugin";

function bindPsvMovementMode(viewer: unknown, mode: "moving" | "no-move" | "nmpz") {
	const v = viewer as {
		plugins?: { movement?: MovementPlugin };
		getPlugin?: (id: unknown) => MovementPlugin | null;
	};
	const movement = v.getPlugin?.(MovementPlugin) ?? v.plugins?.movement ?? null;
	movement?.setMovementEnabled(mode === "moving");
}

let unregister: (() => void) | null = null;

function spawnPanoId(location: Location): string | null {
	const raw = getLocationPanoId(location);
	return raw ? stripYandex(raw) : null;
}

export function registerYandexPanoProvider(): () => void {
	unregister?.();
	unregister = registerPanoProvider({
		id: "yandex",
		priority: 5,
		dateGranularity: "day",
		ownsExactDate: true,
		canHandle(location: Location) {
			return getLocationProvider(location) === "yandex";
		},
		getSpawnPanoId: spawnPanoId,
		buildSaveExtra(_location, panoId) {
			const id = stripYandex(panoId);
			return id ? { cameraType: "yandex" } : {};
		},
		resolveCameraBadge(panoId, location, entryCameraType) {
			if (entryCameraType === "yandex" || entryCameraType == null) {
				const spawn = spawnPanoId(location);
				if (!spawn || stripYandex(panoId) === spawn || entryCameraType === "yandex") {
					return YANDEX_CAMERA_BADGE;
				}
			}
			return entryCameraType === "yandex" ? YANDEX_CAMERA_BADGE : null;
		},
		async open(host, location) {
			host.replaceChildren();
			const container = document.createElement("div");
			Object.assign(container.style, {
				position: "absolute",
				inset: "0",
				width: "100%",
				height: "100%",
				background: "#000",
			});
			host.appendChild(container);

			const savedId = spawnPanoId(location);
			let meta = takeHotYandexMeta(savedId);
			if (!meta && savedId) meta = await fetchYandexMeta(savedId);
			if (!meta) {
				throw new Error("Yandex panorama not found");
			}
			setHotYandexMeta(meta);

			const handle = await openYandexPano(container, meta);
			const proxy = createYandexPanoramaProxy(handle, meta);
			const panorama = proxy.panorama;

			if (location.heading != null || location.pitch != null) {
				panorama.setPov({
					heading: location.heading ?? meta.heading,
					pitch: location.pitch ?? 0,
				});
			} else {
				panorama.setPov({ heading: meta.heading, pitch: 0 });
			}
			if (location.zoom != null) panorama.setZoom(location.zoom);

			const active = getMapState().activeLocation;
			if (active) void patchLocationExtra(active, buildYandexExtra(meta));

			const resize = () => {
				try {
					handle.viewer.autoSize();
					handle.viewer.needsUpdate();
				} catch {
					/* ignore */
				}
			};

			return {
				panorama,
				viewport: container,
				resize,
				setMovementMode: (mode) => bindPsvMovementMode(handle.viewer, mode),
				getAlternateDates: proxy.getAlternateDates,
				subscribeAlternateDates: proxy.subscribeAlternateDates,
				getAltitude: proxy.getAltitude,
				destroy() {
					proxy.destroy();
					// PSV aborts in-flight texture loads asynchronously on destroy.
					const swallowAbort = (e: PromiseRejectionEvent) => {
						const r = e.reason;
						if (r instanceof Error && r.name === "AbortError") e.preventDefault();
					};
					window.addEventListener("unhandledrejection", swallowAbort);
					try {
						handle.destroy();
					} catch {
						/* ignore */
					}
					queueMicrotask(() => window.removeEventListener("unhandledrejection", swallowAbort));
					setTimeout(() => window.removeEventListener("unhandledrejection", swallowAbort), 100);
					container.remove();
				},
			};
		},
	});

	return () => {
		unregister?.();
		unregister = null;
	};
}
