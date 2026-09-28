import { cmd } from "@/lib/commands";
import { latLngToWorld } from "@/lib/geo/mercator";
import { mapToBaiduMeters } from "@/lib/sv/baidu/crs";
import { isOfficialPano } from "@/lib/sv/panoId";
import { svMetadata } from "@/lib/sv/query";
import { adaptPano, type Pano } from "./panoModel";
import { isGoogleProvider, type StreetViewProvider } from "./types";

/** Tile height of the previous capture, matching various-map-gen's update icons. */
export function updateTypeFromHeight(height: number | null | undefined): string {
	if (height === 1664) return "gen1update";
	if (height === 6656) return "gen2or3update";
	return "gen4update";
}

/**
 * The capture before this one: the second-to-last timeline entry after unofficial ids are
 * dropped, matching various-map-gen. The metadata list is already date-sorted and includes
 * the current pano.
 */
export function previousPanoId(pano: Pano, officialOnly: boolean): string | null {
	const time = (pano.time ?? []).filter((entry) => entry.panoId && (!officialOnly || isOfficialPano(entry.panoId)));
	return time.length >= 2 ? time[time.length - 2]!.panoId : null;
}

async function pixelCovered(url: string, x: number, y: number): Promise<boolean> {
	const px = Math.min(255, Math.max(0, Math.floor(x)));
	const py = Math.min(255, Math.max(0, Math.floor(y)));
	return cmd.coverageTileAlpha(url, px, py);
}

/** Google coverage tile at zoom 12. A non-transparent pixel is a blue line. */
async function googleHasBlueLine(lat: number, lng: number): Promise<boolean> {
	const zoom = 12;
	const world = latLngToWorld({ lat, lng });
	const scale = 2 ** zoom;
	const pixelX = world.x * scale;
	const pixelY = world.y * scale;
	const tileX = Math.floor(pixelX / 256);
	const tileY = Math.floor(pixelY / 256);
	const url =
		`https://www.google.com/maps/vt?pb=!1m7!8m6!1m3!1i${zoom}!2i${tileX}!3i${tileY}` +
		"!2i9!3x1!2m8!1e2!2ssvv!4m2!1scc!2s*211m3*211e2*212b1*213e2*211m3*211e3*212b1*213e2*212b1*214b1" +
		"!4m2!1ssvl!2s*211b0*212b0!3m8!2sen!3sus!5e1105!12m4!1e68!2m2!1sset!2sRoadmap!4e0!5m4!1e0!8m2!1e1!1e1" +
		"!6m6!1e12!2i2!11e0!39b0!44e0!50e0";
	return pixelCovered(url, pixelX - tileX * 256, pixelY - tileY * 256);
}

/** Baidu coverage tile at zoom 20. Meters are BD-09MC. */
async function baiduHasBlueLine(lat: number, lng: number): Promise<boolean> {
	const zoom = 20;
	const { x, y } = mapToBaiduMeters(lng, lat);
	const dpi = 2 ** (18 - zoom);
	const tileXF = x / dpi / 256;
	const tileYF = y / dpi / 256;
	const tileX = Math.floor(tileXF);
	const tileY = Math.floor(tileYF);
	const url = `https://mapsv${tileX & 1}.bdimg.com/tile/?qt=tile&styles=pl&x=${tileX}&y=${tileY}&z=${zoom}`;
	return pixelCovered(url, (tileXF - tileX) * 256, (1 - (tileYF - tileY)) * 256);
}

/**
 * various-map-gen's `update_type`. Google uses the previous capture's tile height, or a
 * blue-line check when this is the first date. Baidu uses a blue line, or any link or
 * extra timeline date, as a new road.
 */
export async function resolveUpdateType(
	pano: Pano,
	provider: StreetViewProvider,
	officialOnly: boolean,
	signal: AbortSignal,
): Promise<string | null> {
	const previous = previousPanoId(pano, officialOnly && isGoogleProvider(provider));
	if (!previous) {
		if (provider === "baidu") {
			try {
				if ((await baiduHasBlueLine(pano.lat, pano.lng)) || pano.links.length > 0 || (pano.time?.length ?? 0) > 1) {
					return "newroad";
				}
			} catch {
				if (pano.links.length > 0 || (pano.time?.length ?? 0) > 1) return "newroad";
			}
			return "noblueline";
		}
		if (!isGoogleProvider(provider)) return null;
		try {
			return (await googleHasBlueLine(pano.lat, pano.lng)) ? "newroad" : "noblueline";
		} catch {
			return "noblueline";
		}
	}
	if (!isGoogleProvider(provider)) return null;
	try {
		const [meta] = await svMetadata([previous], signal);
		if (signal.aborted) return null;
		return updateTypeFromHeight(adaptPano(meta)?.worldHeight);
	} catch {
		return null;
	}
}
