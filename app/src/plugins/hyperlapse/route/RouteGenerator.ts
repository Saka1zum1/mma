import type { LatLng } from "@/types";
import { distMeters } from "@/lib/geo/geo";

const EARTH_RADIUS_M = 6371000;

function toRad(d: number) {
	return (d * Math.PI) / 180;
}

function toDeg(r: number) {
	return (r * 180) / Math.PI;
}

/** Spherical linear interpolation between two WGS84 points. `t` in [0, 1]. */
export function interpolateLatLng(a: LatLng, b: LatLng, t: number): LatLng {
	if (t <= 0) return { lat: a.lat, lng: a.lng };
	if (t >= 1) return { lat: b.lat, lng: b.lng };

	const lat1 = toRad(a.lat);
	const lon1 = toRad(a.lng);
	const lat2 = toRad(b.lat);
	const lon2 = toRad(b.lng);

	const d =
		2 *
		Math.asin(
			Math.sqrt(
				Math.sin((lat2 - lat1) / 2) ** 2 +
					Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
			),
		);

	if (d < 1e-12) return { lat: a.lat, lng: a.lng };

	const A = Math.sin((1 - t) * d) / Math.sin(d);
	const B = Math.sin(t * d) / Math.sin(d);
	const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
	const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
	const z = A * Math.sin(lat1) + B * Math.sin(lat2);

	return {
		lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
		lng: toDeg(Math.atan2(y, x)),
	};
}

/** Initial bearing from `a` to `b` in degrees [0, 360). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const dLng = toRad(b.lng - a.lng);
	const y = Math.sin(dLng) * Math.cos(lat2);
	const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
	return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export interface SamplePathOptions {
	/** Target spacing between samples in meters. Default 5. */
	distanceBetweenPoints?: number;
	/** Hard cap on returned points. Default 100. */
	maxPoints?: number;
}

/**
 * Sample a polyline at roughly equal spacing.
 * Spacing is max(distanceBetweenPoints, totalLength / maxPoints), matching Hyperlapse.js.
 */
export function samplePath(path: LatLng[], opts: SamplePathOptions = {}): LatLng[] {
	if (path.length === 0) return [];
	if (path.length === 1) return [{ lat: path[0].lat, lng: path[0].lng }];

	const distanceBetweenPoints = Math.max(1, opts.distanceBetweenPoints ?? 5);
	const maxPoints = Math.max(2, opts.maxPoints ?? 100);

	let total = 0;
	const segs: number[] = [];
	for (let i = 0; i < path.length - 1; i++) {
		const d = distMeters(path[i], path[i + 1]);
		segs.push(d);
		total += d;
	}
	if (total <= 0) return [{ lat: path[0].lat, lng: path[0].lng }];

	const step = Math.max(distanceBetweenPoints, total / maxPoints);
	const out: LatLng[] = [{ lat: path[0].lat, lng: path[0].lng }];
	let nextAt = step;
	let traveled = 0;

	for (let i = 0; i < path.length - 1; i++) {
		const a = path[i];
		const b = path[i + 1];
		const seg = segs[i];
		if (seg <= 0) continue;

		while (nextAt < traveled + seg - 1e-6 && out.length < maxPoints - 1) {
			const t = (nextAt - traveled) / seg;
			out.push(interpolateLatLng(a, b, t));
			nextAt += step;
		}
		traveled += seg;
	}

	const end = path[path.length - 1];
	const last = out[out.length - 1];
	if (distMeters(last, end) > 0.5) {
		if (out.length < maxPoints) out.push({ lat: end.lat, lng: end.lng });
		else out[out.length - 1] = { lat: end.lat, lng: end.lng };
	}

	return out;
}

/** Fetch a driving route polyline via Google Directions (when available in opensv). */
export async function fetchDrivingRoute(origin: LatLng, destination: LatLng): Promise<LatLng[]> {
	// Lazy: avoid importing opensv (HTMLCanvasElement side-effects) at module load.
	const g = (globalThis as { google?: typeof google }).google;
	if (!g?.maps?.DirectionsService) {
		return [
			{ lat: origin.lat, lng: origin.lng },
			{ lat: destination.lat, lng: destination.lng },
		];
	}

	const service = new g.maps.DirectionsService();
	const response = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
		service.route(
			{
				origin: new g.maps.LatLng(origin.lat, origin.lng),
				destination: new g.maps.LatLng(destination.lat, destination.lng),
				travelMode: g.maps.TravelMode.DRIVING,
			},
			(result, status) => {
				if (status === "OK" && result) resolve(result);
				else reject(new Error(`Directions failed: ${status}`));
			},
		);
	});

	const route = response.routes[0];
	if (!route) throw new Error("No route returned");

	const overview = route.overview_path;
	if (overview?.length) {
		return overview.map((p) => ({ lat: p.lat(), lng: p.lng() }));
	}

	const points: LatLng[] = [];
	for (const leg of route.legs ?? []) {
		for (const step of leg.steps ?? []) {
			for (const p of step.path ?? []) points.push({ lat: p.lat(), lng: p.lng() });
		}
	}
	if (points.length === 0) {
		return [
			{ lat: origin.lat, lng: origin.lng },
			{ lat: destination.lat, lng: destination.lng },
		];
	}
	return points;
}

/** Total path length in meters. */
export function pathLengthMeters(path: LatLng[]): number {
	let total = 0;
	for (let i = 0; i < path.length - 1; i++) total += distMeters(path[i], path[i + 1]);
	return total;
}

/** Destination point given start, bearing (deg), and distance (m). */
export function destinationPoint(start: LatLng, bearingDeg: number, distanceM: number): LatLng {
	const δ = distanceM / EARTH_RADIUS_M;
	const θ = toRad(bearingDeg);
	const φ1 = toRad(start.lat);
	const λ1 = toRad(start.lng);
	const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
	const λ2 =
		λ1 +
		Math.atan2(
			Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
			Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
		);
	return { lat: toDeg(φ2), lng: ((toDeg(λ2) + 540) % 360) - 180 };
}
