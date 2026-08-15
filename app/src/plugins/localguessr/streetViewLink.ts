import { open } from "@tauri-apps/plugin-shell";
import { mapsPanoUrl, fovForZoom } from "@/lib/sv/mapsLink";
import { buildLookmapOpenUrl } from "@/lib/sv/lookaround/shareLink";
import { buildBaiduShareUrl } from "@/lib/sv/baidu/shareLink";
import { isBaiduPanoId, stripBaidu } from "@/lib/sv/baidu/prefix";
import { buildTencentShareUrl } from "@/lib/sv/tencent/shareLink";
import { isTencentPanoId, stripTencent } from "@/lib/sv/tencent/prefix";
import { buildYandexShareUrl } from "@/lib/sv/yandex/shareLink";
import { isYandexPanoId, stripYandex } from "@/lib/sv/yandex/prefix";
import type { SvProvider } from "@/lib/sv/providers/types";
import type { RoundLocation } from "./GameState";

function resolveProvider(loc: RoundLocation): SvProvider {
	const raw = loc.provider;
	if (
		raw === "google" ||
		raw === "apple" ||
		raw === "baidu" ||
		raw === "tencent" ||
		raw === "yandex"
	) {
		return raw;
	}
	const panoId = loc.panoId;
	if (panoId) {
		if (isBaiduPanoId(panoId)) return "baidu";
		if (isTencentPanoId(panoId)) return "tencent";
		if (isYandexPanoId(panoId)) return "yandex";
	}
	return "google";
}

/** Build a browser Street View URL for a round location (same providers as PanoControls). */
export function buildStreetViewUrl(loc: RoundLocation): string | null {
	const provider = resolveProvider(loc);
	const heading = loc.heading ?? 0;
	const pitch = loc.pitch ?? 0;
	const panoId = loc.panoId;

	if (provider === "apple") {
		return buildLookmapOpenUrl(loc.lat, loc.lng, heading, pitch);
	}

	if (provider === "baidu") {
		if (!panoId) return null;
		return buildBaiduShareUrl(stripBaidu(panoId), heading, pitch);
	}

	if (provider === "tencent") {
		if (!panoId) return null;
		return buildTencentShareUrl(stripTencent(panoId), heading, pitch);
	}

	if (provider === "yandex") {
		if (!panoId) return null;
		return buildYandexShareUrl(stripYandex(panoId), loc.lat, loc.lng, heading);
	}

	if (!panoId) return null;
	return mapsPanoUrl({
		lat: loc.lat,
		lng: loc.lng,
		heading,
		pitch,
		fov: fovForZoom(loc.zoom ?? 1),
		panoId,
	}).toString();
}

/** Open the location's Street View page in the system browser. */
export async function openStreetViewInBrowser(loc: RoundLocation): Promise<void> {
	const url = buildStreetViewUrl(loc);
	if (!url) return;
	await open(url);
}
