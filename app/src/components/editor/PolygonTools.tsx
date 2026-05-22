import { useEffect, useRef, useState } from "react";
import { google } from "@/lib/sv/opensv";

type DrawMode = "polygon" | "rectangle" | "freehand" | null;

function perpDist(p: number[], a: number[], b: number[]): number {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
	const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
	return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplify(pts: number[][], eps: number): number[][] {
	if (pts.length <= 2) return pts;
	let maxD = 0,
		maxI = 0;
	for (let i = 1; i < pts.length - 1; i++) {
		const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
		if (d > maxD) {
			maxD = d;
			maxI = i;
		}
	}
	if (maxD > eps) {
		const l = simplify(pts.slice(0, maxI + 1), eps);
		const r = simplify(pts.slice(maxI), eps);
		return [...l.slice(0, -1), ...r];
	}
	return [pts[0], pts[pts.length - 1]];
}

export function PolygonTools({
	map,
	onDraw,
	freehandPathRef,
	requestOverlayUpdate,
}: {
	map: google.maps.Map | null;
	onDraw: (rings: number[][][]) => void;
	freehandPathRef: React.MutableRefObject<number[][] | null>;
	requestOverlayUpdate: () => void;
}) {
	const [mode, setMode] = useState<DrawMode>(null);
	const managerRef = useRef<google.maps.drawing.DrawingManager>(null);
	const onDrawRef = useRef(onDraw);
	onDrawRef.current = onDraw;
	const isDrawingRef = useRef(false);
	const requestUpdateRef = useRef(requestOverlayUpdate);
	requestUpdateRef.current = requestOverlayUpdate;

	useEffect(() => {
		if (!map) return;
		if (!google?.maps) return;

		let cancelled = false;
		let listener: google.maps.MapsEventListener | null = null;
		let dm: google.maps.drawing.DrawingManager | null = null;

		(async () => {
			try {
				await google.maps.importLibrary("drawing");
			} catch {
				return;
			}
			if (cancelled || !google.maps.drawing?.DrawingManager) return;

			dm = new google.maps.drawing.DrawingManager({
				drawingControl: false,
				polygonOptions: { editable: true },
			});
			dm.setMap(map);
			managerRef.current = dm;

			listener = google.maps.event.addListener(
				dm,
				"overlaycomplete",
				(e: google.maps.drawing.OverlayCompleteEvent) => {
					const Ym = google.maps.drawing.OverlayType;
					e.overlay?.setMap(null);
					dm!.setDrawingMode(null);
					setMode(null);

					if (e.type === Ym.POLYGON) {
						const path = (e.overlay as google.maps.Polygon).getPath().getArray();
						const ring = path.map((ll) => [ll.lng(), ll.lat()]);
						if (ring.length > 0) {
							const first = ring[0];
							const last = ring[ring.length - 1];
							if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
						}
						onDrawRef.current([ring]);
					} else if (e.type === Ym.RECTANGLE) {
						const b = (e.overlay as google.maps.Rectangle).getBounds()!.toJSON();
						let east = b.east;
						const west = b.west;
						if (east < west) east += 360;
						const ring = [
							[west, b.south],
							[east, b.south],
							[east, b.north],
							[west, b.north],
							[west, b.south],
						];
						onDrawRef.current([ring]);
					}
				},
			);
		})();

		return () => {
			cancelled = true;
			if (listener) google.maps.event.removeListener(listener);
			if (dm) dm.setMap(null);
			managerRef.current = null;
		};
	}, [map]);

	useEffect(() => {
		const dm = managerRef.current;
		if (!dm) return;
		const Ym = google?.maps?.drawing?.OverlayType;
		if (!Ym) return;
		if (mode === "polygon") dm.setDrawingMode(Ym.POLYGON);
		else if (mode === "rectangle") dm.setDrawingMode(Ym.RECTANGLE);
		else dm.setDrawingMode(null);
	}, [mode]);

	useEffect(() => {
		if (!map || mode !== "freehand") return;
		if (!google?.maps) return;

		map.setOptions({ draggable: false });
		const points: number[][] = [];

		const down = google.maps.event.addListener(map, "mousedown", (e: google.maps.MapMouseEvent) => {
			if (!e.latLng) return;
			isDrawingRef.current = true;
			points.length = 0;
			points.push([e.latLng.lng(), e.latLng.lat()]);
			freehandPathRef.current = points;
			requestUpdateRef.current();
		});

		const move = google.maps.event.addListener(map, "mousemove", (e: google.maps.MapMouseEvent) => {
			if (!isDrawingRef.current || !e.latLng) return;
			points.push([e.latLng.lng(), e.latLng.lat()]);
			requestUpdateRef.current();
		});

		const up = google.maps.event.addListener(map, "mouseup", () => {
			if (!isDrawingRef.current) return;
			isDrawingRef.current = false;
			freehandPathRef.current = null;
			requestUpdateRef.current();

			if (points.length < 3) return;

			const simplified = simplify(points, 0.0001);
			const first = simplified[0];
			const last = simplified[simplified.length - 1];
			if (first[0] !== last[0] || first[1] !== last[1]) {
				simplified.push([first[0], first[1]]);
			}

			setMode(null);
			onDrawRef.current([simplified]);
		});

		return () => {
			google.maps.event.removeListener(down);
			google.maps.event.removeListener(move);
			google.maps.event.removeListener(up);
			map.setOptions({ draggable: true });
			isDrawingRef.current = false;
			freehandPathRef.current = null;
		};
	}, [map, mode, freehandPathRef]);

	return (
		<div className="map-control map-control--button white">
			<button
				type="button"
				onClick={() => setMode((m) => (m === "polygon" ? null : "polygon"))}
				className={mode === "polygon" ? "is-active" : undefined}
				aria-label="Draw a polygon selection"
			>
				<svg height="24" width="24" viewBox="0 0 24 24" fill="currentColor">
					<path d="M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5M5,7.61V16.39L12,20.13L19,16.39V7.61L12,3.87L5,7.61Z" />
				</svg>
			</button>
			<button
				type="button"
				onClick={() => setMode((m) => (m === "rectangle" ? null : "rectangle"))}
				className={mode === "rectangle" ? "is-active" : undefined}
				aria-label="Draw a rectangle selection"
			>
				<svg height="24" width="24" viewBox="0 0 24 24" fill="currentColor">
					<path d="M4,6V19H20V6H4M4,4H20A2,2 0 0,1 22,6V19A2,2 0 0,1 20,21H4A2,2 0 0,1 2,19V6A2,2 0 0,1 4,4Z" />
				</svg>
			</button>
			<button
				type="button"
				onClick={() => setMode((m) => (m === "freehand" ? null : "freehand"))}
				className={mode === "freehand" ? "is-active" : undefined}
				aria-label="Freehand polygon selection"
			>
				<svg height="24" width="24" viewBox="0 0 24 24" fill="currentColor">
					<path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" />
				</svg>
			</button>
		</div>
	);
}
