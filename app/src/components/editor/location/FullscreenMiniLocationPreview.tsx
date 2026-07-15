import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/primitives/Icon";
import { mdiMinus, mdiPlus } from "@mdi/js";
import { useActiveLocation } from "@/store/useMapStore";
import { useSetting, setSetting } from "@/store/settings";
import { range, clamp } from "@/types/util";
import { singletonDiv, singletonPano } from "@/lib/sv/panoSingleton";
import { google } from "@/lib/sv/opensv";

const PREVIEW_SCALE = range([0.5, 2]);
const PREVIEW_SCALE_STEP = 0.5;
const PREVIEW_BASE_W = 480;
const PREVIEW_BASE_H = 270;
const PREVIEW_CLOSE_DELAY = 500;

function resizePano() {
	if (singletonPano && google?.maps) google.maps.event.trigger(singletonPano, "resize");
}

/** Floating Street View chip for fullscreen-map mode. Reuses the singleton pano
 *  (LocationPreview yields ownership while this is mounted). No embed controls. */
export function FullscreenMiniLocationPreview() {
	const location = useActiveLocation();
	const containerRef = useRef<HTMLDivElement>(null);
	const scale = useSetting("fullscreenMiniLocationScale");
	const [expanded, setExpanded] = useState(false);
	const closeTimer = useRef<number | null>(null);

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container || !location) return;
		container.appendChild(singletonDiv);
		if (singletonPano) {
			singletonPano.setVisible(true);
			resizePano();
		}
		return () => {
			if (container.contains(singletonDiv)) container.removeChild(singletonDiv);
		};
	}, [location?.id]);

	// Size changes are not CSS-animated (avoids canvas stretch mid-transition).
	// Resize once after layout commits — never during a transition.
	useLayoutEffect(() => {
		resizePano();
	}, [expanded, scale, location?.id]);

	const setScale = (next: number) => {
		const clamped = clamp(next, PREVIEW_SCALE);
		setSetting("fullscreenMiniLocationScale", Math.round(clamped * 100) / 100);
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
		}, PREVIEW_CLOSE_DELAY);
	};

	useEffect(() => {
		return () => {
			if (closeTimer.current !== null) clearTimeout(closeTimer.current);
		};
	}, []);

	if (!location) return null;

	const sizeVars = {
		"--fs-mini-loc-w": `${Math.round(PREVIEW_BASE_W * scale)}px`,
		"--fs-mini-loc-h": `${Math.round(PREVIEW_BASE_H * scale)}px`,
	} as React.CSSProperties;

	return (
		<div
			className={`fullscreen-mini-location${expanded ? " is-expanded" : ""}`}
			style={sizeVars}
			onPointerEnter={open}
			onPointerLeave={scheduleClose}
		>
			<div ref={containerRef} className="fullscreen-mini-location__pano" />
			<div className="fullscreen-mini-location__size">
				<button
					type="button"
					className="fullscreen-mini-location__size-btn"
					aria-label="Smaller location preview"
					disabled={scale <= PREVIEW_SCALE.min}
					onClick={() => setScale(scale - PREVIEW_SCALE_STEP)}
				>
					<Icon path={mdiMinus} size={16} />
				</button>
				<button
					type="button"
					className="fullscreen-mini-location__size-btn"
					aria-label="Larger location preview"
					disabled={scale >= PREVIEW_SCALE.max}
					onClick={() => setScale(scale + PREVIEW_SCALE_STEP)}
				>
					<Icon path={mdiPlus} size={16} />
				</button>
			</div>
		</div>
	);
}
