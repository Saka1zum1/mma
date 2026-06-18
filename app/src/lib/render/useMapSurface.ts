import { useCallback, useEffect, useRef, type RefObject } from "react";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import type { GoogleMapsOverlayProps } from "@deck.gl/google-maps";
import type { PickingInfo } from "@deck.gl/core";
import { google } from "@/lib/sv/opensv";
import { buildSceneLayers, type PolyGeom } from "@/lib/render/buildSceneLayers";
import { getScene, useScene } from "@/lib/render/sceneStore";
import { usePanoDots } from "@/lib/render/usePanoDots";
import { useSetting } from "@/store/settings";
import { useScoreMaxError, useLatLngAnchor } from "@/lib/sv/measure";
import { handleMapClick, handleMapHover } from "@/lib/map/mapClick";
import {
	useMapVersion,
	useSelectedLocationIds,
	useSelectedTagIds,
	useSelections,
	useImportMarkerVersion,
	useDiffMarkerVersion,
} from "@/store/useMapStore";
import { useTrailVersion } from "@/lib/sv/svTrail";
import type { MarkerStyle } from "@/components/editor/map/mapSettingsTypes";

type OverlayEvent = { srcEvent?: { domEvent?: Event } };

export interface MapSurfaceOpts {
	markerStyle: MarkerStyle;
	markerOpacity: number;
	svPanoramas: boolean;
	showPerfectScoreCircle: boolean;
	// Click capabilities (behavior only — UI lives in the consumer). Omitted => off.
	selectOnly?: boolean;
	measuring?: boolean;
	container?: HTMLElement | null;
	onContextMenu?: (clientX: number, clientY: number) => void;
	// In-progress freehand selection path, read live on every rebuild (the editor map only).
	freehandPathRef?: RefObject<number[][] | null>;
	onError?: (e: unknown) => void;
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
	const panoDots = usePanoDots(map, opts.svPanoramas);
	const activeLocationColor = useSetting("activeLocationColor");
	const importPreviewColor = useSetting("importPreviewColor");
	const scoreMaxError = useScoreMaxError();

	// Visual signals that should repaint the scene.
	const sceneVersion = useScene();
	const mapVer = useMapVersion();
	const selectedIds = useSelectedLocationIds();
	const selectedTags = useSelectedTagIds();
	const allSelections = useSelections();
	const trailVersion = useTrailVersion();
	const importMarkerVersion = useImportMarkerVersion();
	const diffMarkerVersion = useDiffMarkerVersion();
	const latLngAnchor = useLatLngAnchor();

	const rebuild = useCallback(() => {
		const overlay = overlayRef.current;
		if (!overlay) return;
		const onClick = ((info: PickingInfo, event: OverlayEvent) =>
			handleMapClick(info, event, {
				cm: getScene(),
				zoom: map?.getZoom() ?? 2,
				container: opts.container,
				selectOnly: opts.selectOnly,
				measuring: opts.measuring,
				onContextMenu: opts.onContextMenu,
			})) as GoogleMapsOverlayProps["onClick"];
		const layers = buildSceneLayers(getScene(), {
			markerStyle: opts.markerStyle,
			markerOpacity: opts.markerOpacity,
			showPerfectScoreCircle: opts.showPerfectScoreCircle,
			scoreMaxError,
			svPanoramas: opts.svPanoramas,
			panoDots,
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
		panoDots,
		scoreMaxError,
		activeLocationColor,
		importPreviewColor,
		opts.markerStyle,
		opts.markerOpacity,
		opts.showPerfectScoreCircle,
		opts.svPanoramas,
		opts.container,
		opts.selectOnly,
		opts.measuring,
		opts.onContextMenu,
		opts.onError,
		opts.freehandPathRef,
	]);

	// Latest rebuild, so the rAF-delayed creation paints the first frame with current values.
	const rebuildRef = useRef(rebuild);
	rebuildRef.current = rebuild;

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
	}, [map]);

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
		latLngAnchor,
	]);

	return { requestUpdate: rebuild };
}
