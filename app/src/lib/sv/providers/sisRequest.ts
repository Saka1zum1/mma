/**
 * Google MapsJsInternalService SingleImageSearchRequest (json+protobuf).
 *
 * Layout matches opensv / altproviders PhotoByLatLngQuery:
 *   body[1] = location = [centerLatLng, radiusMeters, ...]
 *   center  = [_,_,lat,lng]  (LatLng fields 3/4)
 *
 * Also accepts field-number object maps used by some protobuf JSON codecs:
 *   { "1": context, "2": { "1": center, "2": radius } }
 */
export interface SisLatLngQuery {
	lat: number;
	lng: number;
	/** Search radius in meters from Google's request.location.radius. */
	radiusM: number;
}

const DEFAULT_RADIUS_M = 50;

function asArray(value: unknown): unknown[] | null {
	if (Array.isArray(value)) return value;
	if (value && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		const keys = Object.keys(obj)
			.map(Number)
			.filter((n) => Number.isInteger(n) && n > 0);
		if (keys.length === 0) return null;
		const max = Math.max(...keys);
		const out: unknown[] = new Array(max);
		for (const k of keys) out[k - 1] = obj[String(k)];
		return out;
	}
	return null;
}

function readLatLng(center: unknown): { lat: number; lng: number } | null {
	const arr = asArray(center);
	if (!arr) return null;
	const lat = Number(arr[2]);
	const lng = Number(arr[3]);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	return { lat, lng };
}

function readRadiusM(raw: unknown): number {
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : DEFAULT_RADIUS_M;
}

/** Read lat/lng/radius from a SingleImageSearchRequest json+protobuf body. */
export function parseSingleImageSearchRequest(body: unknown): SisLatLngQuery | null {
	const root = asArray(body);
	if (!root) return null;
	const loc = asArray(root[1]);
	if (!loc) return null;
	const ll = readLatLng(loc[0]);
	if (!ll) return null;
	return {
		lat: ll.lat,
		lng: ll.lng,
		radiusM: readRadiusM(loc[1]),
	};
}
