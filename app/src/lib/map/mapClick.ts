import type { PickingInfo } from "@deck.gl/core";
import type { CellManager } from "@/lib/render/CellManager";
import { MARKER_STYLE } from "@/lib/render/markerLayer";
import { markerDistancePx, PICK_SLOP_PX } from "@/lib/render/sdf-marker-layer/markerMesh";
import type { MapHost } from "@/lib/map/host";
import { latLngToWorld } from "@/lib/geo/mercator";
import { cmd } from "@/lib/commands";
import { lookupStreetView, showToast } from "@/lib/sv/lookup";
import { tryInterceptClick } from "@/lib/map/mapState";
import { openSeenEntry, isSeenOverlayActive, getSeenOverlayEntries } from "@/lib/seen/seenOverlay";
import { openContextMenuLatLng, openContextMenuLocation } from "@/lib/sv/measure";
import { trace } from "@/lib/util/debug";
import { log } from "@/lib/util/log";
import {
	addLocations,
	getActiveLocation,
	getCurrentMap,
	getWorkArea,
	getImportPreviewPositions,
	openStagedLocation,
	resolveLocation,
	setActiveLocation,
	toggleManualSelection,
} from "@/store/useMapStore";
import { isVirtualLocation, isImportPreview, locId } from "@/types";
import type { MarkerStyle, MaybeLocation } from "@/types";
import type { Location } from "@/bindings.gen";

// ---------------------------------------------------------------------------
// CPU marker picking
// ---------------------------------------------------------------------------
// Marker layers are not deck-pickable; a click/hover resolves against the same
// data the renderer draws, in reverse draw order:
//   active marker > import preview > selection overlay > seen dots > base cells.
// Base cells resolve in Rust (spatial-grid backed, exact shape coverage, painter's
// order); the JS-only marker sets (active, preview, seen, LOD reps) resolve here.

export type MarkerPick =
	| { kind: "location"; picked: MaybeLocation | number }
	| { kind: "staged"; index: number }
	| { kind: "seen"; index: number };

interface PickCtx {
	cm: CellManager;
	zoom: number;
	markerStyle: MarkerStyle;
	markerSize: number;
	markerOpacity: number;
	/** The band the surface is drawing (null = full detail) — the hit-test must
	 *  query what is rendered, so this comes from the surface, not from zoom. */
	lodBand: number | null;
}

/** Cursor offset from a marker anchor in screen pixels (y down) at `zoom`. */
function pxOffset(
	cursor: { x: number; y: number },
	lat: number,
	lng: number,
	scale: number,
): { dx: number; dy: number } {
	const w = latLngToWorld({ lat, lng });
	return { dx: cursor.x - w.x * scale, dy: cursor.y - w.y * scale };
}

/** Topmost covering index in an interleaved [lng, lat] position array, or -1. */
function scanDots(
	positions: ArrayLike<number>,
	count: number,
	cursor: { x: number; y: number },
	scale: number,
	radiusPx: number,
): number {
	let hit = -1;
	for (let i = 0; i < count; i++) {
		const { dx, dy } = pxOffset(cursor, positions[i * 2 + 1], positions[i * 2], scale);
		if (markerDistancePx("circle", dx, dy, radiusPx) <= PICK_SLOP_PX) hit = i;
	}
	return hit;
}

