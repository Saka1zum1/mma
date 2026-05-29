/* eslint-disable @typescript-eslint/no-explicit-any */
import { isOfficialPano } from "@/lib/sv/panoId";
import { PanoType } from "@/types";

const RPC_URL =
	"https://maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/GetMetadata";

const BADCAM_THRESHOLDS = new Map<string, (d: Date, lat: number) => boolean>([
	["BD", (d) => d > new Date(2021, 3)],
	["EC", (d) => d > new Date(2022, 2)],
	["FI", (d) => d > new Date(2020, 8)],
	["IN", (d) => d > new Date(2021, 9)],
	["KH", (d) => d > new Date(2022, 9)],
	["LB", (d) => d > new Date(2021, 0)],
	["LK", (d) => d > new Date(2021, 1)],
	["NG", (d) => d > new Date(2021, 5)],
	["NP", (d) => d > new Date(2020, 0)],
	["US", (d, lat) => lat > 52 && d > new Date(2019, 0)],
	["VN", (d) => d > new Date(2020, 0)],
	...[
		"AT",
		"BG",
		"CZ",
		"DK",
		"EE",
		"ES",
		"FR",
		"GB",
		"GR",
		"HR",
		"IT",
		"LT",
		"LV",
		"PL",
		"PT",
		"RO",
		"SE",
	].map(
		(cc) => [cc, (d: Date) => d > new Date(2021, 0)] as [string, (d: Date, lat: number) => boolean],
	),
	["CY", () => true],
	["ST", () => true],
]);

/** Map panorama tile worldSize height to camera generation. */
export function cameraTypeFromHeight(height: number): CameraType {
	switch (height) {
		case 1664:
			return "gen1";
		case 6656:
			return "gen2";
		case 8192:
			return "gen4";
		default:
			return null;
	}
}

function detectCameraType(data: google.maps.StreetViewResolvedPanoramaData): CameraType {
	const base = cameraTypeFromHeight(data.tiles.worldSize.height);
	if (base !== "gen2") return base;
	if (data.extra?._levelId != null) return "tripod";
	const imgDate = data.imageDate ? new Date(data.imageDate) : null;
	if (imgDate && imgDate.getFullYear() > 2000) {
		const cc = data.extra?.countryCode;
		const check = cc && BADCAM_THRESHOLDS.get(cc);
		if (check && check(imgDate, data.location.latLng.lat())) return "badcam";
	}
	return "gen2";
}

/* Pano ID → imageKey array for protobuf request */
function panoIdToImageKey(panoId: string): [number, string] {
	if (panoId.startsWith("F:")) return [3, panoId.slice(2)];
	if (isOfficialPano(panoId)) return [2, panoId];
	// Base64-encoded protobuf (user-uploaded, etc.) — decode [type, id]
	try {
		const b64 = panoId.replace(/\.+$/, "").replace(/-/g, "+").replace(/_/g, "/");
		const bin = atob(b64);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		// field 1 (varint): type
		let pos = 0;
		if ((bytes[pos++] & 0x07) !== 0) return [2, panoId]; // not varint, bail
		let type = 0,
			shift = 0;
		while (pos < bytes.length) {
			const b = bytes[pos++];
			type |= (b & 0x7f) << shift;
			if ((b & 0x80) === 0) break;
			shift += 7;
		}
		// field 2 (length-delimited): id
		if (pos >= bytes.length || (bytes[pos++] & 0x07) !== 2) return [type, panoId];
		let len = 0;
		shift = 0;
		while (pos < bytes.length) {
			const b = bytes[pos++];
			len |= (b & 0x7f) << shift;
			if ((b & 0x80) === 0) break;
			shift += 7;
		}
		const id = new TextDecoder().decode(bytes.slice(pos, pos + len));
		return [type, id];
	} catch {
		return [2, panoId];
	}
}

