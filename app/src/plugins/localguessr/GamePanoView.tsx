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
import { t } from "@/lib/i18n";
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
	undoMove: () => void;
	canUndoMove: () => boolean;
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
		onCanUndoChange?: (canUndo: boolean) => void;
	}
>(function GamePanoView({ round, movementMode, onReady, onPanorama, onCanUndoChange }, ref) {
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
	const currentPanoIdRef = useRef<string | null>(null);
	const panoHistoryRef = useRef<string[]>([]);
	const isRestoringRef = useRef(false);
	/** Suppress history while the round's spawn pano is still loading onto the singleton. */
	const isInitializingRef = useRef(false);
	const onCanUndoChangeRef = useRef(onCanUndoChange);
	onCanUndoChangeRef.current = onCanUndoChange;

	const getActivePano = useCallback(
		() => sessionRef.current?.panorama ?? getPanorama(),
		[],
	);

	const emitCanUndo = useCallback(() => {
		onCanUndoChangeRef.current?.(panoHistoryRef.current.length > 0);
	}, []);

	const clearUndoHistory = useCallback(() => {
		panoHistoryRef.current = [];
		emitCanUndo();
	}, [emitCanUndo]);

	const initializeSpawnPano = useCallback((pano: google.maps.StreetViewPanorama) => {
		const panoId = pano.getPano() ?? null;
		// status_changed also fires after every move; only seed undo baseline on first load.
		if (!isInitializingRef.current) {
			if (!spawnRef.current.panoId && panoId) spawnRef.current.panoId = panoId;
			return;
		}
		// Adopt the live pano as spawn. If the round's stored panoId was invalid,
		// resolvePano falls back to a nearby location — that fallback becomes spawn.
		if (panoId) spawnRef.current.panoId = panoId;
		currentPanoIdRef.current = panoId;
		clearUndoHistory();
		isInitializingRef.current = false;
	}, [clearUndoHistory]);

	const recordPanoChange = useCallback(() => {
		if (isRestoringRef.current || isInitializingRef.current) return;
		const pano = getActivePano();
		if (!pano) return;
		const nextPanoId = pano.getPano() ?? null;
		const previousPanoId = currentPanoIdRef.current;
		if (!previousPanoId || previousPanoId === nextPanoId) {
			currentPanoIdRef.current = nextPanoId;
			return;
		}
		panoHistoryRef.current.push(previousPanoId);
		if (panoHistoryRef.current.length > 50) panoHistoryRef.current.shift();
		currentPanoIdRef.current = nextPanoId;
		emitCanUndo();
	}, [getActivePano, emitCanUndo]);

	const restoreView = useCallback((target: typeof spawnRef.current) => {
		const pano = getActivePano();
		if (!pano) return;
		isRestoringRef.current = true;
		try {
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
		} finally {
			isRestoringRef.current = false;
			if (target.panoId) {
				currentPanoIdRef.current = target.panoId;
			}
		}
	}, [getActivePano]);

	const restorePano = useCallback((panoId: string | null) => {
		if (!panoId) return;
		const pano = getActivePano();
		if (!pano) return;
		isRestoringRef.current = true;
		try {
			pano.setPano(panoId);
		} finally {
			isRestoringRef.current = false;
			currentPanoIdRef.current = panoId;
		}
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
			undoMove: () => {
				const previous = panoHistoryRef.current.pop() ?? null;
				if (previous) {
					restorePano(previous);
					emitCanUndo();
				}
			},
			canUndoMove: () => panoHistoryRef.current.length > 0,
			hasCheckpoint: () => checkpointRef.current != null,
			getPanorama: getActivePano,
			// Google + Baidu/Tencent inject: no PSV viewport → Google material pipeline.
			// Apple/Yandex PSV: own WebGL context; NO_CAR shader must not be applied.
			supportsHideCar: () => !sessionRef.current?.viewport,
		}),
		[getActivePano, restoreView, restorePano, emitCanUndo],
	);

	// Unmount-only: return the shared Street View singleton to the editor preview.
	// Round changes must NOT reparent it — that thrash loses the WebGL context and
	// can white-screen the app map / editor pano as well.
	useLayoutEffect(() => {
		return () => {
			setActivePanoViewport(null);
			if (sessionRef.current) {
				try {
					sessionRef.current.destroy();
				} catch {
					/* ignore */
				}
				sessionRef.current = null;
			}
			singletonDiv.style.width = "100%";
			singletonDiv.style.height = "100%";
			const previewHost = document.querySelector(".location-preview__pano-host");
			// Singleton may be in the game host, parked off-DOM (after a PSV round),
			// or already back in the preview — always restore it for the editor.
			if (previewHost) {
				if (singletonDiv.parentElement && singletonDiv.parentElement !== previewHost) {
					singletonDiv.remove();
				}
				if (!previewHost.contains(singletonDiv)) {
					previewHost.appendChild(singletonDiv);
				}
				requestAnimationFrame(() => {
					const p = getPanorama();
					if (p) {
						p.setVisible(true);
						google.maps.event.trigger(p, "resize");
					}
				});
			}
			onPanorama?.(null);
			onReady?.(false);
			onCanUndoChangeRef.current?.(false);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
	}, []);

	// Per-round load: swap panorama content in-place without reparenting the canvas
	// back to the editor (except when this component fully unmounts).
	useLayoutEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		let cancelled = false;
		let statusListener: google.maps.MapsEventListener | null = null;
		let resizeObs: ResizeObserver | null = null;
		const viewListeners: google.maps.MapsEventListener[] = [];

		const cleanupRound = () => {
			cancelled = true;
			resizeObs?.disconnect();
			resizeObs = null;
			for (const listener of viewListeners) {
				try {
					listener.remove();
				} catch {
					/* ignore */
				}
			}
			viewListeners.length = 0;
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
		currentPanoIdRef.current = null;
		isInitializingRef.current = true;
		clearUndoHistory();
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
			setActivePanoViewport(null);
			// Detach shared Google canvas without returning it to the editor preview.
			if (host.contains(singletonDiv)) singletonDiv.remove();
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
					isInitializingRef.current = false;
					clearUndoHistory();
					currentPanoIdRef.current = spawnRef.current.panoId;
					scheduleResize(session);
					resizeObs = new ResizeObserver(() => scheduleResize(sessionRef.current));
					resizeObs.observe(host);
				})
				.catch((err) => {
					if (cancelled) return;
					setError(err instanceof Error ? err.message : t("Failed to open panorama"));
					onReady?.(false);
				});
			return cleanupRound;
		}

		ensureProviderEnabled(getLocationProvider(loc));
		// Keep the singleton canvas in this host; only clear foreign provider nodes.
		if (!host.contains(singletonDiv)) {
			host.replaceChildren();
			singletonDiv.style.width = `${host.clientWidth || 1}px`;
			singletonDiv.style.height = `${host.clientHeight || 1}px`;
			host.appendChild(singletonDiv);
		} else {
			for (const child of [...host.children]) {
				if (child !== singletonDiv) child.remove();
			}
		}

		void loadOpenSV().then(async () => {
			if (cancelled || !google?.maps) return;

			const injectProvider = getLocationProvider(loc);
			if (injectProvider === "baidu" || injectProvider === "tencent") {
				await installGoogleInjectBridge();
			}

			const pano = getPanorama();
			if (!pano) {
				setError(t("Street View unavailable"));
				return;
			}
			viewListeners.push(pano.addListener("pano_changed", recordPanoChange));
			pano.setVisible(true);
			applyGoogleMovementOptions(pano, movementMode);
			google.maps.event.trigger(pano, "resize");
			onPanorama?.(pano);

			try {
				const result = await resolvePano(loc);
				if (cancelled) return;
				if (!result.pano) {
					setError(t("No panorama found"));
					onReady?.(false);
					return;
				}
				applyResolved(pano, result, loc);
				applyGoogleMovementOptions(pano, movementMode);
				google.maps.event.trigger(pano, "resize");
				const targetPanoId = result.pano.location?.pano ?? null;
				if (result.isFallback && targetPanoId) {
					spawnRef.current.panoId = targetPanoId;
				}
				const tryFinishInit = () => {
					if (cancelled || pano.getStatus() !== "OK") return;
					const live = pano.getPano();
					if (targetPanoId && live && live !== targetPanoId) return;
					onReady?.(true);
					initializeSpawnPano(pano);
					applyGoogleMovementOptions(pano, movementMode);
				};
				statusListener = pano.addListener("status_changed", tryFinishInit);
				tryFinishInit();
				resizeObs = new ResizeObserver(() => {
					google.maps.event.trigger(pano, "resize");
					sessionRef.current?.resize?.();
				});
				resizeObs.observe(host);
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : t("Failed to load panorama"));
				onReady?.(false);
			}
		});

		return cleanupRound;
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
			{movementMode === "nmpz" && (
				<div className="gg-pano__nmpz-shield" aria-hidden="true">
				</div>
			)}
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
