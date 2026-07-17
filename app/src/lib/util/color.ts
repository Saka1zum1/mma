export type RGB = { r: number; g: number; b: number };

/** Parse "#rrggbb" to an [r, g, b] byte tuple. Single source for hex parsing. */
export function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	return [
		parseInt(h.substring(0, 2), 16),
		parseInt(h.substring(2, 4), 16),
		parseInt(h.substring(4, 6), 16),
	];
}

export function textColorFor(bg: string): string {
	const [r, g, b] = hexToRgb(bg);
	return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000" : "#fff";
}

/** SV line colors were historically Open Props ramp names ("cyan"); stored
 *  prefs may still hold one. Hex passes through. */
export function resolveSvColorHex(color: string): string {
	if (color.startsWith("#")) return color;
	return (
		getComputedStyle(document.documentElement).getPropertyValue(`--${color}-7`).trim() || "#1098ad"
	);
}

/** The app accent follows the SV coverage line color. Derives the full accent
 *  token family and stamps it on :root. */
export function applyAccentColor(hex: string) {
	const { h, s, l } = hexToHsl(hex);
	const root = document.documentElement.style;
	root.setProperty("--accent", hex);
	root.setProperty("--accent-hover", hslToHex(h, s, Math.min(l + 8, 95)));
	root.setProperty("--accent-muted", `${hex}26`);
	root.setProperty("--on-accent", textColorFor(hex));
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
	const [r8, g8, b8] = hexToRgb(hex);
	const r = r8 / 255;
	const g = g8 / 255;
	const b = b8 / 255;
	const max = Math.max(r, g, b),
		min = Math.min(r, g, b);
	let hue = 0,
		sat = 0;
	const lit = (max + min) / 2;
	if (max !== min) {
		const d = max - min;
		sat = lit > 0.5 ? d / (2 - max - min) : d / (max + min);
		if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
		else if (max === g) hue = ((b - r) / d + 2) / 6;
		else hue = ((r - g) / d + 4) / 6;
	}
	return {
		h: Math.round(hue * 360),
		s: Math.round(sat * 100),
		l: Math.round(lit * 100),
	};
}

export function hslToHex(h: number, s: number, l: number): string {
	const [r, g, b] = hslToRgb(h, s / 100, l / 100);
	const hex = (n: number) => n.toString(16).padStart(2, "0");
	return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)));
	};
	return [f(0), f(8), f(4)];
}

/**
 * Deterministic tag color from a name.
 */
export function colorForName(name: string): string {
	let h = 0;
	for (const b of new TextEncoder().encode(name)) {
		h = (h + ((b + (h << 5)) | 0)) | 0;
	}
	h = (Math.imul(h, 214013) + 2531011) | 0;
	const hue = Math.abs(h) % 360;
	const [r, g, b] = hslToRgb(hue, 0.5, 0.5);
	const hex = (n: number) => n.toString(16).padStart(2, "0");
	return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function rgbCss([r, g, b]: [number, number, number]): string {
	return `rgb(${r}, ${g}, ${b})`;
}

export function hexToRgbObj(hex: string): RGB {
	const [r, g, b] = hexToRgb(hex);
	return { r, g, b };
}

export function rgbToHex({ r, g, b }: RGB): string {
	const h = (n: number) => Math.round(n).toString(16).padStart(2, "0");
	return `#${h(r)}${h(g)}${h(b)}`;
}

/** A label's color: a user override if set, else a deterministic color from its name. */
export function labelColor(name: string, overrides: Record<string, string>): string {
	return overrides[name.toLowerCase()] ?? colorForName(name);
}