export async function pickMarkerAt(
	lat: number,
	lng: number,
	ctx: PickCtx,
): Promise<MarkerPick | null> {
	const style = MARKER_STYLE[ctx.markerStyle];
	const radiusPx = style.radiusPixels * ctx.markerSize;
	const scale = Math.pow(2, ctx.zoom);
	const cw = latLngToWorld({ lat, lng });
	const cursor = { x: cw.x * scale, y: cw.y * scale };

	// Active marker: drawn topmost, always full size.
	const active = getActiveLocation();
	if (active) {
		const { dx, dy } = pxOffset(cursor, active.lat, active.lng, scale);
		const angle = style.angle ? -active.heading : 0;
		if (markerDistancePx(style.shape, dx, dy, radiusPx, angle) <= PICK_SLOP_PX) {
			return { kind: "location", picked: active };
		}
	}

	// Import preview dots (above the selection overlay, below the active marker).
	if (getWorkArea() === "import" || (active != null && isImportPreview(active))) {
		const pos = getImportPreviewPositions();
		const idx = scanDots(pos, pos.length / 2, cursor, scale, 6);
		if (idx >= 0) return { kind: "staged", index: idx };
	}

	const seenHit = (): MarkerPick | null => {
		if (!isSeenOverlayActive()) return null;
		const entries = getSeenOverlayEntries();
		let hit = -1;
		for (let i = 0; i < entries.length; i++) {
			const { dx, dy } = pxOffset(cursor, entries[i].lat, entries[i].lng, scale);
			if (markerDistancePx("circle", dx, dy, 5) <= PICK_SLOP_PX) hit = i;
		}
		return hit >= 0 ? { kind: "seen", index: hit } : null;
	};

	const band = ctx.lodBand;
	if (band == null) {
		// Full detail: Rust resolves overlay + base in painter's order.
		let hits: { id: number; selected: boolean }[] = [];
		try {
			hits = await cmd.storePick(lat, lng, ctx.zoom, ctx.markerStyle, ctx.markerSize);
		} catch (e) {
			log.error("[pick] storePick failed:", e);
		}
		if (ctx.markerOpacity <= 0) hits = hits.filter((h) => h.selected);
		if (hits.length > 0 && hits[0].selected) return { kind: "location", picked: hits[0].id };
		const seen = seenHit();
		if (seen) return seen;
		if (hits.length > 0) return { kind: "location", picked: hits[0].id };
		return null;
	}

	// Aggregated view: the hit-test queries what is rendered — the decimated
	// selection overlay (on top) and the band's representatives, never the
	// full-detail set.
	const cm = ctx.cm;
	if (cm.selOverlayCount > 0) {
		const sel = cm.getSelOverlayLod(band);
		let hit = -1;
		for (let i = 0; i < sel.count; i++) {
			const { dx, dy } = pxOffset(cursor, sel.positions[i * 2 + 1], sel.positions[i * 2], scale);
			const angle = style.angle ? sel.angles[i] : 0;
			if (markerDistancePx(style.shape, dx, dy, radiusPx, angle) <= PICK_SLOP_PX) hit = i;
		}
		if (hit >= 0) return { kind: "location", picked: sel.ids[hit] };
	}
	const seen = seenHit();
	if (seen) return seen;
	if (ctx.markerOpacity > 0) {
		let hitId: number | null = null;
		for (const cell of cm.cells.values()) {
			if (cell.count === 0) continue;
			const lod = cell.getLod(band);
			for (let i = 0; i < lod.count; i++) {
				if (lod.colors[i * 4 + 3] === 0) continue; // hidden rep (selected/active)
				const { dx, dy } = pxOffset(cursor, lod.positions[i * 2 + 1], lod.positions[i * 2], scale);
				const angle = style.angle ? lod.angles[i] : 0;
				if (markerDistancePx(style.shape, dx, dy, radiusPx, angle) <= PICK_SLOP_PX) {
					hitId = lod.ids[i];
				}
			}
		}
		if (hitId != null) return { kind: "location", picked: hitId };
	}
	return null;
}

// ---------------------------------------------------------------------------
// Click / hover pipeline
// ---------------------------------------------------------------------------

// Create a location from a map click: snap to nearest SV coverage under the active
// map's settings, add it, make it active. Shared by the editor map and the minimap.
// Work-area guards live here so neither call site has to repeat them.
export async function createLocationAtLatLng(
	lat: number,
	lng: number,
	zoom: number,
	opts?: { container?: HTMLElement | null },
): Promise<Location | null> {
	const area = getWorkArea();
	if (area === "plugin" || area === "import" || area === "diff") return null;
	const active = getActiveLocation();
	if (active != null && isImportPreview(active)) return null;

	const t = trace("add");
	const ms = getCurrentMap()?.meta.settings;
	const loc = await lookupStreetView(lat, lng, zoom, {
		preferOfficial: ms?.preferOfficial,
		onlyOfficial: ms?.onlyOfficial,
		pointAlongRoad: ms?.pointAlongRoad,
		preferDirection: ms?.preferDirection,
		defaultPanoId: ms?.defaultPanoId,
		preferHigherQuality: ms?.preferHigherQuality,
		minRadius: ms?.searchRadius ?? undefined,
	});
	if (!loc) {
		if (opts?.container) showToast(opts.container, "No coverage found at this location.");
		return null;
	}
	t.step("lookup");
	await addLocations([loc], { hideInDelta: true });
	t.step("addLocations");
	setActiveLocation(loc);
	t.step("setActive");
	t.end();
	return loc;
}

