import { LOOKMAP_ORIGIN } from "./endpoints";

/** lookaround-map share hash payload: lat, lon, yaw, pitch as Float32 LE → base64url. */
export function encodeShareLinkPayload(
	lat: number,
	lon: number,
	yaw: number,
	pitch: number,
): string {
	const floats = new Float32Array(4);
	floats[0] = lat;
	floats[1] = lon;
	floats[2] = yaw;
	floats[3] = pitch;
	const bytes = new Uint8Array(floats.buffer);
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Google POV (degrees) → lookmap viewer yaw/pitch (radians). */
export function googlePovToLookmapRadians(headingDeg: number, pitchDeg: number): {
	yaw: number;
	pitch: number;
} {
	return {
		yaw: (-headingDeg * Math.PI) / 180,
		pitch: (pitchDeg * Math.PI) / 180,
	};
}

export function buildLookmapOpenUrl(
	lat: number,
	lon: number,
	headingDeg: number,
	pitchDeg: number,
): string {
	return `${LOOKMAP_ORIGIN}/#c=18/${lat}/${lon}&p=${lat}/${lon}&a=${headingDeg}/${pitchDeg}`;
}

export function buildLookmapShareUrl(
	lat: number,
	lon: number,
	yaw: number,
	pitch: number,
): string {
	return `${LOOKMAP_ORIGIN}/#s=${encodeShareLinkPayload(lat, lon, yaw, pitch)}`;
}
