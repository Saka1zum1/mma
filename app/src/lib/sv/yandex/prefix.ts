/** Yandex pano id namespace — matches altproviders.js `YANDEX:` prefix. */

export const YANDEX_PANO_PREFIX = "YANDEX:";

export function isYandexPanoId(panoId: string | null | undefined): boolean {
	return typeof panoId === "string" && panoId.startsWith(YANDEX_PANO_PREFIX);
}

export function stripYandex(panoId: string): string {
	return panoId.startsWith(YANDEX_PANO_PREFIX)
		? panoId.slice(YANDEX_PANO_PREFIX.length)
		: panoId;
}

export function prefixYandex(panoId: string): string {
	const raw = stripYandex(panoId);
	return raw ? `${YANDEX_PANO_PREFIX}${raw}` : "";
}
