import { useEffect, useLayoutEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import type { Location } from "@/bindings.gen";
import { createLocation, LocationFlag } from "@/types";
import { getPanorama, singletonDiv, applyResolved } from "@/lib/sv/panoSingleton";
import { loadOpenSV, google } from "@/lib/sv/opensv";
import { resolvePano } from "@/lib/sv/lookup";
import { findPanoProvider, setActivePanoViewport, type PanoProviderSession } from "@/lib/sv/panoProvider";
import { getLocationProvider } from "@/lib/sv/providers/types";
import { ensureProviderEnabled } from "@/lib/sv/providers/settings";
import { installGoogleInjectBridge } from "@/lib/sv/providers/googleInject";
import type { MovementMode, RoundLocation } from "./GameState";

function toLocation(r: RoundLocation): Location {
	return createLocation({
		id: r.id,
		lat: r.lat,
		lng: r.lng,
		heading: r.heading,
		pitch: r.pitch,
		zoom: r.zoom,
		panoId: r.panoId,
		provider: r.provider,
		flags: r.panoId ? LocationFlag.LoadAsPanoId : LocationFlag.None,
	});
}

function applyGoogleMovementOptions(pano: google.maps.StreetViewPanorama, mode: MovementMode) {
	const moving = mode === "moving";
	pano.setOptions({
		linksControl: moving,
		clickToGo: moving,
		scrollwheel: mode !== "nmpz",
		addressControl: false,
		zoomControl: false,
		fullscreenControl: false,
		showRoadLabels: false,
		enableCloseButton: false,
	});
}

function applySessionMovement(session: PanoProviderSession | null, mode: MovementMode) {
	session?.setMovementMode?.(mode);
	if (session?.panorama) applyGoogleMovementOptions(session.panorama, mode);
}

export interface GamePanoHandle {
	returnToSpawn: () => void;
	setCheckpoint: () => void;
	returnToCheckpoint: () => void;
	hasCheckpoint: () => boolean;
	getPanorama: () => google.maps.StreetViewPanorama | null;
	/**
	 * True when the active viewport uses the Google SV WebGL material pipeline
	 * (native Google + Baidu/Tencent inject). False for Photo Sphere Viewer sessions
	 * (Apple / Yandex), where the NO_CAR shader must not be applied.
	 */
	supportsHideCar: () => boolean;
}

export const GamePanoView = forwardRef<
	GamePanoHandle,
	{
		round: RoundLocation;
		movementMode: MovementMode;
		onReady?: (ready: boolean) => void;
		onPanorama?: (pano: google.maps.StreetViewPanorama | null) => void;
	}
>(function GamePanoView({ round, movementMode, onReady, onPanorama }, ref) {
	const hostRef = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<string | null>(null);
	const sessionRef = useRef<PanoProviderSession | null>(null);
	const spawnRef = useRef({
		panoId: round.panoId as string | null,
		heading: round.heading,
		pitch: round.pitch,
		zoom: round.zoom,
		lat: round.lat,
		lng: round.lng,
	});
	const checkpointRef = useRef<typeof spawnRef.current | null>(null);

	const getActivePano = useCallback(
		() => sessionRef.current?.panorama ?? getPanorama(),
		[],
	);

	const restoreView = useCallback((target: typeof spawnRef.current) => {
		const pano = getActivePano();
		if (!pano) return;
		if (target.panoId) {
			try {
				pano.setPano(target.panoId);
			} catch {
				try {
					pano.setPosition({ lat: target.lat, lng: target.lng });
				} catch {
					/* ignore */
				}
			}
		} else {
			try {
				pano.setPosition({ lat: target.lat, lng: target.lng });
			} catch {
				/* ignore */
			}
		}
		pano.setPov({ heading: target.heading, pitch: target.pitch });
		pano.setZoom(target.zoom);
	}, [getActivePano]);

	useImperativeHandle(
		ref,
		() => ({
			returnToSpawn: () => restoreView(spawnRef.current),
			setCheckpoint: () => {
				const pano = getActivePano();
				if (!pano) return;
				const pos = pano.getPosition();
				checkpointRef.current = {
					panoId: pano.getPano() ?? null,
					heading: pano.getPov().heading,
					pitch: pano.getPov().pitch,
					zoom: pano.getZoom(),
					lat: pos?.lat() ?? spawnRef.current.lat,
					lng: pos?.lng() ?? spawnRef.current.lng,
				};
			},
			returnToCheckpoint: () => {
				if (checkpointRef.current) restoreView(checkpointRef.current);
			},
			hasCheckpoint: () => checkpointRef.current != null,
			getPanorama: getActivePano,
			// Google + Baidu/Tencent inject: no PSV viewport → Google material pipeline.
			// Apple/Yandex PSV: own WebGL context; NO_CAR shader must not be applied.
			supportsHideCar: () => !sessionRef.current?.viewport,
		}),
		[getActivePano, restoreView],
	);

	useLayoutEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		let cancelled = false;
		let statusListener: google.maps.MapsEventListener | null = null;
		let resizeObs: ResizeObserver | null = null;

		const cleanup = () => {
			cancelled = true;
			resizeObs?.disconnect();
			resizeObs = null;
			if (statusListener) {
				try {
					statusListener.remove();
				} catch {
					/* ignore */
				}
				statusListener = null;
			}
			setActivePanoViewport(null);
			if (sessionRef.current) {
				try {
					sessionRef.current.destroy();
				} catch {
					/* ignore */
				}
				sessionRef.current = null;
			}
			if (host.contains(singletonDiv)) {
				host.removeChild(singletonDiv);
				const previewHost = document.querySelector(".location-preview__pano-host");
				if (previewHost && !previewHost.contains(singletonDiv)) {
					previewHost.appendChild(singletonDiv);
					const p = getPanorama();
					if (p) {
						p.setVisible(true);
						google.maps.event.trigger(p, "resize");
					}
				}
			}
			onPanorama?.(null);
			onReady?.(false);
		};

		const loc = toLocation(round);
		spawnRef.current = {
			panoId: round.panoId,
			heading: round.heading,
			pitch: round.pitch,
			zoom: round.zoom,
			lat: round.lat,
			lng: round.lng,
		};
		checkpointRef.current = null;
		setError(null);
		onReady?.(false);

		const scheduleResize = (session: PanoProviderSession | null) => {
			requestAnimationFrame(() => {
				session?.resize?.();
				const pano = session?.panorama ?? getPanorama();
				if (pano) google.maps.event.trigger(pano, "resize");
			});
		};

		const provider = findPanoProvider(loc);
		if (provider) {
			ensureProviderEnabled(getLocationProvider(loc));
			host.replaceChildren();
			void provider
				.open(host, loc)
				.then((session) => {
					if (cancelled) {
						session.destroy();
						return;
					}
					sessionRef.current = session;
					const pano = session.panorama;
					containerFocus(session.viewport ?? host);
					setActivePanoViewport(session.viewport ?? host, session.resize ?? null);
					applySessionMovement(session, movementMode);
					onPanorama?.(pano);
					onReady?.(true);
					spawnRef.current = {
						...spawnRef.current,
						panoId: pano.getPano() ?? round.panoId,
					};
					scheduleResize(session);
					resizeObs = new ResizeObserver(() => scheduleResize(sessionRef.current));
					resizeObs.observe(host);
				})
				.catch((err) => {
					if (cancelled) return;
					setError(err instanceof Error ? err.message : "Failed to open panorama");
					onReady?.(false);
				});
			return cleanup;
		}

		ensureProviderEnabled(getLocationProvider(loc));
		host.replaceChildren();

		void loadOpenSV().then(async () => {
			if (cancelled || !google?.maps) return;

			const injectProvider = getLocationProvider(loc);
			if (injectProvider === "baidu" || injectProvider === "tencent") {
				await installGoogleInjectBridge();
			}

			// Ensure singletonDiv is ready — reset any stale size/graphics state
			// from a previous PSV provider before appending.
			singletonDiv.style.width = `${host.clientWidth}px`;
			singletonDiv.style.height = `${host.clientHeight}px`;
			host.appendChild(singletonDiv);

			// Brief delay lets the DOM layout settle after reparenting.
			await new Promise((r) => setTimeout(r, 50));
			if (cancelled) return;

			const pano = getPanorama();
			if (!pano) {
				setError("Street View unavailable");
				return;
			}
			pano.setVisible(true);
			applyGoogleMovementOptions(pano, movementMode);
			google.maps.event.trigger(pano, "resize");
			onPanorama?.(pano);

			try {
				const result = await resolvePano(loc);
				if (cancelled) return;
				if (!result.pano) {
					setError("No panorama found");
					onReady?.(false);
					return;
				}
				applyResolved(pano, result, loc);
				applyGoogleMovementOptions(pano, movementMode);
				google.maps.event.trigger(pano, "resize");
				statusListener = pano.addListener("status_changed", () => {
					if (cancelled || pano.getStatus() !== "OK") return;
					onReady?.(true);
					spawnRef.current = {
						...spawnRef.current,
						panoId: pano.getPano() ?? round.panoId,
					};
					applyGoogleMovementOptions(pano, movementMode);
				});
				if (pano.getStatus() === "OK") {
					onReady?.(true);
					spawnRef.current = {
						...spawnRef.current,
						panoId: pano.getPano() ?? round.panoId,
					};
				}
				resizeObs = new ResizeObserver(() => {
					google.maps.event.trigger(pano, "resize");
					sessionRef.current?.resize?.();
				});
				resizeObs.observe(host);
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : "Failed to load panorama");
				onReady?.(false);
			}
		});

		return cleanup;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [round.id, movementMode]);

	useEffect(() => {
		applySessionMovement(sessionRef.current, movementMode);
		const pano = getActivePano();
		if (pano && !sessionRef.current?.setMovementMode) {
			applyGoogleMovementOptions(pano, movementMode);
		}
	}, [movementMode, getActivePano]);

	return (
		<div className="gg-pano">
			<div ref={hostRef} className="gg-pano__host" />
			{error && <div className="gg-pano__error">{error}</div>}
		</div>
	);
});

function containerFocus(el: HTMLElement) {
	if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
	try {
		el.focus({ preventScroll: true });
	} catch {
		/* ignore */
	}
}
