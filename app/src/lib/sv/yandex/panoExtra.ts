import type { LocationSvExtra } from "@/lib/sv/providers/types";
import type { YandexPanoMeta } from "./api";

export function buildYandexExtra(meta: YandexPanoMeta): LocationSvExtra {
	const d = meta.captureDate;
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const extra: LocationSvExtra = {
		cameraType: "yandex",
		panoType: 0,
		imageDate: `${y}-${m}`,
		datetime: Math.floor(d.getTime() / 1000),
		drivingDirection: meta.heading,
	};
	if (meta.author) extra.uploader = meta.author;
	return extra;
}
