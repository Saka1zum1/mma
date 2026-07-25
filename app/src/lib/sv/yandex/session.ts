/**
 * Yandex UI helpers for the PSV / PanoProvider lifecycle.
 */
import type { Location } from "@/bindings.gen";
import type { PanoCameraBadge, PanoDateEntry } from "@/lib/sv/panoProvider";
import { getLocationPanoId } from "@/lib/sv/providers/types";
import { fetchYandexMeta, getCachedYandexMeta, type YandexPanoMeta } from "./api";
import { buildYandexExtra } from "./panoExtra";
import { isYandexPanoId, stripYandex } from "./prefix";
import { rememberYandexMeta, yandexTimelineEntries } from "./service";

export const YANDEX_CAMERA_BADGE: PanoCameraBadge = {
	id: "yandex",
	label: "Yandex",
	className: "badge--yandex",
};

/** Storage / PSV pano id (unprefixed). */
export function yandexSpawnPanoId(location: Location): string | null {
	const raw = getLocationPanoId(location);
	return raw ? stripYandex(raw) : null;
}

export function yandexSpotDefaultPanoId(meta: YandexPanoMeta): string {
	return meta.id;
}

export function yandexSaveExtra(panoId: string): Record<string, unknown> {
	const meta = getCachedYandexMeta(stripYandex(panoId));
	return meta ? buildYandexExtra(meta) : {};
}

export async function loadYandexDateEntries(panoId: string): Promise<{
	entries: PanoDateEntry[];
	meta: YandexPanoMeta | null;
	defaultPanoId: string | null;
}> {
	const meta = await fetchYandexMeta(panoId);
	if (!meta) return { entries: [], meta: null, defaultPanoId: null };
	rememberYandexMeta(meta);

	return {
		entries: yandexTimelineEntries(meta),
		meta,
		defaultPanoId: yandexSpotDefaultPanoId(meta),
	};
}

export function isYandexViewerPano(panoId: string | null | undefined): boolean {
	return isYandexPanoId(panoId) || (typeof panoId === "string" && panoId.length > 0);
}
