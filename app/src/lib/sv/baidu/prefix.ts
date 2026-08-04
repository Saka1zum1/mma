/** Baidu pano id namespace — matches altproviders.js `BAIDU:` prefix. */

export const BAIDU_PANO_PREFIX = "BAIDU:";

export function isBaiduPanoId(panoId: string | null | undefined): boolean {
	return typeof panoId === "string" && panoId.startsWith(BAIDU_PANO_PREFIX);
}

export function stripBaidu(panoId: string): string {
	return panoId.startsWith(BAIDU_PANO_PREFIX)
		? panoId.slice(BAIDU_PANO_PREFIX.length)
		: panoId;
}

export function prefixBaidu(panoId: string): string {
	const raw = stripBaidu(panoId);
	return raw ? `${BAIDU_PANO_PREFIX}${raw}` : "";
}

/**
 * Baidu panoramas captured with certain camera rigs (raw sid prefix "020" or
 * "050") mount the vehicle on the SIDE of the frame instead of the bottom —
 * the NO_CAR shader mask (tuned for a bottom-center car) needs a 90° rotation
 * for these captures, or it ends up masking empty sky/road instead of the car.
 */
export function isBaiduRotatedCarPano(panoId: string | null | undefined): boolean {
	if (!panoId) return false;
	const raw = stripBaidu(panoId);
	return /^(020|050)/.test(raw);
}
