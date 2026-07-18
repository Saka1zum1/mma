import { schemeBase } from "@/lib/util/util";
import { baiduShareUrl } from "./endpoints";
import { stripBaidu } from "./prefix";

/** Baidu Maps share URL for a pano (matches altproviders translatePanoUrl). */
export function buildBaiduShareUrl(sid: string, heading = 0, pitch = 0): string {
	return baiduShareUrl(stripBaidu(sid), heading, pitch);
}

const shortLinkCache = new Map<string, string>();

/** Test helper — drop cached short links. */
export function clearBaiduShortLinkCache(): void {
	shortLinkCache.clear();
}

/**
 * Shorten a Baidu Maps share URL via j.map.baidu.com (proxied through the
 * Tauri `bmaps` scheme — same pattern as Google `gmaps` short links).
 */
export async function shortenBaiduShareUrl(longUrl: string): Promise<string> {
	let cacheKey = "";
	try {
		cacheKey = new URL(longUrl).searchParams.get("panoid") ?? longUrl;
	} catch {
		cacheKey = longUrl;
	}
	const hit = shortLinkCache.get(cacheKey);
	if (hit) return hit;

	const apiUrl =
		`${schemeBase("bmaps")}?url=${encodeURIComponent(longUrl)}` +
		`&web=true&pcevaname=pc4.1&newfrom=zhuzhan_webmap`;

	try {
		const res = await fetch(apiUrl, {
			method: "GET",
			credentials: "omit",
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) return longUrl;
		const data = (await res.json()) as { url?: string };
		if (typeof data?.url === "string" && data.url.startsWith("http")) {
			shortLinkCache.set(cacheKey, data.url);
			return data.url;
		}
	} catch {
		/* fall through */
	}
	return longUrl;
}
