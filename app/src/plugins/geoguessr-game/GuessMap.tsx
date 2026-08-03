import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/primitives/Icon";
import { mdiArrowTopLeft, mdiMinus, mdiPin, mdiPlus, mdiArrowBottomRight } from "@mdi/js";
import {
	createMapHost,
	hostInstance,
	hostKindForMapType,
	type MapHost,
	type DeckOverlayHandle,
} from "@/lib/map/host";
import { CUSTOM_STYLES_KEY, type CustomStyle } from "@/lib/geo/mapStack";
import { google } from "@/lib/sv/opensv";
import type maplibregl from "maplibre-gl";
import { useLocalStorage, getLocal } from "@/lib/hooks/useLocalStorage";
import { type MapEmbedPrefs, DEFAULT_PREFS } from "@/store/mapEmbedPrefs";
import type { LatLng } from "@/types";
import { useT } from "@/lib/i18n";
import {
	createGuessPinLayer,
	createResultLineLayer,
	createTruthPinLayer,
} from "./guessMapLayers";

const MIN_SIZE = 1;
const MAX_SIZE = 4;
const MIN_ZOOM = 1;
const ACTIVE_LEAVE_DELAY_MS = 280;

function pointInElement(el: HTMLElement | null, x: number, y: number): boolean {
	if (!el) return false;
	const r = el.getBoundingClientRect();
	return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function useGuessMapHost(
	containerRef: React.RefObject<HTMLDivElement | null>,
	guessPrefs: MapEmbedPrefs,
	locked: boolean | undefined,
	showResult: boolean,
	onGuess: (p: LatLng) => void,
) {
	const hostRef = useRef<MapHost | null>(null);
	const overlayRef = useRef<DeckOverlayHandle | null>(null);
	const divRef = useRef<HTMLDivElement | null>(null);
	const [ready, setReady] = useState(false);
	const onGuessRef = useRef(onGuess);
	onGuessRef.current = onGuess;

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		let cancelled = false;

		void (async () => {
			const kind = hostKindForMapType(guessPrefs.mapType);
			const div = document.createElement("div");
			div.style.cssText = "width:100%;height:100%;position:absolute;inset:0";
			container.appendChild(div);
			divRef.current = div;

			try {
				const host = await createMapHost(kind, div, guessPrefs, {
					useBlobby: false,
					customStyles: getLocal<CustomStyle[]>(CUSTOM_STYLES_KEY, []),
					camera: { center: { lat: 20, lng: 0 }, zoom: 1.5 },
					scaleControl: false,
					skipCoverage: true,
				});
				if (cancelled) {
					host.destroy();
					return;
				}
				hostRef.current = host;
				host.setSvOpacity(0);
				const overlay = host.createDeckOverlay();
				overlayRef.current = overlay;
				setReady(true);
			} catch {
				if (!cancelled) setReady(false);
			}
		})();

		return () => {
			cancelled = true;
			overlayRef.current?.finalize();
			overlayRef.current = null;
			hostRef.current?.destroy();
			hostRef.current = null;
			if (divRef.current && container.contains(divRef.current)) {
				container.removeChild(divRef.current);
			}
			divRef.current = null;
			setReady(false);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [guessPrefs.mapType]);

	useEffect(() => {
		hostRef.current?.setDraggable(!locked);
		hostRef.current?.setCursor(locked || showResult ? null : "crosshair");
	}, [locked, showResult]);

	useEffect(() => {
		const host = hostRef.current;
		if (!host || !ready) return;

		const gmap = hostInstance(host, "google");
		if (gmap) {
			const listener = gmap.addListener("click", (e: google.maps.MapMouseEvent) => {
				if (locked || showResult) return;
				const ll = e.latLng;
				if (!ll) return;
				onGuessRef.current({ lat: ll.lat(), lng: ll.lng() });
			});
			return () => {
				google.maps.event.removeListener(listener);
			};
		}

		const ml = hostInstance(host, "maplibre");
		if (ml) {
			const onClick = (e: maplibregl.MapMouseEvent) => {
				if (locked || showResult) return;
				onGuessRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
			};
			ml.on("click", onClick);
			return () => {
				ml.off("click", onClick);
			};
		}
	}, [ready, locked, showResult]);

	return { hostRef, overlayRef, ready };
}

export function GuessMap({
	variant,
	guess,
	truth,
	showResult,
	locked,
	mapSize,
	sticky,
	onSizeChange,
	onToggleSticky,
	onGuess,
	onSubmit,
	submitting,
	hasGuess,
}: {
	variant: "play" | "result";
	guess: LatLng | null;
	truth: LatLng | null;
	showResult: boolean;
	locked?: boolean;
	mapSize: number;
	sticky: boolean;
	onSizeChange: (size: number) => void;
	onToggleSticky: () => void;
	onGuess: (p: LatLng) => void;
	onSubmit?: () => void;
	submitting?: boolean;
	hasGuess?: boolean;
}) {
	const { t } = useT();
	const containerRef = useRef<HTMLDivElement>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const [prefs] = useLocalStorage<MapEmbedPrefs>("mapEmbedPrefs", DEFAULT_PREFS);
	const guessPrefs: MapEmbedPrefs = {
		...prefs,
		svPanoramas: false,
		svOpacity: 0,
	};
	const [isActive, setIsActive] = useState(false);
	const [zoom, setZoom] = useState(1.5);
	const deactivateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const mapEngagedRef = useRef(false);
	const pointerInsideRef = useRef(false);
	const lastPointerRef = useRef({ x: 0, y: 0 });

	const clearDeactivateTimer = useCallback(() => {
		if (deactivateTimerRef.current) {
			clearTimeout(deactivateTimerRef.current);
			deactivateTimerRef.current = null;
		}
	}, []);

	const activatePanel = useCallback(() => {
		clearDeactivateTimer();
		setIsActive(true);
	}, [clearDeactivateTimer]);

	const scheduleDeactivatePanel = useCallback(() => {
		if (sticky || mapEngagedRef.current || pointerInsideRef.current) return;
		clearDeactivateTimer();
		deactivateTimerRef.current = setTimeout(() => {
			if (pointerInsideRef.current || sticky || mapEngagedRef.current) return;
			setIsActive(false);
		}, ACTIVE_LEAVE_DELAY_MS);
	}, [sticky, clearDeactivateTimer]);

	const syncHoverFromPoint = useCallback(
		(x: number, y: number) => {
			lastPointerRef.current = { x, y };
			const inside = pointInElement(rootRef.current, x, y);
			const wasInside = pointerInsideRef.current;
			pointerInsideRef.current = inside;
			if (inside) {
				activatePanel();
			} else if (wasInside) {
				scheduleDeactivatePanel();
			}
		},
		[activatePanel, scheduleDeactivatePanel],
	);

	useEffect(() => {
		const onPointerMove = (e: PointerEvent) => {
			lastPointerRef.current = { x: e.clientX, y: e.clientY };
			// While dragging (pano pan, etc.) don't expand — wait for pointerup.
			if (e.buttons !== 0) return;
			syncHoverFromPoint(e.clientX, e.clientY);
		};
		const onPointerUp = (e: PointerEvent) => {
			mapEngagedRef.current = false;
			// After pano drag, mouseenter often never fires — hit-test on release.
			syncHoverFromPoint(e.clientX, e.clientY);
		};
		window.addEventListener("pointermove", onPointerMove, { passive: true });
		window.addEventListener("pointerup", onPointerUp);
		window.addEventListener("pointercancel", onPointerUp);
		return () => {
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("pointercancel", onPointerUp);
		};
	}, [syncHoverFromPoint]);

	useEffect(() => () => clearDeactivateTimer(), [clearDeactivateTimer]);

	useEffect(() => {
		if (sticky) activatePanel();
	}, [sticky, activatePanel]);

	// Re-hit-test after size/active layout transitions (cursor may already be over the map).
	useEffect(() => {
		const { x, y } = lastPointerRef.current;
		if (x || y) {
			const id = window.setTimeout(() => syncHoverFromPoint(x, y), 260);
			return () => clearTimeout(id);
		}
	}, [mapSize, isActive, syncHoverFromPoint]);

	const { hostRef, overlayRef, ready } = useGuessMapHost(
		containerRef,
		guessPrefs,
		locked,
		showResult,
		onGuess,
	);

	const mapActive = variant === "result" || sticky || isActive;

	useEffect(() => {
		if (ready && hostRef.current) setZoom(hostRef.current.getZoom());
	}, [ready, hostRef]);

	useEffect(() => {
		const overlay = overlayRef.current;
		const host = hostRef.current;
		if (!overlay || !host || !ready) return;

		const layers = [];

		if (showResult && truth && guess) {
			layers.push(createResultLineLayer(guess, truth));
		}

		if (guess) {
			layers.push(createGuessPinLayer("gg-guess-pin", guess));
		}

		if (showResult && truth) {
			layers.push(createTruthPinLayer("gg-truth-pin", truth));
		}

		if (showResult && truth && guess) {
			host.fitBounds(
				{
					south: Math.min(guess.lat, truth.lat),
					west: Math.min(guess.lng, truth.lng),
					north: Math.max(guess.lat, truth.lat),
					east: Math.max(guess.lng, truth.lng),
				},
				60,
			);
		} else if (showResult && truth) {
			host.moveCamera({ center: truth, zoom: 4 });
		}

		overlay.setProps({ layers });
	}, [guess, truth, showResult, ready, hostRef, overlayRef]);

	useEffect(() => {
		if (!ready) return;
		const id = requestAnimationFrame(() => hostRef.current?.resize());
		return () => cancelAnimationFrame(id);
	}, [mapSize, ready, hostRef]);

	const zoomIn = useCallback(() => {
		const host = hostRef.current;
		if (!host) return;
		const next = Math.round(host.getZoom()) + 1;
		host.setZoom(next);
		setZoom(next);
		// Keep deck overlay in sync after camera settle without recreating pin icons mid-zoom.
		requestAnimationFrame(() => host.resize());
	}, [hostRef]);

	const bumpSize = useCallback(
		(delta: number) => {
			const next = mapSize + delta;
			if (next < MIN_SIZE || next > MAX_SIZE) return;
			onSizeChange(next);
		},
		[mapSize, onSizeChange],
	);

	const zoomOut = useCallback(() => {
		const host = hostRef.current;
		if (!host) return;
		const next = Math.max(MIN_ZOOM, Math.round(host.getZoom()) - 1);
		host.setZoom(next);
		setZoom(next);
		requestAnimationFrame(() => host.resize());
	}, [hostRef]);

	if (variant === "result") {
		return (
			<div className="gg-guess-map__canvas-wrap gg-guess-map__canvas-wrap--result">
				<div ref={containerRef} className="gg-guess-map__canvas" data-qa="guess-map-canvas" />
			</div>
		);
	}

	const guessDisabled = !hasGuess || submitting;
	const guessLabel = submitting
		? t("plugin.geoguessrGame.scoring")
		: hasGuess
			? t("plugin.geoguessrGame.guess")
			: t("plugin.geoguessrGame.placePinOnMap");

	return (
		<div className="gg-game-guess-map">
			<div
				ref={rootRef}
				className={`gg-guess-map__root gg-guess-map--size-${mapSize}${mapActive ? " is-active" : ""}`}
				data-qa="guess-map"
				onPointerEnter={(e) => syncHoverFromPoint(e.clientX, e.clientY)}
				onPointerLeave={() => {
					pointerInsideRef.current = false;
					scheduleDeactivatePanel();
				}}
				onFocusCapture={activatePanel}
				onBlurCapture={(e) => {
					if (!rootRef.current?.contains(e.relatedTarget as Node)) {
						scheduleDeactivatePanel();
					}
				}}
			>
				<div
					className="gg-guess-map__controls"
					onPointerDown={(e) => e.stopPropagation()}
					onClick={(e) => e.stopPropagation()}
				>
					<button
						type="button"
						className="gg-guess-map__control gg-guess-map__control--increase"
						disabled={mapSize >= MAX_SIZE}
						onPointerDown={(e) => e.stopPropagation()}
						onClick={(e) => {
							e.stopPropagation();
							bumpSize(1);
						}}
						data-qa="guess-map__control--increase-size"
						aria-label="Increase size"
					>
						<Icon path={mdiArrowTopLeft} />
					</button>
					<button
						type="button"
						className="gg-guess-map__control gg-guess-map__control--decrease"
						disabled={mapSize <= MIN_SIZE}
						onPointerDown={(e) => e.stopPropagation()}
						onClick={(e) => {
							e.stopPropagation();
							bumpSize(-1);
						}}
						data-qa="guess-map__control--decrease-size"
						aria-label="Decrease size"
					>
						<Icon path={mdiArrowBottomRight} />
					</button>
					<button
						type="button"
						className={`gg-guess-map__control gg-guess-map__control--sticky${sticky ? " is-active" : ""}`}
						onClick={(e) => {
							e.stopPropagation();
							onToggleSticky();
						}}
						data-qa={sticky ? "guess-map__control--sticky-active" : "guess-map__control--sticky"}
						aria-label="Sticky map"
					>
						<Icon path={mdiPin} />
					</button>
				</div>

				<div
					className={`gg-guess-map__canvas-wrap${mapActive ? " gg-guess-map__canvas-wrap--active-bar" : ""}`}
					onPointerDown={(e) => {
						if (e.button !== 0) return;
						mapEngagedRef.current = true;
						activatePanel();
					}}
				>
					<div className="gg-guess-map__zoom">
						<button type="button" className="gg-guess-map__zoom-btn" onClick={zoomIn} aria-label="Zoom in">
							<Icon path={mdiPlus} />
						</button>
						<button
							type="button"
							className={`gg-guess-map__zoom-btn${zoom <= MIN_ZOOM ? " gg-guess-map__zoom-btn--disabled" : ""}`}
							onClick={zoomOut}
							disabled={zoom <= MIN_ZOOM}
							aria-label="Zoom out"
						>
							<Icon path={mdiMinus} />
						</button>
					</div>
					<div ref={containerRef} className="gg-guess-map__canvas" data-qa="guess-map-canvas" />
				</div>

				<div className="gg-guess-map__guess-btn-wrap">
					<button
						type="button"
						className={`gg-guess-map__guess-btn${guessDisabled ? " gg-guess-map__guess-btn--disabled" : ""}`}
						disabled={guessDisabled}
						onClick={onSubmit}
						data-qa="perform-guess"
					>
						<span className="gg-guess-map__guess-btn-label">{guessLabel}</span>
					</button>
				</div>
			</div>
		</div>
	);
}
