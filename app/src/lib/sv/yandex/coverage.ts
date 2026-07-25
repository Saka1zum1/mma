/**
 * Yandex Street View blue-line coverage as ImageMapType layers.
 * Native Web Mercator tiles via `projection=web_mercator` (no canvas warp).
 */
import { google } from "@/lib/sv/opensv";
import {
	getProviderSettings,
	isProviderEnabled,
	subscribeProvidersSettings,
} from "@/lib/sv/providers/settings";
import {
	bumpProviderCoverageLayers,
	registerProviderLineLayers,
} from "@/lib/sv/providers/coverageLayers";
import { yandexCoverageTileUrl } from "./endpoints";

const TILE = 256;
const MIN_COVERAGE_Z = 5;
const MAX_COVERAGE_Z = 21;

let settingsUnsub: (() => void) | null = null;
let registryUnsub: (() => void) | null = null;
let styleGen = 0;

function parseRgb(color: string): { r: number; g: number; b: number } | null {
	const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
	if (!m) return null;
	return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

/** Tint native cyan coverage toward the configured lineColor. */
function yandexLineColorFilter(lineColor: string): string {
	const rgb = parseRgb(lineColor);
	if (!rgb) return "";
	const r = rgb.r / 255;
	const g = rgb.g / 255;
	const b = rgb.b / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	if (max !== min) {
		const d = max - min;
		switch (max) {
			case r:
				h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
				break;
			case g:
				h = ((b - r) / d + 2) * 60;
				break;
			default:
				h = ((r - g) / d + 4) * 60;
				break;
		}
	}
	const hueRotate = h - 195;
	return `hue-rotate(${hueRotate.toFixed(1)}deg) saturate(1.15)`;
}

function createYandexLineLayer(): google.maps.ImageMapType {
	const s = getProviderSettings("yandex");
	const opacity = s.lineOpacity;
	const colorFilter = yandexLineColorFilter(s.lineColor);
	void styleGen;

	const layer = new google.maps.ImageMapType({
		name: "Yandex SV lines",
		alt: "Yandex Street View coverage",
		minZoom: MIN_COVERAGE_Z,
		maxZoom: MAX_COVERAGE_Z,
		opacity,
		tileSize: new google.maps.Size(TILE, TILE),
		getTileUrl: (coord, zoom) => {
			if (!coord || zoom < MIN_COVERAGE_Z ) return "";
			return yandexCoverageTileUrl(coord.x, coord.y, zoom);
		},
	});

	const origGetTile = layer.getTile?.bind(layer);
	if (origGetTile) {
		layer.getTile = (coord, zoom, ownerDocument) => {
			const el = origGetTile(coord, zoom, ownerDocument) as HTMLElement | null;
			if (!el) return el as unknown as Element;
			el.style.position = "absolute";
			el.style.top = "0";
			el.style.left = "0";
			el.style.filter = colorFilter;
			el.style.opacity = String(getProviderSettings("yandex").lineOpacity);
			return el;
		};
	}

	return layer;
}

export function createYandexLineLayers(): google.maps.ImageMapType[] {
	if (!isProviderEnabled("yandex") || !getProviderSettings("yandex").showLines) return [];
	if (typeof google === "undefined" || !google?.maps?.ImageMapType) return [];
	void styleGen;
	return [createYandexLineLayer()];
}

export function rebuildYandexStyledLayers(): void {
	styleGen++;
	bumpProviderCoverageLayers();
}

export function initYandexCoverage(): () => void {
	settingsUnsub?.();
	settingsUnsub = subscribeProvidersSettings(() => {
		bumpProviderCoverageLayers();
	});

	registryUnsub?.();
	registryUnsub = registerProviderLineLayers(createYandexLineLayers);

	return () => {
		settingsUnsub?.();
		settingsUnsub = null;
		registryUnsub?.();
		registryUnsub = null;
	};
}
