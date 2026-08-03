import { IconLayer, PathLayer } from "@deck.gl/layers";
import type { LatLng } from "@/types";

function svgDataUrl(svg: string): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Classic map pin — tip at bottom center (48×64). */
const PIN_W = 48;
const PIN_H = 64;
const PIN_ANCHOR_X = PIN_W / 2;
const PIN_ANCHOR_Y = PIN_H;

/** Player guess — red pin with hollow center. */
export const GUESS_PIN_URL = svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_W}" height="${PIN_H}" viewBox="0 0 48 64">
  <path fill="#D32F2F" stroke="#8B0000" stroke-width="1.5" d="M24 2C13.5 2 5 10.8 5 21.5 5 38 24 62 24 62s19-24 19-40.5C43 10.8 34.5 2 24 2z"/>
  <circle cx="24" cy="21" r="9" fill="#fff"/>
  <circle cx="24" cy="21" r="5" fill="#D32F2F"/>
</svg>`);

/** Correct location — green pin with check. */
export const TRUTH_PIN_URL = svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_W}" height="${PIN_H}" viewBox="0 0 48 64">
	<path fill="#2E7D32" stroke="#1B5E20" stroke-width="1.5" d="M24 2C13.5 2 5 10.8 5 21.5 5 38 24 62 24 62s19-24 19-40.5C43 10.8 34.5 2 24 2z"/>
	<circle cx="24" cy="21" r="9" fill="#fff"/>
	<path d="M20 21l3 3 6-6" stroke="#2E7D32" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`);
  
  
  

/** Stable icon defs — returning the same object avoids icon reload by deck.gl on every render. */
const GUESS_ICON = {
	url: GUESS_PIN_URL,
	width: PIN_W,
	height: PIN_H,
	anchorX: PIN_ANCHOR_X,
	anchorY: PIN_ANCHOR_Y,
	mask: false,
};

const TRUTH_ICON = {
	url: TRUTH_PIN_URL,
	width: PIN_W,
	height: PIN_H,
	anchorX: PIN_ANCHOR_X,
	anchorY: PIN_ANCHOR_Y,
	mask: false,
};

function pinIconLayer(
	id: string,
	point: LatLng,
	icon: typeof GUESS_ICON,
	sizePx: number,
) {
	return new IconLayer({
		id,
		data: [point],
		getPosition: (d: LatLng) => [d.lng, d.lat],
		getIcon: () => icon,
		getSize: sizePx,
		sizeUnits: "pixels",
		sizeMinPixels: sizePx,
		sizeMaxPixels: sizePx,
		billboard: true,
		pickable: false,
		alphaCutoff: 0.05,
		parameters: { depthTest: false },
		updateTriggers: {
			getIcon: [icon.url],
			getSize: [sizePx],
		},
	});
}

export function createGuessPinLayer(id: string, point: LatLng, sizePx = 36) {
	return pinIconLayer(id, point, GUESS_ICON, sizePx);
}

export function createTruthPinLayer(id: string, point: LatLng, sizePx = 36) {
	return pinIconLayer(id, point, TRUTH_ICON, sizePx);
}

/** Black dashed connector; render before pin layers so lines sit under icons. */
export function createResultLineLayer(guess: LatLng, truth: LatLng) {
	const segmentCount = 48;
	const data: { path: [number, number][] }[] = [];
	for (let i = 0; i < segmentCount; i += 2) {
		const t0 = i / segmentCount;
		const t1 = (i + 1) / segmentCount;
		data.push({
			path: [
				[guess.lng + (truth.lng - guess.lng) * t0, guess.lat + (truth.lat - guess.lat) * t0],
				[guess.lng + (truth.lng - guess.lng) * t1, guess.lat + (truth.lat - guess.lat) * t1],
			],
		});
	}
	return new PathLayer({
		id: "gg-result-line",
		data,
		getPath: (d: { path: [number, number][] }) => d.path,
		getColor: [0, 0, 0, 255],
		getWidth: 2,
		widthUnits: "pixels",
		capRounded: true,
		jointRounded: true,
		pickable: false,
		parameters: { depthTest: false },
	});
}
