import type { PickingInfo } from "@deck.gl/core";
import type { CellManager } from "@/lib/render/CellManager";
import type { MapHost } from "@/lib/map/host";
import { LOCATION_LAYER_ID } from "@/lib/render/buildSceneLayers";
import { cmd } from "@/lib/commands";
import { clickSearchRadius, lookupStreetView } from "@/lib/sv/lookup";
import { toast } from "@/lib/util/toast";
import { t as tr } from "@/lib/i18n";
import { tryInterceptClick, fitMapToBounds } from "@/lib/map/mapState";
import { getSettings } from "@/store/settings";
import type { ParsedLocation } from "@/lib/data/importExport";
import { openSeenEntry } from "@/lib/seen/seenOverlay";
import { openContextMenuLatLng, openContextMenuLocation } from "@/lib/map/contextMenu";
import { trace } from "@/lib/util/debug";
import {
	addLocations,
	createTags,
	getMapState,
	openStagedLocation,
	resolveLocation,
	setActiveLocation,
	toggleManualSelection,
} from "@/store/useMapStore";
import { isVirtualLocation, isImportPreview, locId, createLocation } from "@/types";
import type { MaybeLocation, Bounds } from "@/types";
import type { Location } from "@/bindings.gen";
import {
	getEnabledAltProviders,
	getProviderSettings,
} from "@/lib/sv/providers/settings";
import type { AltSvProviderId } from "@/lib/sv/providers/types";
import { createAppleLocationAtLatLng } from "@/lib/sv/lookaround/click";
import {
	createInjectProviderLocationAtLatLng,
	isInjectProviderId,
} from "@/lib/sv/providers/race";
import { createYandexLocationAtLatLng } from "@/lib/sv/yandex/click";

export const isLocationLayer = (id?: string) =>
	id?.startsWith(LOCATION_LAYER_ID) ||
	id?.startsWith("cell:") ||
	id === "sel-overlay" ||
	id === "import-preview";

// Resolve a deck.gl pick to a location id from the shared cell/selection buffers.
// Index-based (the SDF cell and selection-overlay layers carry no per-feature object);
// falls back to Rust for cells the JS buffer hasn't materialized yet.
export async function resolvePickedId(cm: CellManager, info: PickingInfo): Promise<number | null> {
	if (typeof info.index !== "number" || info.index < 0) return null;
	const layerId = info.layer?.id ?? "";
	if (layerId === "sel-overlay") return cm.overlay.ids[info.index] ?? null;
	if (layerId.startsWith("cell:")) {
		const cellKey = layerId.split(":")[1];
		const local = cm.resolvePickFromCell(cellKey, info.index);
		if (local != null) return local;
		return await cmd.storeResolvePick(cellKey, info.index);
	}
	return null;
}

function zoomToPasted(bounds: Bounds | null, padding = 0) {
	if (!getSettings().panToImported) return;
	fitMapToBounds(bounds, padding, getSettings().pastePadding);
}

/** Add already-parsed locations (paste, URL lists, doc links): resolve tag
 *  names to tags, add, activate the last one, pan to fit. */
export async function addParsedLocations(parsed: ParsedLocation[]) {
	const tagNames = [...new Set(parsed.flatMap((p) => p.tags))];
	const resolved = await createTags(tagNames);
	const tagIdByName = new Map(resolved.map((t) => [t.name.toLowerCase(), t.id]));
	const locs = parsed.map((p) =>
		createLocation({
			...p,
			tags: p.tags
				.map((n) => tagIdByName.get(n.toLowerCase()))
				.filter((id): id is number => id !== undefined),
		}),
	);
	await addLocations(locs);
	setActiveLocation(locs[locs.length - 1].id);
	const lats = locs.map((l) => l.lat);
	const lngs = locs.map((l) => l.lng);
	zoomToPasted({
		west: Math.min(...lngs),
		south: Math.min(...lats),
		east: Math.max(...lngs),
		north: Math.max(...lats),
	});
}

// ---------------------------------------------------------------------------
// Click / hover pipeline
// ---------------------------------------------------------------------------

async function tryAltProviderAtLatLng(
	id: AltSvProviderId,
	lat: number,
	lng: number,
): Promise<Location | null> {
	switch (id) {
		case "apple":
			return createAppleLocationAtLatLng(lat, lng);
		case "yandex":
			return createYandexLocationAtLatLng(lat, lng);
		case "baidu":
		case "tencent":
			// Handled via createInjectProviderLocationAtLatLng (parallel race).
			return null;
		default:
			return null;
	}
}

