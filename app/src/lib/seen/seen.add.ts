import { cmd } from "@/lib/commands";
import { getSettings } from "@/store/settings.add";
import { getCurrentMapId } from "@/store/useMapStore";
import { log } from "@/lib/util/log";

export type { SeenEntry } from "@/bindings.gen";
import type { SeenEntry } from "@/bindings.gen";

interface PendingEntry {
	panoId: string;
	lat: number;
	lng: number;
	enteredAt: number;
	mapId: string | null;
	locationId: number | null;
	countryCode: string | null;
	address: string | null;
}

let staged: PendingEntry | null = null;
let canvasGetter: (() => HTMLCanvasElement | null) | null = null;
let skipNextPanoId: string | null = null;
let latestGeo: { countryCode: string | null; address: string | null } = {
	countryCode: null,
	address: null,
};

export function seenSetCanvas(getter: (() => HTMLCanvasElement | null) | null) {
	canvasGetter = getter;
}

export function seenSkipNext(panoId: string) {
	skipNextPanoId = panoId;
}

export function seenUpdateGeo(countryCode: string | null, address: string | null) {
	latestGeo = { countryCode, address };
	if (staged) {
		if (countryCode) staged.countryCode = countryCode;
		if (address) staged.address = address;
	}
}

export function seenPanoChanged(
	panoId: string,
	lat: number,
	lng: number,
	locationId: number | null,
	countryCode: string | null,
	address: string | null,
	getPov: () => { heading: number; pitch: number; zoom: number },
) {
	const settings = getSettings();
	if (!settings.enableSeen) return;

	if (skipNextPanoId === panoId) {
		skipNextPanoId = null;
		return;
	}

	if (staged) {
		flushStaged(getPov);
	}

	staged = {
		panoId,
		lat,
		lng,
		enteredAt: Date.now(),
		mapId: getCurrentMapId(),
		locationId,
		countryCode: countryCode || latestGeo.countryCode,
		address: address || latestGeo.address,
	};
}

function flushStaged(getPov: () => { heading: number; pitch: number; zoom: number }) {
	if (!staged) return;
	const entry = staged;
	staged = null;

	let thumbnail: string | null = null;
	if (getSettings().enableSeenThumbnails && canvasGetter) {
		const canvas = canvasGetter();
		if (canvas && canvas.width > 0 && canvas.height > 0) {
			thumbnail = captureThumbnail(canvas);
		}
	}

	writeEntry(entry, getPov(), thumbnail);
}

export function seenFlush(getPov: () => { heading: number; pitch: number; zoom: number }) {
	flushStaged(getPov);
}

const RESOLUTIONS = { low: [160, 90], medium: [320, 180], high: [640, 360] } as const;

function captureThumbnail(canvas: HTMLCanvasElement): string | null {
	try {
		const [w, h] = RESOLUTIONS[getSettings().seenResolution] ?? RESOLUTIONS.medium;
		const offscreen = document.createElement("canvas");
		offscreen.width = w;
		offscreen.height = h;
		const ctx = offscreen.getContext("2d");
		if (!ctx) return null;
		ctx.drawImage(canvas, 0, 0, w, h);
		const dataUrl = offscreen.toDataURL("image/jpeg", 0.6);
		const base64 = dataUrl.split(",")[1];
		if (!base64 || base64.length < 100) return null;
		return base64;
	} catch {
		return null;
	}
}

async function writeEntry(
	entry: PendingEntry,
	pov: { heading: number; pitch: number; zoom: number },
	thumbnail: string | null,
) {
	try {
		await cmd.storeSeenWrite({
			panoId: entry.panoId,
			lat: entry.lat,
			lng: entry.lng,
			heading: pov.heading,
			pitch: pov.pitch,
			zoom: pov.zoom,
			enteredAt: entry.enteredAt,
			mapId: entry.mapId,
			locationId: entry.locationId,
			countryCode: entry.countryCode,
			address: entry.address,
			thumbnail,
		});
	} catch (e) {
		log.warn("[seen] failed to write entry:", e);
	}
}

export type { SeenFilter } from "@/bindings.gen";
import type { SeenFilter } from "@/bindings.gen";

export async function getSeenEntries(
	limit = 100,
	offset = 0,
	filter?: SeenFilter,
): Promise<SeenEntry[]> {
	const result = await cmd.storeSeenList(limit, offset, filter ?? null);
	return result;
}

export async function getSeenCount(filter?: SeenFilter): Promise<number> {
	return cmd.storeSeenCount(filter ?? null);
}

export async function getSeenCountries(): Promise<string[]> {
	return cmd.storeSeenCountries();
}

export async function getSeenMaps(): Promise<{ id: string; name: string }[]> {
	return cmd.storeSeenMaps();
}

export async function clearSeen(): Promise<void> {
	await cmd.storeSeenClear();
}
