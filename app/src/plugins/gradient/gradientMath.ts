import type { ExtraFieldDef } from "@/types";

export function lerp(
	a: [number, number, number],
	b: [number, number, number],
	t: number,
): [number, number, number] {
	return [
		Math.round(a[0] + (b[0] - a[0]) * t),
		Math.round(a[1] + (b[1] - a[1]) * t),
		Math.round(a[2] + (b[2] - a[2]) * t),
	];
}

export function gradientColor(stops: [number, number, number][], t: number): [number, number, number] {
	if (t <= 0) return stops[0];
	if (t >= 1) return stops[stops.length - 1];
	const segment = t * (stops.length - 1);
	const i = Math.floor(segment);
	return lerp(stops[i], stops[Math.min(i + 1, stops.length - 1)], segment - i);
}

export function isNumericField(def: ExtraFieldDef | undefined): boolean {
	if (!def) return false;
	return def.type === "number" || def.type === "date";
}
