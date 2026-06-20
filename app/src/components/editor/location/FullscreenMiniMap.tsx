import { useEffect, useRef, useState } from "react";
import { google } from "@/lib/sv/opensv";
import { resolveStackForPrefs, CUSTOM_STYLES_KEY, type CustomStyle } from "@/lib/geo/mapStack";
import { useMapSurface } from "@/lib/render/useMapSurface";
import { useSetting, setSetting } from "@/store/settings";
import { useLocalStorage, getLocal } from "@/lib/hooks/useLocalStorage";
import { type MapEmbedPrefs, DEFAULT_PREFS } from "@/components/editor/map/mapEmbedPrefs";

const MINIMAP_SCALE_MIN = 0.5;
const MINIMAP_SCALE_MAX = 2;
const MINIMAP_SCALE_STEP = 0.5;
const MINIMAP_BASE_W = 800;
const MINIMAP_BASE_H = 600;
const MINIMAP_CLOSE_DELAY = 500;

export function FullscreenMiniMap({
	lat,
	lng,
}: {
	lat: number;
	lng: number;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const scale = useSetting("fullscreenMinimapScale");
	const [expanded, setExpanded] = useState(false);
	const closeTimer = useRef<number | null>(null);
	const [prefs] = useLocalStorage<MapEmbedPrefs>("mapEmbedPrefs", DEFAULT_PREFS);
	const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);

	useMapSurface(mapInstance, {
		prefs,
		followActive: true,
	});

	const setScale = (next: number) => {
		const clamped = Math.min(MINIMAP_SCALE_MAX, Math.max(MINIMAP_SCALE_MIN, next));
		setSetting("fullscreenMinimapScale", Math.round(clamped * 100) / 100);
	};

	const open = () => {
		if (closeTimer.current !== null) {
			clearTimeout(closeTimer.current);
			closeTimer.current = null;
		}
		setExpanded(true);
	};
	const scheduleClose = () => {
		if (closeTimer.current !== null) clearTimeout(closeTimer.current);
		closeTimer.current = window.setTimeout(() => {
			setExpanded(false);
			closeTimer.current = null;
		}, MINIMAP_CLOSE_DELAY);
	};

	useEffect(() => {
		return () => {
			if (closeTimer.current !== null) clearTimeout(closeTimer.current);
		};
	}, []);
	const mapRef = useRef<google.maps.Map | null>(null);

	useEffect(() => {
		if (!containerRef.current || !google?.maps) return;
		const customType = resolveStackForPrefs(prefs, {
			useBlobby: prefs.svBlobby,
			customStyles: getLocal<CustomStyle[]>(CUSTOM_STYLES_KEY, []),
		}).mapType;
		const map = new google.maps.Map(containerRef.current, {
			center: { lat, lng },
			zoom: 14,
			disableDefaultUI: true,
			gestureHandling: "greedy",
			draggableCursor: "crosshair",
			mapTypeId: "custom",
			mapTypeControlOptions: { mapTypeIds: ["custom"] },
		});
		map.mapTypes.set("custom", customType);
		map.setMapTypeId("custom");
		mapRef.current = map;
		setMapInstance(map);
		return () => {
			mapRef.current = null;
			setMapInstance(null);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const sizeVars = {
		"--fs-minimap-w": `${Math.round(MINIMAP_BASE_W * scale)}px`,
		"--fs-minimap-h": `${Math.round(MINIMAP_BASE_H * scale)}px`,
	} as React.CSSProperties;

	return (
		<div
			className={`fullscreen-minimap${expanded ? " is-expanded" : ""}`}
			style={sizeVars}
			onMouseEnter={open}
			onMouseLeave={scheduleClose}
		>
			<div ref={containerRef} className="fullscreen-minimap__map" />
			<div className="fullscreen-minimap__size">
				<button
					type="button"
					className="fullscreen-minimap__size-btn"
					aria-label="Smaller minimap"
					disabled={scale <= MINIMAP_SCALE_MIN}
					onClick={() => setScale(scale - MINIMAP_SCALE_STEP)}
				>
					<svg height="16" width="16" viewBox="0 0 24 24" fill="currentColor">
						<path d="M19,13H5V11H19V13Z" />
					</svg>
				</button>
				<button
					type="button"
					className="fullscreen-minimap__size-btn"
					aria-label="Larger minimap"
					disabled={scale >= MINIMAP_SCALE_MAX}
					onClick={() => setScale(scale + MINIMAP_SCALE_STEP)}
				>
					<svg height="16" width="16" viewBox="0 0 24 24" fill="currentColor">
						<path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" />
					</svg>
				</button>
			</div>
		</div>
	);
}