/** Convert protobuf imageKey [type, id] back to a pano ID string. */
export function imageKeyToPanoId(key: any[]): string {
	if (!key || !key[1]) return "";
	const type = key[0] ?? 2;
	const id: string = key[1];
	if (type === 2 || type === 0) return id;
	if (type === 3) return `F:${id}`;
	// Other types (e.g. 10 = USER_UPLOADED): encode as protobuf + base64url
	const enc = new TextEncoder();
	const idBytes = enc.encode(id);
	const buf = new Uint8Array(64);
	let pos = 0;
	// field 1 (type), wire type 0 (varint)
	buf[pos++] = 0x08;
	let v = type;
	while (v > 0x7f) {
		buf[pos++] = (v & 0x7f) | 0x80;
		v >>>= 7;
	}
	buf[pos++] = v;
	// field 2 (id), wire type 2 (length-delimited)
	buf[pos++] = 0x12;
	let len = idBytes.length;
	while (len > 0x7f) {
		buf[pos++] = (len & 0x7f) | 0x80;
		len >>>= 7;
	}
	buf[pos++] = len;
	buf.set(idBytes, pos);
	pos += idBytes.length;
	const b64 = btoa(String.fromCharCode(...buf.slice(0, pos)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	return b64;
}

function buildGetMetadataRequest(panoIds: string[]): any[] {
	return [
		["apiv3", null, null, null, "en"],
		["en", "US"],
		panoIds.map((id) => [panoIdToImageKey(id)]),
		[[1, 2, 3, 4, 8, 6], [], null, null, [], []],
	];
}

function parseResult(r: any): google.maps.StreetViewResolvedPanoramaData | null {
	if (!r) return null;
	const status = r[0];
	if (status?.[0] !== 1) return null;

	const panoIdRaw = r[1];
	const tiles = r[2];
	const desc = r[3];
	const attr = r[4];
	const locs = r[5];
	const dateInfo = r[6];

	const loc0 = locs?.[0];
	if (!loc0) return null;

	const locData = loc0[1];
	const panoRefs = loc0[3]?.[0] ?? [];
	const links = loc0[6] ?? [];
	const timeEntries = loc0[8] ?? [];

	const pos = locData?.[0];
	const lat = pos?.[2] ?? 0;
	const lng = pos?.[3] ?? 0;
	const altitude = Number(locData?.[1]?.[0]) || 0;
	// locData[2] is [heading, tilt, roll]; [0] is the driving direction (same value as tiles.centerHeading)
	const drivingDirection = locData?.[2]?.[0] ?? null;
	const countryCode = locData?.[4] || null;
	const levelId = locData?.[3]?.[0] ?? null;

	const incDate = dateInfo?.[7];
	const imageDate =
		incDate && incDate[0] > 0
			? `${String(incDate[0]).padStart(4, "0")}-${String(incDate[1] ?? 0).padStart(2, "0")}`
			: "";

	const panoId = imageKeyToPanoId(panoIdRaw);

	const copyrightName = attr?.[0]?.[0]?.[0]?.[0] ?? "";
	const uploaderName = attr?.[1]?.[0]?.[0]?.[0] ?? null;
	const descParts = desc?.[2] ?? [];
	const description = descParts.map((p: any) => p?.[0] ?? "").join(", ");

	const worldW = tiles?.[2]?.[1] ?? 0;
	const worldH = tiles?.[2]?.[0] ?? 0;
	const tileW = tiles?.[3]?.[1]?.[1] ?? 0;
	const tileH = tiles?.[3]?.[1]?.[0] ?? 0;

	const time = timeEntries
		.map((e: any) => {
			const targetIdx = e[0];
			const ref = panoRefs[targetIdx];
			const d = e[1];
			return {
				pano: ref ? imageKeyToPanoId(ref[0]) : panoId,
				date: new Date(d?.[0] ?? 0, d?.[1] ?? 0, d?.[2] ?? 0),
			};
		})
		.concat({
			pano: panoId,
			date: new Date(incDate?.[0] ?? 0, incDate?.[1] ?? 0, incDate?.[2] ?? 0),
		})
		.sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

	const parsedLinks = links.map((l: any) => {
		const targetIdx = l[0];
		const ref = panoRefs[targetIdx];
		return {
			pano: ref ? imageKeyToPanoId(ref[0]) : "",
			heading: l[1]?.[3] ?? 0,
		};
	});

	const data = {
		copyright: copyrightName,
		location: {
			latLng: { lat: () => lat, lng: () => lng },
			pano: panoId,
			description,
		},
		imageDate,
		links: parsedLinks,
		time,
		tiles: {
			worldSize: { width: worldW, height: worldH },
			tileSize: { width: tileW, height: tileH },
		},
		extra: {
			altitude,
			panoType: panoIdRaw?.[0] ?? PanoType.Official,
			cameraType: null as CameraType,
			countryCode,
			uploaderName,
			drivingDirection,
			_levelId: levelId,
		},
	} as google.maps.StreetViewResolvedPanoramaData;

	data.extra!.cameraType = detectCameraType(data);
	return data;
}

/** Fetch full pano metadata directly from Google's internal RPC (bypasses StreetViewService). */
export async function fetchSvMetadata(
	panoIds: string[],
): Promise<(google.maps.StreetViewResolvedPanoramaData | null)[]> {
	if (panoIds.length === 0) return [];
	const body = buildGetMetadataRequest(panoIds);
	const res = await fetch(RPC_URL, {
		method: "POST",
		headers: {
			"content-type": "application/json+protobuf",
			"x-user-agent": "grpc-web-javascript/0.1",
		},
		body: JSON.stringify(body),
		mode: "cors",
		credentials: "omit",
	});
	if (!res.ok) return panoIds.map(() => null);
	const json = await res.json();
	const statusCode = json[0]?.[0];
	if (statusCode === 3 || statusCode === 5) return panoIds.map(() => null);
	const results = json[1] ?? [];
	return results.map(parseResult);
}
