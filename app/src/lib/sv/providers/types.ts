/**
 * Multi-provider Street View model.
 * Google remains the default host; alternate providers register here for settings,
 * coverage overlays, click priority, and location.provider routing.
 */

import type { Location } from "@/bindings.gen";

/** Known panorama imagery providers. Google is always available and not configured here. */
export type SvProvider =
	| "google"
	| "apple"
	| "baidu"
	| "tencent"
	| "yandex"

/** Alternate (non-Google) providers that appear in the providers settings panel. */
export type AltSvProviderId = Exclude<SvProvider, "google">;

/** Alias of the MapSettings provider settings shape from bindings. */
export type { AltProviderSettings as AltSvProviderSettings } from "@/bindings.gen";

/** Catalog entry for the providers sidebar (UI + registration metadata). */
export interface SvProviderCatalogEntry {
	id: AltSvProviderId;
	label: string;
	/** MDI path data for the header toggle when this provider is the sole enabled one. */
	icon: string;
	/** Sort key for click priority (higher first). */
	priority: number;
	/** Coming-soon providers are shown but not interactive. */
	available: boolean;
}

/**
 * Location.extra fields shared across providers (Google-semantic where possible).
 * Provider identity lives on `location.provider` / `location.panoId`.
 */
export interface LocationSvExtra {
	altitude?: number;
	imageDate?: string;
	datetime?: number;
	timezone?: string;
	cameraType?: string;
	panoType?: number;
	drivingDirection?: number;
	countryCode?: string;
	[key: string]: unknown;
}

const KNOWN_PROVIDERS: readonly SvProvider[] = [
	"google",
	"apple",
	"baidu",
	"tencent",
	"yandex",
];

function parseProvider(raw: unknown): SvProvider | null {
	if (typeof raw !== "string") return null;
	return (KNOWN_PROVIDERS as readonly string[]).includes(raw) ? (raw as SvProvider) : null;
}

/** Resolve imagery provider from top-level `location.provider`. */
export function getLocationProvider(
	loc: Pick<Location, "provider"> | null | undefined,
): SvProvider {
	if (!loc) return "google";
	const top = parseProvider(loc.provider);
	if (top) return top;
	return "google";
}

export function isAppleLocation(loc: Pick<Location, "provider"> | null | undefined): boolean {
	return getLocationProvider(loc) === "apple";
}

/** Spawn / open pano id — top-level first. */
export function getLocationPanoId(loc: Location | null | undefined): string | null {
	if (!loc) return null;
	if (typeof loc.panoId === "string" && loc.panoId.length > 0) return loc.panoId;
	return null;
}

export function isGoogleProvider(provider: SvProvider): boolean {
	return provider === "google";
}
