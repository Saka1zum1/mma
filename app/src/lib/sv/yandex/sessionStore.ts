import type { YandexPanoMeta } from "./api";

let hot: YandexPanoMeta | null = null;

export function setHotYandexMeta(meta: YandexPanoMeta): void {
	hot = meta;
}

export function takeHotYandexMeta(panoId: string | null | undefined): YandexPanoMeta | null {
	if (!hot || !panoId) return null;
	if (hot.id !== panoId) return null;
	const out = hot;
	hot = null;
	return out;
}
