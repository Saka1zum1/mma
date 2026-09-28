import type { CameraType } from "@/bindings.gen";
import { detectCameraType, imageDateOf } from "@/lib/sv/getMetadata";
import type { Pano as LocalPano } from "@/types";

export interface PanoLink {
	panoId: string;
	heading: number;
}

export interface PanoTime {
	panoId: string;
	date: string;
}

/** Panorama shape the generator shares with upstream: its own id is `id`, and timeline
 *  and link references are `panoId`. The app's decoded pano still uses `pano` for both. */
export interface Pano {
	id: string;
	lat: number;
	lng: number;
	description: string;
	shortDescription: string;
	copyright: string;
	links: PanoLink[];
	time: PanoTime[];
	imageDate: string;
	pov: { heading: number; tilt: number; roll: number } | null;
	cameraType: CameraType | null;
	/** Metres above the datum when the provider reports it. */
	altitude?: number | null;
	/** ISO country code when the provider reports one. */
	country?: string | null;
	/** Road name, separate from the display description. */
	road?: string | null;
	/** Baidu publish/edit day, `YYYY-MM-DD`. */
	procdate?: string | null;
	/** Last segment of a Google address, used as the subdivision tag. */
	region?: string | null;
	/** Uploader or author, for the unofficial author filter. */
	author?: string | null;
	/** Zero-link Google coverage, or a Tencent night capture. */
	coverage?: PanoCoverage | null;
	/** Equirectangular height in pixels, used to tell a drone from a photosphere. */
	worldHeight?: number | null;
	/** Minute of the capture day, 0–1439, when the id or timestamp carries a clock. */
	minuteOfDay?: number | null;
	/** Baidu traverse only. Normal coverage (a non-empty Roads list) stays unset. */
	baiduCoverage?: "hidden" | "timeline" | null;
}

export type PanoCoverage = "photosphere" | "drone" | "night";

/** various-map-gen folds Taiwan, Hong Kong, and Macau into CN. */
export function googleCountry(code: string | null | undefined): string | null {
	if (!code) return null;
	if (code === "TW" || code === "HK" || code === "MO") return "CN";
	return code;
}

/** Last comma-separated piece of an address. A single piece is the region itself. */
export function addressRegion(address: string | null | undefined): string | null {
	if (!address) return null;
	const parts = address.split(",");
	const region = (parts.length > 1 ? parts[parts.length - 1] : parts[0])?.trim();
	return region || null;
}

function isGeneratorPano(raw: LocalPano | Pano): raw is Pano {
	return "id" in raw && typeof raw.id === "string" && !("pano" in raw);
}

/** Map a decoded app pano onto the generator's shape. Objects that already use that
 *  shape (tests) pass through. */
export function adaptPano(raw: LocalPano | Pano | null): Pano | null {
	if (!raw) return null;
	if (isGeneratorPano(raw)) return raw;
	return {
		id: raw.pano,
		lat: raw.lat,
		lng: raw.lng,
		description: raw.description,
		shortDescription: raw.shortDescription,
		copyright: raw.copyright,
		links: raw.links.map((link) => ({ panoId: link.pano, heading: link.heading })),
		time: raw.time.map((entry) => ({ panoId: entry.pano, date: entry.date })),
		imageDate: imageDateOf(raw),
		pov: raw.pov,
		cameraType: detectCameraType(raw),
		altitude: Number.isFinite(raw.altitude) ? raw.altitude : null,
		country: googleCountry(raw.countryCode),
		region: addressRegion(raw.description),
		road: null,
		procdate: null,
		author: raw.uploaderName,
		coverage: googleCoverage(raw.links.length, raw.worldSize?.height),
		worldHeight: raw.worldSize?.height ?? null,
		minuteOfDay: null,
	};
}

/** various-map-gen: a photosphere has no links; a drone is a photosphere whose
 *  world height is 2048 or 7200. */
function googleCoverage(links: number, height: number | undefined): Pano["coverage"] {
	if (links !== 0) return null;
	if (height === 2048 || height === 7200) return "drone";
	return "photosphere";
}