// Create a location from a map click: snap to nearest SV coverage under the active
// map's settings, add it, make it active. Shared by the editor map and the minimap.
// Work-area guards live here so neither call site has to repeat them.
// Alt providers are tried first in priority order; Google is the fallback (or sole
// provider when no alts are enabled, or alts have fallbackToGoogle set).
export async function createLocationAtLatLng(
	lat: number,
	lng: number,
	zoom: number,
	opts?: { container?: HTMLElement | null },
): Promise<Location | null> {
	const area = getMapState().workArea;
	if (area === "plugin" || area === "import" || area === "diff" || area === "providers")
		return null;
	const active = getMapState().activeLocation;
	if (active != null && isImportPreview(active)) return null;

	const t = trace("add");
	const alts = getEnabledAltProviders();
	const ms = getMapState().map?.meta.settings;
	const radiusM = clickSearchRadius(lat, zoom, ms?.searchRadius ?? undefined);
	let fallbackToGoogle = false;
	let triedInjectRace = false;

	for (const provider of alts) {
		if (getProviderSettings(provider.id).fallbackToGoogle) fallbackToGoogle = true;
		if (isInjectProviderId(provider.id)) {
			if (triedInjectRace) continue;
			triedInjectRace = true;
			const loc = await createInjectProviderLocationAtLatLng(lat, lng, radiusM);
			t.step("inject");
			if (loc) {
				t.end();
				return loc;
			}
			continue;
		}
		const loc = await tryAltProviderAtLatLng(provider.id, lat, lng);
		t.step(provider.id);
		if (loc) {
			t.end();
			return loc;
		}
	}

	const tryGoogle = alts.length === 0 || fallbackToGoogle;
	if (!tryGoogle) {
		t.end();
		if (opts?.container) toast(tr("toast.noCoverage"), 1500, opts.container);
		return null;
	}

	const loc = await lookupStreetView(lat, lng, zoom, {
		preferOfficial: ms?.preferOfficial,
		onlyOfficial: ms?.onlyOfficial,
		pointAlongRoad: ms?.pointAlongRoad,
		preferDirection: ms?.preferDirection,
		defaultPanoId: ms?.defaultPanoId,
		preferHigherQuality: ms?.preferHigherQuality,
		minRadius: ms?.searchRadius ?? undefined,
	});
	t.step("google");
	if (!loc) {
		t.end();
		if (opts?.container) toast(tr("toast.noCoverage"), 1500, opts.container);
		return null;
	}
	loc.provider = loc.provider ?? "google";
	t.step("lookup");
	await addLocations([loc]);
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
	selectOnly?: boolean;
	measuring?: boolean;
	// Dispatch the surface's context menu at the given client coords. Absent => the
	// surface has no context menu and ignores right-click (the minimap).
	onContextMenu?: (clientX: number, clientY: number) => void;
}

export async function handleMapClick(
	info: PickingInfo,
	domEvent: Event | undefined,
	ctx: MapClickCtx,
): Promise<void> {
	// Staged import markers open a read-only preview; never fall through to SV lookup.
	if (info.layer?.id === "import-preview") {
		if (typeof info.index === "number" && info.index >= 0) void openStagedLocation(info.index);
		return;
	}

	// Seen-overlay dots open the visited pano; never fall through to a map-click create.
	if (info.layer?.id === "seen-overlay") {
		if (typeof info.index === "number" && info.index >= 0) void openSeenEntry(info.index);
		return;
	}

	const resolvePicked = async (): Promise<MaybeLocation | null> => {
		if (info.object) return info.object as Location;
		return await resolvePickedId(ctx.cm, info);
	};

	if (domEvent instanceof MouseEvent && domEvent.button === 2) {
		if (!ctx.onContextMenu) return;
		if (isLocationLayer(info.layer?.id)) {
			const picked = await resolvePicked();
			const loc = picked == null ? null : await resolveLocation(picked);
			if (loc) openContextMenuLocation(loc);
			else if (info.coordinate)
				openContextMenuLatLng({ lat: info.coordinate[1], lng: info.coordinate[0] });
		} else if (info.coordinate) {
			openContextMenuLatLng({ lat: info.coordinate[1], lng: info.coordinate[0] });
		}
		ctx.onContextMenu(domEvent.clientX, domEvent.clientY);
		return;
	}

	if (domEvent instanceof MouseEvent && domEvent.button !== 0) return;

	// Interceptors first: the measure tool consumes the click to place a node.
	if (
		info.coordinate &&
		(await tryInterceptClick(
			info.coordinate[1],
			info.coordinate[0],
			domEvent instanceof MouseEvent && domEvent.shiftKey,
		))
	)
		return;

	if (ctx.measuring) return;

	if (isLocationLayer(info.layer?.id)) {
		const picked = await resolvePicked();
		if (picked != null) {
			if (isVirtualLocation({ id: locId(picked) })) return; // staged location's active pin: already open
			if (domEvent instanceof MouseEvent && domEvent.ctrlKey) toggleManualSelection(locId(picked));
			else setActiveLocation(picked); // fetches once iff lazy; free if materialized
			return;
		}
	}

	if (info.coordinate) {
		const container = ctx.host?.container ?? null;
		if (ctx.selectOnly) {
			if (container) toast(tr("toast.selectOnlyMode"), 1500, container);
			return;
		}
		await createLocationAtLatLng(info.coordinate[1], info.coordinate[0], ctx.host?.getZoom() ?? 2, {
			container,
		});
	}
}

export function handleMapHover(info: PickingInfo, domEvent?: Event): void {
	const over =
		info.object != null ||
		(isLocationLayer(info.layer?.id) === true && typeof info.index === "number" && info.index >= 0);
	const target = (domEvent as MouseEvent | undefined)?.target as HTMLElement | null;
	if (target) target.style.cursor = over ? "pointer" : "";
}
