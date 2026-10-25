const TWEEN_DURATION = 160;

/** Smallest turn from `heading` to north, in `[0, 180]`. */
export function degreesFromNorth(heading: number): number {
	const h = ((heading % 360) + 360) % 360;
	return Math.min(h, 360 - h);
}

/** Face north and keep the pitch. Within two degrees of north, look straight down. */
export function pointNorthFrame(
	heading: number,
	pitch: number,
): { heading: number; pitch: number; lookDown: boolean } {
	if (degreesFromNorth(heading) < 2) return { heading: 0, pitch: -90, lookDown: true };
	return { heading: 0, pitch, lookDown: false };
}

export function tweenPov(
	pano: google.maps.StreetViewPanorama,
	target: { heading: number; pitch: number },
	onComplete?: () => void,
): () => void {
	const from = pano.getPov();
	let dh = from.heading - target.heading;
	if (dh > 180) dh -= 360;
	if (dh < -180) dh += 360;
	const dp = from.pitch - target.pitch;
	const start = performance.now();
	let id = 0;
	function tick(now: number) {
		const t = Math.min((now - start) / TWEEN_DURATION, 1);
		const e = t * (2 - t);
		pano.setPov({
			heading: target.heading + dh * (1 - e),
			pitch: target.pitch + dp * (1 - e),
		});
		if (t < 1) {
			id = requestAnimationFrame(tick);
		} else {
			onComplete?.();
		}
	}
	id = requestAnimationFrame(tick);
	return () => cancelAnimationFrame(id);
}
