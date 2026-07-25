/**
 * Yandex equirect ↔ PSV yaw ↔ compass.
 *
 * PSV EquirectangularAdapter maps the image centre to yaw = 0 (no poseHeading).
 * Yandex `meta.heading` (= Origin[0]+180) is the compass azimuth of that image
 * centre. Therefore:
 *
 *   compass = psvYaw° + meta.heading
 *   psvYaw° = compass − meta.heading
 *
 * Do NOT apply poseHeading / sphereCorrection for north alignment — that fights
 * the tiles adapter and desyncs MovementPlugin ENU markers from the texture.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function normDeg(d: number): number {
	return ((d % 360) + 360) % 360;
}

/** Compass degrees → PSV yaw radians (texture-native frame). */
export function compassToPsvYaw(compassDeg: number, imageCenterHeadingDeg: number): number {
	return normDeg(compassDeg - imageCenterHeadingDeg) * DEG2RAD;
}

/** PSV yaw radians → compass degrees. */
export function psvYawToCompass(yawRad: number, imageCenterHeadingDeg: number): number {
	return normDeg(yawRad * RAD2DEG + imageCenterHeadingDeg);
}

/** `enuToPhotoSphere` direction offset: compass of PSV yaw=0. */
export function yandexYawNorthOffsetRad(imageCenterHeadingDeg: number): number {
	return imageCenterHeadingDeg * DEG2RAD;
}
