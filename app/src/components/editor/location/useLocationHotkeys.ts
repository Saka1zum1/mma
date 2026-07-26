import {
	useEffect,
	useEffectEvent,
	useRef,
	type Dispatch,
	type RefObject,
	type SetStateAction,
} from "react";
import type { Location } from "@/bindings.gen";
import { getMapState, getVisibleTags, duplicateLocation, addLocations } from "@/store/useMapStore";
import { sortTagsByMode } from "@/lib/util/util";
import { useHotkey } from "@/lib/hooks/useHotkey";
import { useBinding } from "@/lib/util/hotkeys";
import { getSettings, setSetting, MOVEMENT_CYCLE, MOVEMENT_MODES } from "@/store/settings";
import { PANO_ZOOM } from "@/lib/sv/constants";
import { tweenPov } from "@/lib/sv/tweenPov";
import { type PanoReference, nearestLinkHeading, followLinkedPanos } from "@/lib/sv/lookup";
import { toast } from "@/lib/util/toast";
import { t, tp } from "@/lib/i18n";
import { downloadPano } from "@/lib/sv/panoDownload";
import { getLocationProvider } from "@/lib/sv/providers/types";
import { isVirtualLocation } from "@/types";
import { cycle } from "@/types/util";
import { reviewNext, reviewPrev } from "@/lib/review/review";
import { registerMapKeyActionHandler } from "@/lib/map/mapKeyBindings";
import { cmd } from "@/lib/commands";
import { log } from "@/lib/util/log";
import { toggleViewportLock } from "@/lib/sv/viewportLock";
import { sendHideCar } from "./PanoControls";
import { singletonPano, getPanorama, clearSingletonPano } from "@/lib/sv/panoSingleton";
import { google } from "@/lib/sv/opensv";

interface LocationHotkeyDeps {
	location: Location | null;
	isReviewMode: boolean;
	panoDates: PanoReference[];
	selectedPanoId: string | null;
	currentPano: Pick<google.maps.StreetViewPanoramaData, "location" | "imageDate"> | null;
	cancelTweenRef: RefObject<(() => void) | null>;
	pendingTags: string[];
	setPendingTags: Dispatch<SetStateAction<string[]>>;
	fullscreenContainerRef: RefObject<HTMLDivElement | null>;
	panoContainerRef: RefObject<HTMLDivElement | null>;
	/** Active Street View / Apple / Yandex proxy. Falls back to Google singleton. */
	panoramaRef?: RefObject<google.maps.StreetViewPanorama | null | undefined>;
	handleSave: () => void;
	handleClose: () => void;
	handleDelete: () => void;
	handleReturnToSpawn: () => void;
	handleDateChange: (panoId: string | null) => void;
}

