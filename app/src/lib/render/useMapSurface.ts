import { useCallback, useEffect, useRef, type RefObject } from "react";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import type { GoogleMapsOverlayProps } from "@deck.gl/google-maps";
import type { PickingInfo } from "@deck.gl/core";
import { google } from "@/lib/sv/opensv";
import { buildSceneLayers, type PolyGeom } from "@/lib/render/buildSceneLayers";
import { getScene, useScene } from "@/lib/render/sceneStore";
import { useLatestRef } from "@/lib/hooks/useLatestRef";
import { useSetting, getSettings } from "@/store/settings";
import { useScoreMaxError, useLatLngAnchor } from "@/lib/sv/measure";
import { handleMapClick, handleMapHover } from "@/lib/map/mapClick";
import {
	useMapVersion,
	useSelectedLocationIds,
	useSelectedTagIds,
	useAllSelections,
	useImportMarkerVersion,
	useDiffMarkerVersion,
	getActiveLocation,
} from "@/store/useMapStore";
import { subscribe } from "@/lib/events";
import { getReviewSession } from "@/lib/review/review";
import { useHotkey } from "@/lib/hooks/useHotkey";
import { useBinding } from "@/lib/util/hotkeys";
import { useMapKeyboardNav } from "@/lib/hooks/useMapKeyboardNav";
import { useTrailVersion } from "@/lib/sv/svTrail";
import { useSeenOverlayVersion } from "@/lib/seen/seenOverlay";
import type { MapEmbedPrefs } from "@/components/editor/map/mapEmbedPrefs";

type OverlayEvent = { srcEvent?: { domEvent?: Event } };

export interface MapSurfaceOpts {
	prefs: MapEmbedPrefs;
	measuring?: boolean;
	onContextMenu?: (clientX: number, clientY: number) => void;
	// In-progress freehand selection path, read live on every rebuild (the editor map only).
	freehandPathRef?: RefObject<number[][] | null>;
	onError?: (e: unknown) => void;
	// Camera behaviors. Pan this map to the active location while reviewing.
	followActive?: boolean;
	// Bind the panToLocation hotkey to this map.
	panToActiveHotkey?: boolean;
	// Held-key pan/zoom on this map. Keyboard-driven; opt in on one surface only.
	keyboardNav?: boolean;
}

// The one map surface, shared by the editor map and the minimap: creates the deck overlay, builds
// layers from the single scene store, and wires click/hover through the shared pipeline. The only
// difference between consumers is the caps object + the chrome they compose around it. Returns
// `requestUpdate` for imperative rebuilds (the editor's freehand drawing).
export function useMapSurface(
	map: google.maps.Map | null,
	opts: MapSurfaceOpts,
): { requestUpdate: () => void } {
	const overlayRef = useRef<GoogleMapsOverlay | null>(null);
	const polygonGeomCache = useRef(new Map<string, PolyGeom>());
	const activeLocationColor = useSetting("activeLocationColor");
	const importPreviewColor = useSetting("importPreviewColor");
	const panoDotColor = useSetting("panoDotColor");
	const panoDotScaled = useSetting("panoDotScaled");
	const scoreMaxError = useScoreMaxError();

	// Visual signals that should repaint the scene.
	const sceneVersion = useScene();
	const mapVer = useMapVersion();
	const selectedIds = useSelectedLocationIds();
	const selectedTags = useSelectedTagIds();
	const allSelections = useAllSelections();
	const trailVersion = useTrailVersion();
	const importMarkerVersion = useImportMarkerVersion();
	const diffMarkerVersion = useDiffMarkerVersion();
	const seenOverlayVersion = useSeenOverlayVersion();
	const latLngAnchor = useLatLngAnchor();

	const rebuild = useCallback(() => {
		const overlay = overlayRef.current;
		if (!overlay) return;
		const onClick = ((info: PickingInfo, event: OverlayEvent) =>
			handleMapClick(info, event, {
				cm: getScene(),
				map,
				selectOnly: opts.prefs.selectOnly,
				measuring: opts.measuring,
				onContextMenu: opts.onContextMenu,
			})) as GoogleMapsOverlayProps["onClick"];
		const layers = buildSceneLayers(getScene(), {
			markerStyle: opts.prefs.markerStyle,
			markerOpacity: opts.prefs.markerOpacity,
			showPerfectScoreCircle: opts.prefs.showPerfectScoreCircle,
			scoreMaxError,
			svPanoramas: opts.prefs.svPanoramas,
			panoDotColor,
			panoDotScaled,
			activeLocationColor,
			importPreviewColor,
			polygonGeomCache: polygonGeomCache.current,
			freehandPath: opts.freehandPathRef?.current ?? null,
		});
		overlay.setProps({
			layers,
			onClick,
			onHover: handleMapHover as GoogleMapsOverlayProps["onHover"],
			onError: opts.onError,
		});
	}, [
		map,
		scoreMaxError,
		activeLocationColor,
		importPreviewColor,
		opts.prefs.markerStyle,
		opts.prefs.markerOpacity,
		opts.prefs.showPerfectScoreCircle,
		opts.prefs.svPanoramas,
		panoDotColor,
		panoDotScaled,
		opts.prefs.selectOnly,
		opts.measuring,
		opts.onContextMenu,
		opts.onError,
		opts.freehandPathRef,
	]);

	// Latest rebuild, so the rAF-delayed creation paints the first frame with current values.
	const rebuildRef = useLatestRef(rebuild);

	useEffect(() => {
		if (!map || !google?.maps) return;
		let cancelled = false;
		// GoogleMapsOverlay needs a rAF delay before creation (deck.gl + Google Maps interop).
		const raf = requestAnimationFrame(() => {
			if (cancelled) return;
			const overlay = new GoogleMapsOverlay({ layers: [], pickingRadius: 2 });
			overlay.setMap(map);
			overlayRef.current = overlay;
			rebuildRef.current();
		});
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
			overlayRef.current?.setMap(null);
			overlayRef.current?.finalize();
			overlayRef.current = null;
		};
	}, [map, rebuildRef]);

	useEffect(() => {
		rebuild();
	}, [
		rebuild,
		sceneVersion,
		mapVer,
		selectedIds,
		selectedTags,
		allSelections,
		trailVersion,
		importMarkerVersion,
		diffMarkerVersion,
		seenOverlayVersion,
		latLngAnchor,
	]);

	// Follow the active location into view while reviewing.
	useEffect(() => {
		if (!map || !opts.followActive) return;
		return subscribe("active:change", (id) => {
			if (id == null || !getReviewSession() || !getSettings().followActiveInReview) return;
			const loc = getActiveLocation();
			if (loc && loc.id === id) map.panTo({ lat: loc.lat, lng: loc.lng });
		});
	}, [map, opts.followActive]);

	useHotkey(useBinding("panToLocation"), () => {
		if (!map || !opts.panToActiveHotkey) return;
		const loc = getActiveLocation();
		if (loc) map.panTo({ lat: loc.lat, lng: loc.lng });
	});

	useMapKeyboardNav(opts.keyboardNav ? map : null);

	return { requestUpdate: rebuild };
}
