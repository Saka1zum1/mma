/** Local click-to-go marker — replaces lookmap `/static/marker.png`. */
function movementMarkerUrl(fill: string): string {
	return (
		"data:image/svg+xml," +
		encodeURIComponent(
			`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
			<circle cx="32" cy="32" r="28" fill="#ffffff" fill-opacity="0.92"/>
			<circle cx="32" cy="32" r="10" fill="${fill}"/>
		</svg>`,
		)
	);
}

export const MOVEMENT_MARKER_URL = movementMarkerUrl("#1a73e8");

/** Same Look Around marker shape, Yandex brand red. */
export const YANDEX_MOVEMENT_MARKER_URL = movementMarkerUrl("#fc3f1d");