export function useLocationHotkeys(deps: LocationHotkeyDeps) {
	const {
		location,
		isReviewMode,
		panoDates,
		selectedPanoId,
		currentPano,
		cancelTweenRef,
		pendingTags,
		setPendingTags,
		fullscreenContainerRef,
		panoContainerRef,
		panoramaRef,
		handleSave,
		handleClose,
		handleDelete,
		handleReturnToSpawn,
		handleDateChange,
	} = deps;

	// Ref stays current for hotkey handlers (cannot use useEffectEvent outside Effects).
	const panoramaRefKeep = useRef(panoramaRef);
	panoramaRefKeep.current = panoramaRef;
	const getPano = () => panoramaRefKeep.current?.current ?? singletonPano;

	useHotkey(useBinding("locationSave"), () => {
		if (location) handleSave();
	});
	useHotkey(useBinding("locationClose"), () => {
		handleClose();
	});
	useHotkey(useBinding("locationDelete"), () => {
		if (location) handleDelete();
	});
	useHotkey(useBinding("reviewNext"), () => {
		if (isReviewMode) reviewNext();
	});
	useHotkey(useBinding("reviewPrev"), () => {
		if (isReviewMode) reviewPrev();
	});
	useHotkey(useBinding("returnToSpawn"), () => {
		handleReturnToSpawn();
	});
	useHotkey(useBinding("pointNorth"), () => {
		const pano = getPano();
		if (!pano) return;
		cancelTweenRef.current?.();
		const h = pano.getPov().heading;
		if (Math.abs(h) < 1 && Math.abs(pano.getPov().pitch) < 1) {
			cancelTweenRef.current = tweenPov(pano, { heading: 0, pitch: -90 });
		} else {
			cancelTweenRef.current = tweenPov(pano, { heading: 0, pitch: 0 });
		}
	});
	useHotkey(useBinding("centerRoad"), () => {
		const pano = getPano();
		if (!pano) return;
		const headings = (pano.getLinks() ?? [])
			.map((l) => l?.heading)
			.filter((h): h is number => h != null);
		const nearest = nearestLinkHeading(headings, pano.getPov().heading);
		if (nearest == null) return;
		cancelTweenRef.current?.();
		cancelTweenRef.current = tweenPov(pano, { heading: nearest, pitch: 0 });
	});
	useHotkey(useBinding("spin180"), () => {
		const pano = getPano();
		if (!pano) return;
		cancelTweenRef.current?.();
		const pov = pano.getPov();
		cancelTweenRef.current = tweenPov(pano, {
			heading: (pov.heading + 180) % 360,
			pitch: pov.pitch,
		});
	});
	const canZoom = () => getSettings().defaultMovementMode !== "nmpz";
	useHotkey(useBinding("zoomIn"), () => {
		const pano = getPano();
		if (pano && canZoom()) {
			pano.setZoom(Math.min(PANO_ZOOM.max, Math.max(0, pano.getZoom()) + 1));
		}
	});
	useHotkey(useBinding("zoomOut"), () => {
		const pano = getPano();
		if (pano && canZoom()) {
			pano.setZoom(Math.max(0, pano.getZoom() - 1));
		}
	});
	useHotkey(useBinding("panoZoomReset"), () => {
		const pano = getPano();
		if (pano && canZoom()) pano.setZoom(PANO_ZOOM.min);
	});
	useHotkey(
		useBinding("copyLink"),
		(e) => {
			if (!location) return;
			const btn = document.querySelector<HTMLButtonElement>('button[aria-label^="Copy link"]');
			btn?.dispatchEvent(
				new MouseEvent("click", {
					bubbles: true,
					cancelable: true,
					shiftKey: e.shiftKey,
					altKey: e.altKey,
				}),
			);
		},
		{ ignoreAlt: true, ignoreShift: true },
	);
	useHotkey(useBinding("toggleCrosshair"), () => {
		setSetting("showCrosshair", !getSettings().showCrosshair);
	});
	useHotkey(useBinding("toggleHideCar"), () => {
		setSetting("showCar", !getSettings().showCar);
	});
	useHotkey(useBinding("togglePanoUI"), () => {
		setSetting("hidePanoUI", !getSettings().hidePanoUI);
	});
	useHotkey(useBinding("cycleMovementMode"), () => {
		const mode = cycle(MOVEMENT_CYCLE, getSettings().defaultMovementMode);
		setSetting("defaultMovementMode", mode);
		const container = fullscreenContainerRef.current ?? panoContainerRef.current?.parentElement;
		if (container) toast(MOVEMENT_MODES[mode], 1200, container);
	});
	useHotkey(useBinding("duplicateLocation"), () => {
		if (location) duplicateLocation(location.id);
	});

	useHotkey(useBinding("downloadPanoTile"), () => {
		const panoId = getPano()?.getPano() ?? selectedPanoId ?? location?.panoId ?? null;
		if (!panoId) return;
		if (location) {
			void downloadPano(panoId, { location, provider: getLocationProvider(location) });
		} else {
			void downloadPano(panoId);
		}
	});
	const stepPanoDate = (step: 1 | -1) => {
		if (!panoDates.length) return;
		const current = selectedPanoId ?? currentPano?.location?.pano ?? location?.panoId;
		handleDateChange(
			cycle(
				panoDates.map((d) => d.pano),
				current,
				step,
			),
		);
	};
	useHotkey(useBinding("nextPanoDate"), () => stepPanoDate(1));
	useHotkey(useBinding("prevPanoDate"), () => stepPanoDate(-1));
	useHotkey(useBinding("followRoad"), () => {
		const pano = getPano();
		if (!pano) return;
		const panoId = pano.getPano();
		const heading = pano.getPov().heading;
		if (!panoId) return;
		const container = fullscreenContainerRef.current ?? panoContainerRef.current?.parentElement;
		if (container) toast(t("toast.followingRoad"), 1500, container);
		followLinkedPanos(panoId, heading)
			.then((locs) => {
				if (locs.length > 0) addLocations(locs);
				if (container) toast(tp("toast.addedLocations", locs.length, { count: locs.length }), 1500, container);
			})
			.catch(() => {
				if (container) toast(t("toast.followRoadFailed"), 1500, container);
			});
	});

	useHotkey(useBinding("refreshPano"), () => {
		// Google Street View only — Apple / Yandex use dedicated PSV sessions.
		if (!singletonPano || !location || getPano() !== singletonPano) return;
		const panoId = singletonPano.getPano();
		const pov = singletonPano.getPov();
		const zoom = singletonPano.getZoom();
		clearSingletonPano();
		const fresh = getPanorama();
		if (!fresh) return;
		if (panoId) fresh.setPano(panoId);
		else fresh.setPosition({ lat: location.lat, lng: location.lng });
		fresh.setPov(pov);
		fresh.setZoom(zoom);
		fresh.setVisible(true);
		google.maps.event.trigger(fresh, "resize");
		sendHideCar(!getSettings().showCar);
	});

	useHotkey(useBinding("viewportLock"), () => {
		const pano = getPano();
		if (pano) toggleViewportLock(pano);
	});

	const quicktagSlot = (idx: number) => {
		if (!location || !getMapState().map) return;
		const tags = sortTagsByMode(
			getVisibleTags(),
			getSettings().tagSortMode,
			getMapState().tagCounts,
		);
		if (idx >= tags.length) return;
		const tag = tags[idx];
		const has = pendingTags.includes(tag.name);
		setPendingTags(has ? pendingTags.filter((t) => t !== tag.name) : [...pendingTags, tag.name]);
	};

	const onApplyTag = useEffectEvent(({ tagId }: { tagId: number }) => {
		const active = getMapState().activeLocation;
		if (!active || isVirtualLocation(active)) return false;
		const tag = getVisibleTags().find((t) => t.id === tagId);
		if (!tag) return false;
		setPendingTags((cur) =>
			cur.includes(tag.name) ? cur.filter((t) => t !== tag.name) : [...cur, tag.name],
		);
	});

	const hasLocation = location != null;
	useEffect(() => {
		if (!hasLocation) return;
		const unregisterApply = registerMapKeyActionHandler("applyTag", (action) => onApplyTag(action));
		const unregisterCopy = registerMapKeyActionHandler("copyToMap", ({ mapId }) => {
			const loc = getMapState().activeLocation;
			if (!loc || isVirtualLocation(loc)) return false;
			const container = fullscreenContainerRef.current ?? panoContainerRef.current?.parentElement;
			const t0 = performance.now();
			cmd
				.storeCopyLocationsToMap(mapId, [loc.id])
				.then((res) => {
					log.debug(`[copyToMap] ipc=${Math.round(performance.now() - t0)}ms`);
					if (!container) return;
					toast(
						res.copied > 0
							? t("toast.copiedTo", { name: res.targetName })
							: t("toast.alreadyIn", { name: res.targetName }),
						1500,
						container,
					);
				})
				.catch((e) => {
					log.error("[copyToMap] failed:", e);
					if (container) toast(t("toast.copyFailed"), 1500, container);
				});
		});
		return () => {
			unregisterApply();
			unregisterCopy();
		};
	}, [hasLocation, fullscreenContainerRef, panoContainerRef]);

	useHotkey(useBinding("quicktag1"), () => quicktagSlot(0));
	useHotkey(useBinding("quicktag2"), () => quicktagSlot(1));
	useHotkey(useBinding("quicktag3"), () => quicktagSlot(2));
	useHotkey(useBinding("quicktag4"), () => quicktagSlot(3));
	useHotkey(useBinding("quicktag5"), () => quicktagSlot(4));
	useHotkey(useBinding("quicktag6"), () => quicktagSlot(5));
	useHotkey(useBinding("quicktag7"), () => quicktagSlot(6));
	useHotkey(useBinding("quicktag8"), () => quicktagSlot(7));
	useHotkey(useBinding("quicktag9"), () => quicktagSlot(8));
}
