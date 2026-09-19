import { PbfReader, PbfWriter } from "pbf";
import { PanoType, type Pano } from "@/types";

const OFFICIAL_PANO_RE = /^[-_A-Za-z0-9]{21}[AQgw]$/;

export function isOfficialPano(panoId: string): boolean {
	if (panoId.startsWith("F:")) return false;
	// Bare user-contribution keys can be exactly 22 characters, colliding with the
	// official shape; the prefix is the tell.
	if (panoId.startsWith("CIHM")) return false;
	return OFFICIAL_PANO_RE.test(panoId);
}

function imageDateKey(d: unknown): string {
	if (typeof d === "string") return d;
	if (d instanceof Date && !Number.isNaN(d.getTime())) {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
	}
	if (d && typeof d === "object" && "year" in d) {
		const y = (d as { year?: number }).year ?? 0;
		const m = (d as { month?: number }).month ?? 1;
		return `${y}-${String(m).padStart(2, "0")}`;
	}
	return "";
}

/** `a`'s capture month is strictly after `b`'s. Undated coverage never counts as newer. */
export function capturedAfter(
	a: { imageDate?: unknown },
	b: { imageDate?: unknown },
): boolean {
	const da = imageDateKey(a.imageDate);
	const db = imageDateKey(b.imageDate);
	return da !== "" && da > db;
}

/** Newest official pano in a capture timeline, or null if it holds none. Timelines from
 *  `svMetadata` are sorted ascending by date, so "newest" is the last official entry —
 *  scanning backwards rather than indexing keeps that assumption in one place. */
export function newestOfficialPano<T extends { pano: string }>(time: readonly T[]): T | null {
	return time.findLast((t) => isOfficialPano(t.pano)) ?? null;
}

/** Heuristic: a user-uploaded pano, by id length or attribution. Both attribution texts are
 *  searched: a user photo can carry a place description as well as its "Photo by" line. */
export function isUnofficial(p: Pano): boolean {
	if (!p.pano) return false;
	if (p.pano.length > 22) return true;
	return /photo by|user[- ]uploaded/i.test(`${p.shortDescription} ${p.copyright}`);
}

/** Pano ID -> protobuf `ImageKey` [frontend, id]. */
export function panoIdToImageKey(panoId: string): [number, string] {
	if (panoId.startsWith("F:")) return [PanoType.Unknown, panoId.slice(2)];
	// Bare user-contribution keys can be exactly 22 characters, colliding with the
	// official shape; by prefix they resolve only over the user-uploaded frontend.
	if (panoId.startsWith("CIHM")) return [PanoType.UserUploaded, panoId];
	if (isOfficialPano(panoId)) return [PanoType.Official, panoId];
	// Base64url-encoded binary protobuf ImageKey (user-uploaded, etc.) — {1: type, 2: id}
	try {
		const b64 = panoId.replace(/\.+$/, "").replace(/-/g, "+").replace(/_/g, "/");
		const bin = atob(b64);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		const pbf = new PbfReader(bytes);
		let type = 2;
		let id = panoId;
		let field;
		while ((field = pbf.nextField())) {
			if (field === 1) type = pbf.readVarint();
			else if (field === 2) id = pbf.readString();
			else pbf.skip(pbf.type);
		}
		return [type, id];
	} catch {
		return [2, panoId];
	}
}

/** Protobuf `ImageKey` [frontend, id] -> pano ID string. */
export function imageKeyToPanoId(key: unknown[]): string {
	if (!key || !key[1]) return "";
	const type = (key[0] as number) ?? 2;
	const id = key[1] as string;
	if (type === 2 || type === 0) return id;
	if (type === 3) return `F:${id}`;
	const pbf = new PbfWriter();
	pbf.writeVarintField(1, type);
	pbf.writeStringField(2, id);
	const buf = pbf.finish();
	let bin = "";
	for (const byte of buf) bin += String.fromCharCode(byte);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ".");
}
