import { useEffect, useRef, useCallback, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import type { GoogleMapsOverlayProps } from "@deck.gl/google-maps";
import type { PickingInfo, Layer, Position } from "@deck.gl/core";
type OverlayEvent = { srcEvent?: { domEvent?: Event } };
import { ScatterplotLayer, PolygonLayer, PathLayer, LineLayer } from "@deck.gl/layers";
import { mdiGoogleStreetView, mdiMapMarker } from "@mdi/js";
import SDFMarkerLayer from "@/lib/render/sdf-marker-layer/SDFMarkerLayer";
import { Icon } from "@/components/primitives/Icon";

function normalizeRing<T extends number[]>(ring: T[]): T[] {
	const crosses = ring.some((p) => p[0] > 180 || p[0] < -180) ||
		ring.some((_, i, a) => i > 0 && Math.abs(a[i][0] - a[i - 1][0]) > 180);
	if (!crosses) return ring;
	return ring.map((p) => {
		const out = [...p] as unknown as T;
		if (out[0] < 0) out[0] += 360;
		return out;
	});
}

function normalizePolygonCoords<T extends number[]>(coords: T[][]): T[][] {
	return coords.map(normalizeRing);
}
import { lookupStreetView, svThumbnailUrl, showToast, svSearchRadius } from "@/lib/sv/lookup";
import { cmd } from "@/lib/commands";
import { mmaBufUrl } from "@/lib/util/util";
import { log } from "@/lib/util/log";
import { trace } from "@/lib/util/debug";
import { useSetting } from "@/store/settings";
import { CellManager } from "@/lib/render/CellManager";
import {
	useMeasure,
	useLatLngAnchor,
	getLatLngAnchor,
	useScoreMaxError,
	openContextMenuLatLng,
	openContextMenuLocation,
} from "@/lib/sv/measure";
import { MeasurementBar } from "@/components/primitives/MeasurementBar";
import { MapContextMenuContent } from "@/components/editor/map/MapContextMenu";
import {
	useCurrentMap,
	getCurrentMap,
	useMapVersion,
	useSelectedLocationIds,
	useSelectedTagIds,
	useSelections,
	useActiveLocation,
	getActiveLocation,
	toggleManualSelection,
	selectPolygon,
	setActiveLocation,
	addLocations,
	getWorkArea,
	getSelectedLocationIds,
	useImportMarkerVersion,
	getImportPreviewPositions,
	getActiveStagedIndex,
	openStagedLocation,
	useDiffMarkerVersion,
	getCommitDiffPreview,
	renderDeltaBus,
	selBitmaskBus,
	mapOpenMark,
} from "@/store/useMapStore";
import { loadOpenSV, google } from "@/lib/sv/opensv";
import { useTrailVersion, getTrail } from "@/lib/sv/svTrail";
import {
	setGoogleMap as setGoogleMapInstance,
	tryInterceptClick,
	tryInterceptDraw,
} from "@/lib/map/mapState";
import { useHotkey } from "@/lib/hooks/useHotkey";
import { useBinding } from "@/lib/util/hotkeys";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { PolygonTools } from "@/components/editor/PolygonTools";
import { boundsToTiles, fetchPanoDots, type PanoDot } from "@/lib/geo/photometa";

import {
	buildTileUrl,
	buildStyledTileUrl,
	createRoadmapTileConfig,
	createLegacyTileConfig,
	createLabelsTileConfig,
	createSatelliteTileConfig,
	createSvTileConfig,
	createSvBlobbyTileConfig,
	createTerrainBasemapTileConfig,
	createTerrainOverlayTileConfig,
	LEGACY_STYLE_MAP_ID,
	type MapStyle,
} from "@/lib/geo/tiles";
import type { Location } from "@/types";
import { isVirtualLocation } from "@/types";
import { SearchControl } from "@/components/editor/map/SearchControl";
import {
	MapTypeDropdown,
	MapSettingsDropdown,
	type SvCoverageType,
	type SvThickness,
	type MarkerStyle,
} from "@/components/editor/map/MapSettingsPanel";
import type { SvColor, MapTypeKey } from "@/components/editor/map/mapSettingsTypes";
import { DARK_MODE_STYLES } from "@/lib/geo/mapStyles";
import { createCompositeMapType } from "@/lib/geo/stackedMapType";
import { FpsCounter } from "@/components/editor/map/FpsCounter";
import { useMapKeyboardNav } from "@/lib/hooks/useMapKeyboardNav";

const LOCATION_LAYER_ID = "locations";
const isLocationLayer = (id?: string) =>
	id?.startsWith(LOCATION_LAYER_ID) ||
	id?.startsWith("cell:") ||
	id?.startsWith("sel-overlay:") ||
	id === "import-preview";
const PERFECT_SCORE_LAYER_ID = "perfect-score";

interface MapEmbedPrefs {
	svOpacity: number;
	svColor: SvColor;
	showLabels: boolean;
	showTerrain: boolean;
	svPanoramas: boolean;
	svCoverageType: SvCoverageType;
	svThickness: SvThickness;
	svBlobby: boolean;
	boldCountryBorders: boolean;
	boldSubdivisionBorders: boolean;
	mapStyleName: string;
	mapType: MapTypeKey;
	markerStyle: MarkerStyle;
	markerOpacity: number;
	showPerfectScoreCircle: boolean;
	showPreviews: boolean;
	selectOnly: boolean;
}

const DEFAULT_PREFS: MapEmbedPrefs = {
	svOpacity: 0.5,
	svColor: "cyan",
	showLabels: true,
	showTerrain: false,
	svPanoramas: false,
	svCoverageType: "official",
	svThickness: "default",
	svBlobby: false,
	boldCountryBorders: false,
	boldSubdivisionBorders: false,
	mapStyleName: "default",
	mapType: "map",
	markerStyle: "pin",
	markerOpacity: 1,
	showPerfectScoreCircle: true,
	showPreviews: false,
	selectOnly: false,
};

export function MapEmbed() {
	const map = useCurrentMap();
	const mapVer = useMapVersion();

	const selected = useSelectedLocationIds();
	const selectedTags = useSelectedTagIds();
	const allSelections = useSelections();
	const activeLocation = useActiveLocation();
	const trailVersion = useTrailVersion();
	const importMarkerVersion = useImportMarkerVersion();
	const diffMarkerVersion = useDiffMarkerVersion();
	const containerRef = useRef<HTMLDivElement>(null);
	const cellMgrRef = useRef(new CellManager());
	const [renderTick, setRenderTick] = useState(0);
	const gMapRef = useRef<google.maps.Map>(null);
	const overlayRef = useRef<GoogleMapsOverlay | null>(null);
	const prevActiveRef = useRef<number | null>(null);

	const gRef = useRef<Google>(null);
	const [prefs, setPrefs] = useLocalStorage<MapEmbedPrefs>("mapEmbedPrefs", DEFAULT_PREFS);
	const pref =
		<K extends keyof MapEmbedPrefs>(k: K) =>
		(v: MapEmbedPrefs[K]) =>
			setPrefs((p) => ({ ...p, [k]: v }));
	const {
		svOpacity,
		svColor,
		showLabels,
		showTerrain,
		svPanoramas,
		svCoverageType,
		svThickness,
		svBlobby,
		boldCountryBorders,
		boldSubdivisionBorders,
		mapStyleName,
		mapType,
		markerStyle,
		markerOpacity,
		showPerfectScoreCircle,
		showPreviews,
		selectOnly,
	} = prefs;
	// handleClick needs the live value; prefs state has no store getter.
	const selectOnlyRef = useRef(selectOnly);
	selectOnlyRef.current = selectOnly;
	const coordDisplayRef = useRef<HTMLSpanElement>(null);
	const [mapZoom, setMapZoom] = useState(2);
	const scoreMaxError = useScoreMaxError();
	const activeLocationColor = useSetting("activeLocationColor");
	const importPreviewColor = useSetting("importPreviewColor");

	const [customStyles, setCustomStyles] = useState<{ name: string; style: MapStyle[] }[]>(() => {
		try {
			return JSON.parse(localStorage.getItem("mma_custom_styles") ?? "[]");
		} catch {
			return [];
		}
	});
	const [showStylesDialog, setShowStylesDialog] = useState(false);
	const [svPreview, setSvPreview] = useState<{
		url: string;
		date?: string;
	} | null>(null);
	const previewAbortRef = useRef<AbortController | null>(null);
	const [panoDots, setPanoDots] = useState<PanoDot[]>([]);
	const [opacityTarget, setOpacityTarget] = useState<"sv" | "markers">("sv");
	const [mapReady, setMapReady] = useState(false);
	const freehandPathRef = useRef<number[][] | null>(null);
	const contextTriggerRef = useRef<HTMLSpanElement>(null);
	const { isMeasuring } = useMeasure();
	const latLngAnchor = useLatLngAnchor();

	// Earcut tessellation of selection polygons is expensive and runs on every
	// buildLayers call if the data reference changes. Cache the normalized fill/stroke
	// arrays keyed by selection, invalidating only when the geometry object changes, so
	// deck.gl reuses the same reference and re-tessellates once per geometry, not per render.
	const polygonGeomCache = useRef(
		new Map<string, { poly: object; fill: Position[][][]; stroke: Position[][] }>(),
	);

	const buildLayers = useCallback(() => {
		const m = getCurrentMap();
		if (!m) {
			return [];
		}

		const layers: Layer[] = [];

		// Commit-diff overlay temporarily replaces the regular markers.
		if (getWorkArea() === "diff") {
			const diff = getCommitDiffPreview();
			if (diff) {
				const diffLayer = (id: string, pos: Float32Array, color: [number, number, number, number]) =>
					new ScatterplotLayer({
						id,
						data: { length: pos.length / 2, attributes: { getPosition: { value: pos, size: 2 } } },
						getRadius: 5,
						radiusUnits: "pixels" as const,
						radiusMinPixels: 3,
						getFillColor: color,
						stroked: false,
						pickable: false,
					});
				if (diff.removed.length) layers.push(diffLayer("diff-removed", diff.removed, [239, 68, 68, 210]));
				if (diff.added.length) layers.push(diffLayer("diff-added", diff.added, [34, 197, 94, 210]));
				if (diff.modified.length)
					layers.push(diffLayer("diff-modified", diff.modified, [245, 158, 11, 220]));
			}
			return layers;
		}

		const polygonSels = allSelections.flatMap((sel) =>
			sel.props.type === "Intersection" ? sel.props.selections : [sel],
		);
		const livePolygonKeys = new Set<string>();
		for (const sel of polygonSels) {
			if (sel.props.type !== "Polygon") continue;
			const poly = sel.props.polygon;
			livePolygonKeys.add(sel.key);
			let geom = polygonGeomCache.current.get(sel.key);
			if (!geom || geom.poly !== poly) {
				const fill = [poly.coordinates, ...(poly.extraPolygons ?? [])].map(normalizePolygonCoords);
				geom = { poly, fill, stroke: fill.flatMap((p) => p) as Position[][] };
				polygonGeomCache.current.set(sel.key, geom);
			}
			const fillColor: [number, number, number, number] = [...sel.color, 26];
			const strokeColor: [number, number, number, number] = [...sel.color, 153];
			layers.push(
				new PolygonLayer<Position[][]>({
					id: `selectionPolygonFill:${sel.key}`,
					data: geom.fill,
					getPolygon: (d) => d,
					getFillColor: fillColor,
					stroked: false,
					pickable: false,
					opacity: 1,
				}),
				new PathLayer<Position[]>({
					id: `selectionPolygonStroke:${sel.key}`,
					data: geom.stroke,
					getPath: (d) => d,
					getColor: strokeColor,
					getWidth: 4,
					widthUnits: "pixels",
					jointRounded: true,
					pickable: false,
					opacity: 1,
				}),
			);
		}
		for (const k of polygonGeomCache.current.keys()) {
			if (!livePolygonKeys.has(k)) polygonGeomCache.current.delete(k);
		}

		const cm = cellMgrRef.current;
		const activeId = getActiveLocation()?.id ?? null;
		// Sync bridge: restore old active's visibility while Rust's state catches up.
		// store_set_active keeps Rust in sync (fire-and-forget), no full re-render.
		if (prevActiveRef.current != null && prevActiveRef.current !== activeId) {
			const prevId = prevActiveRef.current;
			if (!getSelectedLocationIds().has(prevId)) {
				for (const cb of cm.cells.values()) {
					const idx = cb.idToIndex.get(prevId);
					if (idx != null) {
						cb.patchColor(idx, 42, 42, 42, 255);
						break;
					}
				}
			}
		}
		prevActiveRef.current = activeId;
		if (activeId != null) {
			for (const cb of cm.cells.values()) {
				const idx = cb.idToIndex.get(activeId);
				if (idx != null) {
					cb.patchColor(idx, 0, 0, 0, 0);
					break;
				}
			}
		}
		if (markerOpacity > 0 && cm.totalCount > 0) {
			for (const [cellKey, cell] of cm.cells) {
				if (cell.count === 0) continue;
				if (markerStyle === "circle") {
					layers.push(
						new ScatterplotLayer({
							id: `cell:${cellKey}:s`,
							data: {
								length: cell.count,
								attributes: {
									getPosition: { value: cell.positions, size: 2 },
									getFillColor: { value: cell.colors, size: 4 },
								},
							},
							getRadius: 6,
							radiusUnits: "pixels",
							radiusMinPixels: 3,
							opacity: markerOpacity,
							pickable: true,
							updateTriggers: {
								opacity: [markerOpacity],
								getFillColor: [cell.colorVersion],
								getPosition: [cell.positionVersion],
							},
						}),
					);
				} else if (markerStyle === "arrow") {
					layers.push(
						new SDFMarkerLayer({
							id: `cell:${cellKey}:d`,
							data: {
								length: cell.count,
								attributes: {
									getPosition: { value: cell.positions, size: 2 },
									getFillColor: { value: cell.colors, size: 4 },
									getAngle: { value: cell.angles, size: 1 },
								},
							},
							shape: "arrow",
							radiusPixels: 12,
							opacity: markerOpacity,
							pickable: true,
							updateTriggers: {
								opacity: [markerOpacity],
								getFillColor: [cell.colorVersion],
								getPosition: [cell.positionVersion],
								getAngle: [cell.positionVersion],
							},
						}),
					);
				} else {
					layers.push(
						new SDFMarkerLayer({
							id: `cell:${cellKey}:d`,
							data: {
								length: cell.count,
								attributes: {
									getPosition: { value: cell.positions, size: 2 },
									getFillColor: { value: cell.colors, size: 4 },
								},
							},
							shape: "pin",
							radiusPixels: 16,
							opacity: markerOpacity,
							pickable: true,
							updateTriggers: {
								opacity: [markerOpacity],
								getFillColor: [cell.colorVersion],
								getPosition: [cell.positionVersion],
							},
						}),
					);
				}
			}
		}

		if (cm.selOverlayCount > 0) {
			if (markerStyle === "circle") {
				layers.push(
					new ScatterplotLayer({
						id: "sel-overlay:s",
						data: {
							length: cm.selOverlayCount,
							attributes: {
								getPosition: { value: cm.selOverlayPositions, size: 2 },
								getFillColor: { value: cm.selOverlayColors, size: 4 },
							},
						},
						getRadius: 6,
						radiusUnits: "pixels",
						radiusMinPixels: 3,
						// Selection overlay is drawn on top of the cell markers, so it must also be pickable on
						// top ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â otherwise clicks fall through to the cell layer where selected markers have no
						// z-priority, and an overlapping neighbor gets picked instead of the marker on top.
						pickable: true,
						updateTriggers: {
							getFillColor: [cm.selOverlayVersion],
							getPosition: [cm.selOverlayVersion],
						},
					}),
				);
			} else if (markerStyle === "arrow") {
				layers.push(
					new SDFMarkerLayer({
						id: "sel-overlay:d",
						data: {
							length: cm.selOverlayCount,
							attributes: {
								getPosition: { value: cm.selOverlayPositions, size: 2 },
								getFillColor: { value: cm.selOverlayColors, size: 4 },
								getAngle: { value: cm.selOverlayAngles, size: 1 },
							},
						},
						shape: "arrow",
						radiusPixels: 12,
						pickable: true,
						updateTriggers: {
							getFillColor: [cm.selOverlayVersion],
							getPosition: [cm.selOverlayVersion],
							getAngle: [cm.selOverlayVersion],
						},
					}),
				);
			} else {
				layers.push(
					new SDFMarkerLayer({
						id: "sel-overlay:d",
						data: {
							length: cm.selOverlayCount,
							attributes: {
								getPosition: { value: cm.selOverlayPositions, size: 2 },
								getFillColor: { value: cm.selOverlayColors, size: 4 },
							},
						},
						shape: "pin",
						radiusPixels: 16,
						pickable: true,
						updateTriggers: {
							getFillColor: [cm.selOverlayVersion],
							getPosition: [cm.selOverlayVersion],
						},
					}),
				);
			}
		}

		const activeLoc = getActiveLocation();
		if (activeLoc && cm.totalCount > 0) {
			const activeColor: [number, number, number, number] = [
				activeLocationColor.r,
				activeLocationColor.g,
				activeLocationColor.b,
				255,
			];
			if (markerStyle === "arrow") {
				layers.push(
					new SDFMarkerLayer<Location>({
						id: `${LOCATION_LAYER_ID}-current-sdf`,
						data: [activeLoc],
						getPosition: (d) => [d.lng, d.lat],
						shape: "arrow",
						radiusPixels: 12,
						getFillColor: activeColor,
						getAngle: (d: Location) => 180 - d.heading,
						pickable: true,
						updateTriggers: {
							getAngle: [markerStyle],
						},
					}),
				);
			} else if (markerStyle === "circle") {
				layers.push(
					new ScatterplotLayer<Location>({
						id: `${LOCATION_LAYER_ID}-current-scatter`,
						data: [activeLoc],
						getPosition: (d) => [d.lng, d.lat],
						getRadius: 6,
						radiusUnits: "pixels",
						radiusMinPixels: 3,
						getFillColor: activeColor,
						pickable: true,
					}),
				);
			} else {
				layers.push(
					new SDFMarkerLayer<Location>({
						id: `${LOCATION_LAYER_ID}-current-sdf`,
						data: [activeLoc],
						getPosition: (d) => [d.lng, d.lat],
						shape: "pin",
						radiusPixels: 16,
						getFillColor: activeColor,
						pickable: true,
					}),
				);
			}
		}

		const scoreLoc = getActiveLocation();
		if (showPerfectScoreCircle && scoreLoc && cm.totalCount > 0) {
			const loc = scoreLoc;
			const trail = getTrail();
			const last = trail.length ? trail[trail.length - 1] : null;
			const center = last ? { lng: last[0], lat: last[1] } : { lat: loc.lat, lng: loc.lng };
			layers.push(
				new ScatterplotLayer({
					id: PERFECT_SCORE_LAYER_ID,
					data: [center],
					getPosition: (d: { lat: number; lng: number }) => [d.lng, d.lat],
					getFillColor: [200, 0, 0, 26],
					getLineColor: [200, 0, 0, 128],
					getRadius: Math.max(25, scoreMaxError),
					radiusUnits: "meters" as const,
					stroked: true,
					filled: true,
					lineWidthPixels: 1,
					pickable: false,
				}),
			);
		}

		if (svPanoramas && panoDots.length > 0) {
			layers.push(
				new ScatterplotLayer<PanoDot>({
					id: "panorama-dots",
					data: panoDots,
					getPosition: (d) => [d.lng, d.lat],
					getFillColor: [255, 0, 0],
					getRadius: 2,
					radiusMaxPixels: 8,
					stroked: false,
					filled: true,
					opacity: 0.7,
					pickable: false,
				}),
			);
		}

		const anchor = getLatLngAnchor();
		if (anchor) {
			layers.push(
				new LineLayer({
					id: "lat-lng-anchor",
					visible: true,
					data: [
						{ from: [anchor.lng, 90], to: [anchor.lng, -90] },
						{ from: [-180, anchor.lat], to: [180, anchor.lat] },
					],
					pickable: false,
					getWidth: 2,
					getSourcePosition: (d) => d.from,
					getTargetPosition: (d) => d.to,
					getColor: [0, 0, 0],
				}),
			);
		}

		const freehand = freehandPathRef.current;
		if (freehand && freehand.length >= 2) {
			layers.push(
				new PathLayer({
					id: "freehand-drawing",
					data: [normalizeRing(freehand)],
					getPath: (d) => d,
					getColor: [255, 255, 255, 200],
					getWidth: 3,
					widthUnits: "pixels" as const,
					jointRounded: true,
					capRounded: true,
					pickable: false,
				}),
			);
		}

		const svTrail = getTrail();
		if (svTrail.length >= 2) {
			layers.push(
				new PathLayer({
					id: "sv-trail",
					data: [svTrail],
					getPath: (d) => d,
					getColor: [255, 0, 0],
					getWidth: 2,
					widthUnits: "pixels" as const,
					jointRounded: true,
					capRounded: true,
					pickable: false,
				}),
			);
		}

		// Staged import preview markers; clicking one opens a read-only preview.
		if (getWorkArea() === "import" || getActiveStagedIndex() !== null) {
			const previewPos = getImportPreviewPositions();
			const previewCount = previewPos.length / 2;
			const stagedIdx = getActiveStagedIndex();
			if (previewCount > 0) {
				layers.push(
					new ScatterplotLayer({
						id: "import-preview",
						data: {
							length: previewCount,
							attributes: { getPosition: { value: previewPos, size: 2 } },
						},
						getRadius: 6,
						radiusUnits: "pixels",
						radiusMinPixels: 3,
						getFillColor: (_: unknown, { index }: { index: number }) =>
							index === stagedIdx
								? [activeLocationColor.r, activeLocationColor.g, activeLocationColor.b, 255]
								: [importPreviewColor.r, importPreviewColor.g, importPreviewColor.b, 200],
						stroked: false,
						pickable: true,
						updateTriggers: { getFillColor: [stagedIdx, importPreviewColor, activeLocationColor] },
					}),
				);
			}
		}

		return layers;
	}, [
		markerOpacity,
		markerStyle,
		activeLocationColor,
		importPreviewColor,
		showPerfectScoreCircle,
		scoreMaxError,
		svPanoramas,
		panoDots,
		allSelections,
		latLngAnchor,
		renderTick,
		trailVersion,
		importMarkerVersion,
		diffMarkerVersion,
	]);

	const dispatchContextMenu = useCallback((clientX: number, clientY: number) => {
		contextTriggerRef.current?.dispatchEvent(
			new MouseEvent("contextmenu", { bubbles: true, clientX, clientY }),
		);
	}, []);

	const handleClick = useCallback(
		async (info: PickingInfo, event: OverlayEvent) => {
			const domEvent = event?.srcEvent?.domEvent;

			// Staged import markers open a read-only preview; never fall through to the
			// map-click SV lookup (which would create a new location).
			if (info.layer?.id === "import-preview") {
				if (typeof info.index === "number" && info.index >= 0) {
					void openStagedLocation(info.index);
				}
				return;
			}

			const resolvePickedLocation = async (): Promise<Location | undefined> => {
				if (info.object) return info.object as Location;
				if (typeof info.index !== "number" || info.index < 0) return undefined;
				const layerId = info.layer?.id;
				if (layerId?.startsWith("sel-overlay:")) {
					const id = cellMgrRef.current.selOverlayIds[info.index];
					if (id == null) return undefined;
					const loc = await cmd.storeGetLocation(id);
					return loc ?? undefined;
				}
				if (!layerId?.startsWith("cell:")) return undefined;
				const cellKey = layerId.split(":")[1];
				const id = cellMgrRef.current.resolvePickFromCell(cellKey, info.index);
				if (id == null) {
					const rustId: number | null = await cmd.storeResolvePick(cellKey, info.index);
					if (rustId == null) return undefined;
					const loc = await cmd.storeGetLocation(rustId);
					return loc ?? undefined;
				}
				const loc = await cmd.storeGetLocation(id);
				return loc ?? undefined;
			};

			if (domEvent instanceof MouseEvent && domEvent.button === 2) {
				if (isLocationLayer(info.layer?.id)) {
					const loc = await resolvePickedLocation();
					if (loc) {
						openContextMenuLocation(loc);
					} else if (info.coordinate) {
						openContextMenuLatLng({
							lat: info.coordinate[1],
							lng: info.coordinate[0],
						});
					}
				} else if (info.coordinate) {
					openContextMenuLatLng({
						lat: info.coordinate[1],
						lng: info.coordinate[0],
					});
				}
				dispatchContextMenu(domEvent.clientX, domEvent.clientY);
				return;
			}

			if (domEvent instanceof MouseEvent && domEvent.button !== 0) return;

			if (isLocationLayer(info.layer?.id)) {
				const loc = await resolvePickedLocation();
				if (loc) {
					if (isVirtualLocation(loc)) return; // staged location's active pin: already open
					if (domEvent instanceof MouseEvent && domEvent.ctrlKey) {
						toggleManualSelection(loc.id);
					} else {
						setActiveLocation(loc.id);
					}
					return;
				}
			}

			if (isMeasuring) return;

			if (info.coordinate) {
				const [lng, lat] = info.coordinate;
				if (tryInterceptClick(lat, lng)) return;
				if (getWorkArea() === "plugin") return;
				if (getWorkArea() === "import") return;
				if (getActiveStagedIndex() !== null) return; // staged preview open
				if (getWorkArea() === "diff") return;
				if (selectOnlyRef.current) {
					if (containerRef.current) {
						showToast(containerRef.current, "Select-only mode is on.");
					}
					return;
				}
				const g = gRef.current;
				if (!g) return;
				const currentZoom = gMapRef.current?.getZoom() ?? 2;
				const t = trace("add");
				// Rust materializes complete per-map settings whenever a map is open.
				const ms = getCurrentMap()?.meta.settings;
				const loc = await lookupStreetView(lat, lng, currentZoom, {
					preferOfficial: ms?.preferOfficial,
					onlyOfficial: ms?.onlyOfficial,
					pointAlongRoad: ms?.pointAlongRoad,
					preferDirection: ms?.preferDirection,
					defaultPanoId: ms?.defaultPanoId,
					preferHigherQuality: ms?.preferHigherQuality,
					minRadius: ms?.searchRadius ?? undefined,
				});
				if (!loc) {
					if (containerRef.current) {
						showToast(containerRef.current, "No coverage found at this location.");
					}
					return;
				}
				t.step("lookup");
				await addLocations([loc], { hideInDelta: true });
				t.step("addLocations");
				setActiveLocation(loc.id);
				t.step("setActive");
				t.end();
			}
		},
		[isMeasuring, dispatchContextMenu],
	);

	const handleHover = useCallback((info: PickingInfo, event: OverlayEvent) => {
		const hasObject =
			info.object != null ||
			(isLocationLayer(info.layer?.id) === true &&
				typeof info.index === "number" &&
				info.index >= 0);
		const domEvent = event?.srcEvent?.domEvent;
		if (domEvent instanceof MouseEvent) {
			const target = domEvent.target as HTMLElement | null;
			if (target) target.style.cursor = hasObject ? "pointer" : "";
		}
	}, []);

	const svLayerRef = useRef<google.maps.ImageMapType>(null);

	const buildMapStack = useCallback(
		(opts: {
			type: MapTypeKey;
			labels: boolean;
			terrain: boolean;
			color: SvColor;
			coverageType: SvCoverageType;
			thickness: SvThickness;
			useBlobby: boolean;
			boldCountry: boolean;
			boldSubdivision: boolean;
			style: string;
			customStyles?: MapStyle[];
		}) => {
			const tileSize = new google.maps.Size(256, 256);
			const layers: google.maps.ImageMapType[] = [];
			const legacyBase = opts.style === "legacy" && opts.type === "map" && !opts.terrain;

			const extraStyles: MapStyle[] = [];
			if (opts.style === "darkMode") {
				extraStyles.push(...DARK_MODE_STYLES);
			} else if (opts.customStyles) {
				extraStyles.push(...opts.customStyles);
			}
			if (opts.boldCountry) {
				const s: Record<string, string | number> = { weight: 2 };
				if (opts.style === "default") s.color = "#000000";
				extraStyles.push({
					featureType: "administrative.country",
					elementType: "geometry.stroke",
					stylers: [s],
				});
			}
			if (opts.boldSubdivision) {
				extraStyles.push({
					featureType: "administrative.province",
					elementType: "geometry.stroke",
					stylers: [{ weight: 3 }],
				});
			}

			if (opts.type === "satellite") {
				const cfg = createSatelliteTileConfig();
				layers.push(
					new google.maps.ImageMapType({
						getTileUrl: (coord: TileCoord, zoom: number) =>
							buildTileUrl(cfg, coord.x, coord.y, zoom),
						tileSize,
						minZoom: 0,
						maxZoom: 20,
					}),
				);
				if (opts.terrain) {
					const tcfg = createTerrainOverlayTileConfig();
					layers.push(
						new google.maps.ImageMapType({
							getTileUrl: (coord: TileCoord, zoom: number) =>
								buildTileUrl(tcfg, coord.x, coord.y, zoom),
							tileSize,
							minZoom: 0,
							maxZoom: 20,
						}),
					);
				}
			} else if (opts.type === "osm") {
				layers.push(
					new google.maps.ImageMapType({
						getTileUrl: (coord: TileCoord, zoom: number) =>
							`https://tile.openstreetmap.org/${zoom}/${coord.x}/${coord.y}.png`,
						tileSize,
						minZoom: 0,
						maxZoom: 19,
					}),
				);
			} else {
				if (opts.terrain) {
					const cfg = createTerrainBasemapTileConfig([
						{ elementType: "labels", stylers: [{ visibility: "off" }] },
						{
							elementType: "geometry.stroke",
							featureType: "administrative",
							stylers: [{ visibility: "off" }],
						},
						...extraStyles,
					]);
					layers.push(
						new google.maps.ImageMapType({
							getTileUrl: (coord: TileCoord, zoom: number) =>
								buildTileUrl(cfg, coord.x, coord.y, zoom),
							tileSize,
							minZoom: 0,
							maxZoom: 20,
						}),
					);
				} else if (legacyBase) {
					// Legacy style renders labels in the base tile (toggled via stylers),
					// so the separate labels layer is skipped below.
					const cfg = createLegacyTileConfig([
						...(opts.labels
							? []
							: [{ elementType: "labels", stylers: [{ visibility: "off" }] } as MapStyle]),
						...extraStyles,
					]);
					layers.push(
						new google.maps.ImageMapType({
							getTileUrl: (coord: TileCoord, zoom: number) =>
								buildStyledTileUrl(cfg, LEGACY_STYLE_MAP_ID, coord.x, coord.y, zoom),
							tileSize,
							minZoom: 0,
							maxZoom: 20,
						}),
					);
				} else {
					const cfg = createRoadmapTileConfig(extraStyles);
					layers.push(
						new google.maps.ImageMapType({
							getTileUrl: (coord: TileCoord, zoom: number) =>
								buildTileUrl(cfg, coord.x, coord.y, zoom),
							tileSize,
							minZoom: 0,
							maxZoom: 20,
						}),
					);
				}
			}

			const showOfficial = opts.coverageType === "official" || opts.coverageType === "default";
			const showUnofficial = opts.coverageType === "unofficial" || opts.coverageType === "default";
			const svCfg = opts.useBlobby
				? createSvBlobbyTileConfig({
						showOfficial,
						showUnofficial,
						color: opts.color,
					})
				: createSvTileConfig({
						showOfficial,
						showUnofficial,
						color: opts.color,
						thickness: opts.thickness,
					});
			const svLayer = new google.maps.ImageMapType({
				getTileUrl: (coord: TileCoord, zoom: number) => buildTileUrl(svCfg, coord.x, coord.y, zoom),
				tileSize,
				minZoom: 0,
				maxZoom: 20,
			});
			const blobbySingleType = opts.useBlobby && !(showOfficial && showUnofficial);
			svLayer.setOpacity(blobbySingleType ? svOpacity * 0.6 : svOpacity);
			svLayerRef.current = svLayer;
			layers.push(svLayer);

			if (opts.labels && opts.type !== "osm" && !legacyBase) {
				const labelCfg = createLabelsTileConfig(extraStyles);
				layers.push(
					new google.maps.ImageMapType({
						getTileUrl: (coord: TileCoord, zoom: number) =>
							buildTileUrl(labelCfg, coord.x, coord.y, zoom),
						tileSize,
						minZoom: 0,
						maxZoom: 20,
					}),
				);
			}

			return createCompositeMapType(layers);
		},
		[svOpacity],
	);

	useEffect(() => {
		if (!containerRef.current || !map) return;
		mapOpenMark("mounted");
		let cancelled = false;
		let rafId: number;

		loadOpenSV().then(() => {
			if (cancelled || !containerRef.current) return;
			if (!google?.maps) return;
			gRef.current = google;

			if (!gMapRef.current) {
				gMapRef.current = new google.maps.Map(containerRef.current, {
					center: { lat: 0, lng: 0 },
					zoom: 2,
					minZoom: 1,
					disableDefaultUI: true,
					scaleControl: true,
					cameraControl: false,
					zoomControl: false,
					streetViewControl: false,
					fullscreenControl: false,
					mapTypeControl: false,
					clickableIcons: false,
					gestureHandling: "greedy",
					draggableCursor: "crosshair",
					styles: [{ stylers: [{ visibility: "off" }] }],
				});

				const custom = customStyles.find((s) => s.name === mapStyleName);
				const stack = buildMapStack({
					type: mapType,
					labels: showLabels,
					terrain: showTerrain,
					color: svColor,
					coverageType: svCoverageType,
					thickness: svThickness,
					useBlobby: svBlobby,
					boldCountry: boldCountryBorders,
					boldSubdivision: boldSubdivisionBorders,
					style: mapStyleName,
					customStyles: custom?.style,
				});
				gMapRef.current.mapTypes.set("stack", stack);
				gMapRef.current.setMapTypeId("stack");
				setGoogleMapInstance(gMapRef.current);

				gMapRef.current.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
					if (e.latLng) {
						if (coordDisplayRef.current) {
							coordDisplayRef.current.textContent = `${e.latLng.lat().toFixed(6)}Ãƒâ€šÃ‚Â° ${e.latLng.lng().toFixed(6)}Ãƒâ€šÃ‚Â°`;
						}
					}
				});
				gMapRef.current.addListener("zoom_changed", () => {
					setMapZoom(gMapRef.current?.getZoom() ?? 0);
				});
				setMapReady(true);
				mapOpenMark("map-ready");
				google.maps.event.addListenerOnce(gMapRef.current, "tilesloaded", () =>
					mapOpenMark("tiles"),
				);

				rafId = requestAnimationFrame(() => {
					if (cancelled) return;
					const overlay = new GoogleMapsOverlay({
						layers: [],
						pickingRadius: 2,
					});
					overlay.setMap(gMapRef.current);
					overlayRef.current = overlay;
					updateOverlay();
				});

				if (map.meta.locationCount > 0) {
					cmd.storeBounds(false).then((bounds) => {
						if (cancelled || !gMapRef.current || !bounds) return;
						const [west, south, east, north] = bounds as [number, number, number, number];
						const gm = gMapRef.current!;
						gm.fitBounds({ west, south, east, north });
						google.maps.event.addListenerOnce(gm, "bounds_changed", () => {
							gm.moveCamera({ center: gm.getCenter()!, zoom: gm.getZoom()! });
						});
					});
				}
			}
		});

		return () => {
			cancelled = true;
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, []);

	useEffect(() => {
		if (!svLayerRef.current) return;
		const blobbySingleType = svBlobby && mapZoom <= 13 && svCoverageType !== "default";
		svLayerRef.current.setOpacity(blobbySingleType ? svOpacity * 0.6 : svOpacity);
	}, [svOpacity, svBlobby, mapZoom, svCoverageType]);

	useEffect(() => {
		if (!svPanoramas || !gMapRef.current || mapZoom < 15) {
			setPanoDots([]);
			return;
		}
		const map = gMapRef.current;
		let cancelled = false;
		const load = async () => {
			const bounds = map.getBounds();
			if (!bounds) return;
			const ne = bounds.getNorthEast();
			const sw = bounds.getSouthWest();
			const tiles = boundsToTiles(sw.lng(), sw.lat(), ne.lng(), ne.lat());
			const results = await Promise.all(tiles.map(fetchPanoDots));
			if (!cancelled) setPanoDots(results.flat());
		};
		load();
		const listener = map.addListener("idle", load);
		return () => {
			cancelled = true;
			if (google?.maps) google.maps.event.removeListener(listener);
		};
	}, [svPanoramas, mapZoom]);

	const [fullResetCounter, setFullResetCounter] = useState(0);

	// Fetch render buffer from Rust ONLY when data changes (not on viewport pan).
	// deck.gl handles camera transforms on the GPU ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â cached buffer stays valid during pan.
	useEffect(() => {
		if (!mapReady) {
			cellMgrRef.current.clear();
			return;
		}

		let cancelled = false;
		const fetchRender = async () => {
			const t = trace("render", { summary: true });
			try {
				const filePath = await cmd.storeFillRenderFile({
					west: -180,
					south: -90,
					east: 180,
					north: 90,
					markerStyle,
				});
				t.step("fill");
				const resp = await fetch(mmaBufUrl(filePath));
				if (!resp.ok) throw new Error(`render fetch ${resp.status}: ${await resp.text()}`);
				const buf = await resp.arrayBuffer();
				t.step("fetch");
				if (cancelled) return;

				cellMgrRef.current.initFromBinary(buf);
				t.step("parse");
				mapOpenMark("markers");
				t.end({
					cells: cellMgrRef.current.cells.size,
					total: cellMgrRef.current.totalCount,
					bytes: buf.byteLength,
				});
				setRenderTick((t) => t + 1);
			} catch (e) {
				log.error("[render] fetchRender failed:", e);
			}
		};

		fetchRender();
		return () => {
			cancelled = true;
		};
	}, [mapReady, fullResetCounter, markerStyle]);

	useEffect(() => {
		const unsub1 = renderDeltaBus.on((delta) => {
			if (delta.fullReset) {
				setFullResetCounter((c) => c + 1);
				return;
			}
			const t = trace("delta", { summary: true });
			const cm = cellMgrRef.current;
			const affected = cm.applyDelta(delta);
			const aid = getActiveLocation()?.id ?? null;
			if (aid != null) {
				for (const cb of cm.cells.values()) {
					const idx = cb.idToIndex.get(aid);
					if (idx != null) {
						cb.patchColor(idx, 0, 0, 0, 0);
						break;
					}
				}
			}
			if (delta.colorPatches.length > 0) {
				const selPatches = delta.colorPatches.filter(
					(cp) => !(cp.r === 42 && cp.g === 42 && cp.b === 42),
				);
				cm.appendToSelectionOverlay(selPatches);
			}
			t.end({ affected: affected.size, added: delta.added.length, removed: delta.removed.length });
			if (affected.size > 0 || delta.colorPatches.length > 0) setRenderTick((t) => t + 1);
		});
		const unsub2 = selBitmaskBus.on((selColors, cellEntries, setIds) => {
			const t = trace("selection", { summary: true });
			const ids = cellMgrRef.current.applySelectionBitmasks(selColors, cellEntries);
			setIds(ids);
			t.end({ cells: cellEntries.length, sels: selColors.length, ids: ids.size });
			setRenderTick((t) => t + 1);
		});
		return () => {
			unsub1();
			unsub2();
		};
	}, []);

	useEffect(() => {
		if (svPreview?.url) return () => URL.revokeObjectURL(svPreview.url);
	}, [svPreview?.url]);

	useEffect(() => {
		if (!gMapRef.current || !showPreviews) {
			setSvPreview(null);
			return;
		}
		const map = gMapRef.current;
		if (!google?.maps) return;

		const moveListener = map.addListener("mousemove", async (e: google.maps.MapMouseEvent) => {
			if (!e.latLng) return;
			setSvPreview(null);
			previewAbortRef.current?.abort();
			const ac = new AbortController();
			previewAbortRef.current = ac;

			const lat = e.latLng.lat();
			const lng = e.latLng.lng();
			const zoom = map.getZoom() ?? 2;

			await new Promise((r) => setTimeout(r, 300));
			if (ac.signal.aborted) return;

			const sv = new google.maps.StreetViewService();
			sv.getPanorama(
				{
					location: { lat, lng },
					radius: svSearchRadius(lat, zoom),
					sources: [google.maps.StreetViewSource.GOOGLE],
					preference: google.maps.StreetViewPreference.NEAREST,
				},
				async (data: google.maps.StreetViewPanoramaData | null, status: string) => {
					if (ac.signal.aborted || status !== "OK" || !data?.location?.pano) return;
					const heading = data.tiles.centerHeading ?? 0;
					const url = svThumbnailUrl(data.location.pano, heading);
					try {
						const res = await fetch(url, { signal: ac.signal });
						if (!res.ok || ac.signal.aborted) return;
						const blob = await res.blob();
						if (ac.signal.aborted) return;
						setSvPreview({ url: URL.createObjectURL(blob) });
					} catch {
						// ignored
					}
				},
			);
		});

		const outListener = map.addListener("mouseout", () => {
			previewAbortRef.current?.abort();
			previewAbortRef.current = null;
			setSvPreview(null);
		});

		return () => {
			google.maps.event.removeListener(moveListener);
			google.maps.event.removeListener(outListener);
			previewAbortRef.current?.abort();
			setSvPreview(null);
		};
	}, [showPreviews]);

	const useBlobby = svBlobby && mapZoom <= 13;

	useEffect(() => {
		if (!gMapRef.current) return;
		if (!google?.maps) return;
		const custom = customStyles.find((s) => s.name === mapStyleName);
		const stack = buildMapStack({
			type: mapType,
			labels: showLabels,
			terrain: showTerrain,
			color: svColor,
			coverageType: svCoverageType,
			thickness: svThickness,
			useBlobby,
			boldCountry: boldCountryBorders,
			boldSubdivision: boldSubdivisionBorders,
			style: mapStyleName,
			customStyles: custom?.style,
		});
		gMapRef.current.mapTypes.set("stack", stack);
		gMapRef.current.setMapTypeId("stack");
	}, [
		mapType,
		showLabels,
		showTerrain,
		svColor,
		svCoverageType,
		svThickness,
		useBlobby,
		boldCountryBorders,
		boldSubdivisionBorders,
		mapStyleName,
		customStyles,
		buildMapStack,
	]);

	const updateOverlay = useCallback(() => {
		if (!overlayRef.current) return;
		const layers = buildLayers();
		overlayRef.current.setProps({
			layers,
			onClick: handleClick as GoogleMapsOverlayProps["onClick"],
			onHover: handleHover as GoogleMapsOverlayProps["onHover"],
			onError: (e: unknown) => log.error("[deck.gl overlay error]", e),
		});
	}, [buildLayers, handleClick, handleHover]);

	useEffect(() => {
		updateOverlay();
	}, [
		mapVer,
		renderTick,
		map?.meta.tags,
		selected,
		selectedTags,
		activeLocation?.id,
		markerOpacity,
		markerStyle,
		showPerfectScoreCircle,
		svPanoramas,
		panoDots,
		isMeasuring,
		latLngAnchor,
		trailVersion,
		importMarkerVersion,
		diffMarkerVersion,
	]);

	useEffect(() => {
		return () => {
			overlayRef.current?.setMap(null);
			overlayRef.current?.finalize();
		};
	}, []);

	const handleSearchResult = useCallback((lat: number, lng: number, _name: string) => {
		if (!gMapRef.current) return;
		if (!google?.maps) return;
		const bounds = new google.maps.LatLngBounds(
			{ lat: lat - 0.003, lng: lng - 0.003 },
			{ lat: lat + 0.003, lng: lng + 0.003 },
		);
		gMapRef.current.fitBounds(bounds);
	}, []);

	const zoomIn = useCallback(() => {
		if (gMapRef.current) gMapRef.current.setZoom((gMapRef.current.getZoom() ?? 0) + 1);
	}, []);

	const zoomOut = useCallback(() => {
		if (gMapRef.current) gMapRef.current.setZoom(Math.max(1, (gMapRef.current.getZoom() ?? 0) - 1));
	}, []);

	const showFps = useSetting("showFps");

	useMapKeyboardNav();

	useHotkey(useBinding("mapZoomReset"), () => {
		const gm = gMapRef.current;
		if (gm) gm.moveCamera({ zoom: 1 });
	});

	useHotkey(useBinding("toggleSelectOnly"), () => {
		setPrefs((p) => ({ ...p, selectOnly: !p.selectOnly }));
	});
	useHotkey(useBinding("mapZoomBounds"), () => {
		cmd.storeBounds(false).then((bounds) => {
			const gm = gMapRef.current;
			if (!gm || !bounds || !google?.maps) return;
			const [west, south, east, north] = bounds as [number, number, number, number];
			gm.fitBounds({ west, south, east, north });
			google.maps.event.addListenerOnce(gm, "bounds_changed", () => {
				gm.moveCamera({ center: gm.getCenter()!, zoom: gm.getZoom()! });
			});
		});
	});

	useHotkey(useBinding("mapZoomSelection"), () => {
		cmd.storeBounds(true).then((bounds) => {
			const gm = gMapRef.current;
			if (!gm || !bounds || !google?.maps) return;
			const [west, south, east, north] = bounds as [number, number, number, number];
			gm.fitBounds({ west, south, east, north });
			google.maps.event.addListenerOnce(gm, "bounds_changed", () => {
				gm.moveCamera({ center: gm.getCenter()!, zoom: gm.getZoom()! });
			});
		});
	});



	return (
		<ContextMenu.Root modal={false}>
			<div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
			{showFps && <FpsCounter />}
			<div className="embed-controls">
				{/* TopLeft: Map dropdown, Search */}
				<div
					className="embed-controls__control"
					style={{ top: 0, left: 0, display: "flex", alignItems: "flex-start" }}
				>
					<MapTypeDropdown
						layerConfig={{
							basemap: mapType,
							setBasemap: pref("mapType"),
							labels: showLabels,
							setLabels: pref("showLabels"),
							supportsLabels: mapType !== "osm",
							terrain: showTerrain,
							setTerrain: pref("showTerrain"),
							supportsTerrain: mapType === "map" || mapType === "satellite",
							streetViewPanoramas: svPanoramas,
							setStreetViewPanoramas: pref("svPanoramas"),
							streetViewCoverageType: svCoverageType,
							setStreetViewCoverageType: pref("svCoverageType"),
							svColor,
							setSvColor: pref("svColor"),
							streetViewCoverageThickness: svThickness,
							setStreetViewCoverageThickness: pref("svThickness"),
							streetViewBlobby: svBlobby,
							setStreetViewBlobby: pref("svBlobby"),
							boldCountryBorders,
							setBoldCountryBorders: pref("boldCountryBorders"),
							boldSubdivisionBorders,
							setBoldSubdivisionBorders: pref("boldSubdivisionBorders"),
							mapStyleName,
							setMapStyleName: pref("mapStyleName"),
							customStyles,
							onManageStyles: () => setShowStylesDialog(true),
						}}
					/>
					<SearchControl onResult={handleSearchResult} />
				</div>
				{/* LeftTop: polygon/rectangle drawing tools */}
				{mapReady && (
					<div className="embed-controls__control" style={{ left: 0, top: "52px" }}>
						<PolygonTools
							map={gMapRef.current}
							onDraw={(rings) => {
								if (rings.length === 0) return;
								if (tryInterceptDraw(rings)) return;
								selectPolygon({ coordinates: rings as [number, number][][] });
							}}
							freehandPathRef={freehandPathRef}
							requestOverlayUpdate={updateOverlay}
						/>
					</div>
				)}
				{/* TopRight: Map settings, SV opacity slider */}
				<div
					className="embed-controls__control"
					style={{
						top: 0,
						right: 0,
						display: "flex",
						alignItems: "flex-start",
					}}
				>
					<MapSettingsDropdown
						settings={{
							markerStyle,
							setMarkerStyle: pref("markerStyle"),
							showPerfectScoreCircle,
							setShowPerfectScoreCircle: pref("showPerfectScoreCircle"),
							showPreviews,
							setShowPreviews: pref("showPreviews"),
							selectOnly,
							setSelectOnly: pref("selectOnly"),
						}}
					/>
					<div className="map-control sv-opacity-control">
						<button
							className="opacity-target-toggle"
							onClick={() => setOpacityTarget((t) => (t === "sv" ? "markers" : "sv"))}
							role="tooltip"
							aria-label={
								opacityTarget === "sv" ? "Adjusting Street View opacity" : "Adjusting marker opacity"
							}
							data-microtip-position="left"
						>
							<Icon path={opacityTarget === "sv" ? mdiGoogleStreetView : mdiMapMarker} size={20} />
						</button>
						<input
							className="sv-opacity-control__slider"
							type="range"
							min={0}
							max={1}
							step={0.05}
							value={opacityTarget === "sv" ? svOpacity : markerOpacity}
							onChange={(e) =>
								pref(opacityTarget === "sv" ? "svOpacity" : "markerOpacity")(Number(e.target.value))
							}
							title={opacityTarget === "sv" ? "Street View layer opacity" : "Marker layer opacity"}
						/>
					</div>
				</div>
				<div className="embed-controls__control" style={{ right: 0, bottom: 0 }}>
					<div className="map-control map-control--button white">
						<button
							onClick={zoomIn}
							role="tooltip"
							aria-label="Zoom in"
							data-microtip-position="left"
						>
							<svg height="18" width="18" viewBox="0 0 24 24" fill="currentColor">
								<path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" />
							</svg>
						</button>
						<button
							onClick={zoomOut}
							role="tooltip"
							aria-label="Zoom out"
							data-microtip-position="left"
						>
							<svg height="18" width="18" viewBox="0 0 24 24" fill="currentColor">
								<path d="M19,13H5V11H19V13Z" />
							</svg>
						</button>
					</div>
				</div>
				{svPreview && (
					<div className="embed-controls__control" style={{ bottom: "40px", left: 0 }}>
						<div className="map-control sv-preview-control">
							<figure className="sv-preview-control__window">
								<img src={svPreview.url} width={320} height={180} />
								{svPreview.date && (
									<figcaption className="sv-preview-control__caption">
										<span>{svPreview.date}</span>
									</figcaption>
								)}
							</figure>
						</div>
					</div>
				)}
				<MeasurementBar />
				<div className="embed-controls__control" style={{ bottom: 0, left: 0 }}>
					<div className="map-control coordinate-control">
						<span ref={coordDisplayRef} /> Ãƒâ€šÃ‚Â· zoom {mapZoom}
					</div>
				</div>
			</div>
			{showStylesDialog && (
				<Dialog open onOpenChange={(open) => !open && setShowStylesDialog(false)}>
					<DialogContent title="Manage map styles" className="map-styles-modal">
						{customStyles.length > 0 && (
							<ul className="map-style-list">
								{customStyles.map((s) => (
									<li key={s.name} className="map-style-thumb">
										<span className="map-style-thumb__name">{s.name}</span>
										<div className="map-style-thumb__actions">
											<button
												className="icon-button"
												style={{ color: "var(--sand-11)" }}
												onClick={() => {
													navigator.clipboard.writeText(JSON.stringify(s.style, null, 2));
												}}
												aria-label="Copy JSON"
											>
												<svg height="20" width="20" viewBox="0 0 24 24" fill="currentColor">
													<path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z" />
												</svg>
											</button>
											<button
												className="icon-button"
												style={{ color: "var(--sand-11)" }}
												onClick={() => {
													const next = customStyles.filter((c) => c.name !== s.name);
													setCustomStyles(next);
													localStorage.setItem("mma_custom_styles", JSON.stringify(next));
													if (mapStyleName === s.name) pref("mapStyleName")("default");
												}}
												aria-label="Delete style"
											>
												<svg height="20" width="20" viewBox="0 0 24 24" fill="currentColor">
													<path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" />
												</svg>
											</button>
										</div>
									</li>
								))}
							</ul>
						)}
						<strong>New style</strong>
						<p style={{ margin: 0 }}>Paste a Google Maps style JSON array below.</p>
						<form
							onSubmit={(ev) => {
								ev.preventDefault();
								const fd = new FormData(ev.currentTarget);
								const name = (fd.get("name") as string)?.trim();
								const raw = (fd.get("style") as string)?.trim();
								if (!name || !raw) return;
								try {
									const style = JSON.parse(raw);
									if (!Array.isArray(style)) return;
									const next = [...customStyles.filter((s) => s.name !== name), { name, style }];
									setCustomStyles(next);
									localStorage.setItem("mma_custom_styles", JSON.stringify(next));
									ev.currentTarget.reset();
								} catch {
									// ignored
								}
							}}
						>
							<p>
								<input
									name="name"
									className="input"
									placeholder="Style name"
									required
									style={{ width: "100%" }}
								/>
							</p>
							<p>
								<textarea
									name="style"
									className="input"
									placeholder='[{"featureType":"water","stylers":[{"color":"#ff0000"}]}]'
									rows={5}
									style={{
										width: "100%",
										fontFamily: "monospace",
										fontSize: "0.8rem",
									}}
									required
								/>
							</p>
							<p>
								<button type="submit" className="button button--primary">
									Upload
								</button>
							</p>
						</form>
					</DialogContent>
				</Dialog>
			)}
			<ContextMenu.Trigger asChild>
				<span ref={contextTriggerRef} title="Context menu" />
			</ContextMenu.Trigger>
			<ContextMenu.Portal>
				<MapContextMenuContent mapRef={gMapRef} />
			</ContextMenu.Portal>
		</ContextMenu.Root>
	);
}
