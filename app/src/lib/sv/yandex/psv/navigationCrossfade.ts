/**
 * Canvas overlay crossfade for Yandex PSV navigation — same idea as Look Around's
 * `doMovementCrossfade`. PSV's EquirectangularTilesAdapter transition fades the
 * blurred base mesh (wrong crop / tiny z3–z4 grids); we keep the previous frame
 * on top while the new panorama loads underneath with transition disabled.
 */

const STYLE_ID = "yandex-psv-crossfade-style";
const CANVAS_ID = "yandex-crossfade-canvas";

export function ensureYandexCrossfadeCanvas(container: HTMLElement): HTMLCanvasElement {
	if (!document.getElementById(STYLE_ID)) {
		const style = document.createElement("style");
		style.id = STYLE_ID;
		style.textContent = `
			#${CANVAS_ID} {
				z-index: 9;
				display: none;
				opacity: 1;
				position: absolute;
				inset: 0;
				pointer-events: none;
			}
		`;
		document.head.appendChild(style);
	}

	const host = container.querySelector(".psv-container") ?? container;
	let canvas = host.querySelector(`#${CANVAS_ID}`) as HTMLCanvasElement | null;
	if (!canvas) {
		canvas = document.createElement("canvas");
		canvas.id = CANVAS_ID;
		host.appendChild(canvas);
	}
	return canvas;
}

/** Snapshot the current PSV canvas and fade it out over `durationMs`. */
export function runYandexNavigationCrossfade(
	container: HTMLElement,
	durationMs = 150,
): void {
	if (durationMs < 1) return;

	const psvCanvas = container.querySelector(".psv-canvas") as HTMLCanvasElement | null;
	if (!psvCanvas) return;

	const overlay = ensureYandexCrossfadeCanvas(container);
	const w = psvCanvas.clientWidth;
	const h = psvCanvas.clientHeight;
	if (w < 1 || h < 1) return;

	overlay.width = w;
	overlay.height = h;
	overlay.style.display = "block";
	overlay.style.opacity = "1";
	const ctx = overlay.getContext("2d");
	if (!ctx) return;
	ctx.clearRect(0, 0, w, h);
	ctx.drawImage(psvCanvas, 0, 0, w, h);

	const animStart = Date.now();
	const tick = () => {
		const elapsed = Date.now() - animStart;
		if (elapsed >= durationMs) {
			overlay.style.display = "none";
			overlay.style.opacity = "1";
			return;
		}
		overlay.style.opacity = String(1 - elapsed / durationMs);
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}