// Capabilities a map surface grants its click pipeline. Behavior only — UI lives in the
// consumer. The editor map passes the full set; the minimap passes a reduced one.
export interface MapClickCtx {
	cm: CellManager;
	host: MapHost | null;
	markerStyle: MarkerStyle;
	markerSize: number;
	markerOpacity: number;
	lodBand: number | null;
	selectOnly?: boolean;
	measuring?: boolean;
	// Dispatch the surface's context menu at the given client coords. Absent => the
	// surface has no context menu and ignores right-click (the minimap).
	onContextMenu?: (clientX: number, clientY: number) => void;
}

function pickCtx(ctx: MapClickCtx): PickCtx {
	return {
		cm: ctx.cm,
		zoom: ctx.host?.getZoom() ?? 2,
		markerStyle: ctx.markerStyle,
		markerSize: ctx.markerSize,
		markerOpacity: ctx.markerOpacity,
		lodBand: ctx.lodBand,
	};
}

export async function handleMapClick(
	info: PickingInfo,
	domEvent: Event | undefined,
	ctx: MapClickCtx,
): Promise<void> {
	if (!info.coordinate) return;
	const lat = info.coordinate[1];
	const lng = info.coordinate[0];

	if (domEvent instanceof MouseEvent && domEvent.button === 2) {
		if (!ctx.onContextMenu) return;
		const pick = await pickMarkerAt(lat, lng, pickCtx(ctx));
		if (pick?.kind === "location") {
			const loc = await resolveLocation(pick.picked);
			if (loc) openContextMenuLocation(loc);
			else openContextMenuLatLng({ lat, lng });
		} else {
			openContextMenuLatLng({ lat, lng });
		}
		ctx.onContextMenu(domEvent.clientX, domEvent.clientY);
		return;
	}

	if (domEvent instanceof MouseEvent && domEvent.button !== 0) return;

	if (ctx.measuring) return;

	if (tryInterceptClick(lat, lng, domEvent instanceof MouseEvent && domEvent.shiftKey)) return;

	const pick = await pickMarkerAt(lat, lng, pickCtx(ctx));
	if (pick) {
		// Staged import markers open a read-only preview; seen dots open the visited
		// pano. Neither falls through to SV lookup.
		if (pick.kind === "staged") return void openStagedLocation(pick.index);
		if (pick.kind === "seen") return void openSeenEntry(pick.index);
		const picked = pick.picked;
		if (isVirtualLocation({ id: locId(picked) })) return; // staged location's active pin: already open
		if (domEvent instanceof MouseEvent && domEvent.ctrlKey) toggleManualSelection(locId(picked));
		else setActiveLocation(picked); // fetches once iff lazy; free if materialized
		return;
	}

	const container = ctx.host?.container ?? null;
	if (ctx.selectOnly) {
		if (container) showToast(container, "Select-only mode is on.");
		return;
	}
	await createLocationAtLatLng(lat, lng, ctx.host?.getZoom() ?? 2, { container });
}

// Hover only sets the pointer cursor. Throttled: the CPU pick is cheap, but not
// per-mousemove cheap (base-cell hits round-trip to Rust).
const HOVER_THROTTLE_MS = 80;
let hoverLast = 0;
let hoverInflight = false;

export function handleMapHover(
	info: PickingInfo,
	domEvent: Event | undefined,
	ctx: MapClickCtx,
): void {
	const target = (domEvent as MouseEvent | undefined)?.target as HTMLElement | null;
	if (!target) return;
	if (!info.coordinate) {
		target.style.cursor = "";
		return;
	}
	const now = performance.now();
	if (hoverInflight || now - hoverLast < HOVER_THROTTLE_MS) return;
	hoverLast = now;
	hoverInflight = true;
	const lat = info.coordinate[1];
	const lng = info.coordinate[0];
	void pickMarkerAt(lat, lng, pickCtx(ctx))
		.then((pick) => {
			if (target.isConnected) target.style.cursor = pick ? "pointer" : "";
		})
		.finally(() => {
			hoverInflight = false;
		});
}
