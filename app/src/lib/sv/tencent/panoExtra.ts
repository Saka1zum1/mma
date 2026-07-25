import type { LocationSvExtra } from "@/lib/sv/providers/types";
import type { TencentPanoMeta } from "./api";

export function buildTencentExtra(meta: TencentPanoMeta): LocationSvExtra {
	const extra: LocationSvExtra = {
		countryCode: "CN",
		cameraType: "tencent",
		panoType: 0,
	};
	// drivingDirection: make the pano's heading available to callers that
	// expect Google-like `extra.drivingDirection` / tiles.centerHeading parity.
	extra.drivingDirection = meta.heading;
	const d = meta.captureDate;
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	extra.imageDate = `${y}-${m}`;
	extra.datetime = Math.floor(d.getTime() / 1000);
	return extra;
}
