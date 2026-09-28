/**
 * Traverse tag for one sdata row. A non-empty `Roads` list is normal coverage and gets
 * no tag. A longer `TimeLine` replaces hidden coverage, so a location carries one tag.
 */
export function baiduCoverageKind(row: unknown): "hidden" | "timeline" | null {
	if (!row || typeof row !== "object") return null;
	const rec = row as { Roads?: unknown; TimeLine?: unknown };
	if (Array.isArray(rec.Roads) && rec.Roads.length > 0) return null;
	if (Array.isArray(rec.TimeLine) && rec.TimeLine.length > 1) return "timeline";
	return "hidden";
}

/** One Baidu id's place on the traverse clock. Prefix and car must match across a range. */
interface ParsedBaiduId {
	id: string;
	group: string;
	ms: number;
}

export interface TraverseEndpointRange {
	startPanoId: string;
	endPanoId: string;
	count: number;
	/** Other prefix/car groups were present and not used. */
	skippedGroups: number;
}

function bareId(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	let id = raw.trim();
	if (id.startsWith("BAIDU:")) id = id.slice("BAIDU:".length);
	return id.length === 27 ? id : null;
}

/** `YYMMDDHHmmssSSS` in the middle of a 27-character Baidu id, as UTC milliseconds. */
function idMillis(id: string): number | null {
	const time = id.slice(10, 25);
	if (!/^\d{15}$/.test(time)) return null;
	const year = 2000 + Number(time.slice(0, 2));
	const month = Number(time.slice(2, 4));
	const day = Number(time.slice(4, 6));
	const hour = Number(time.slice(6, 8));
	const minute = Number(time.slice(8, 10));
	const second = Number(time.slice(10, 12));
	const millis = Number(time.slice(12, 15));
	const ms = Date.UTC(year, month - 1, day, hour, minute, second, millis);
	const dt = new Date(ms);
	if (
		dt.getUTCFullYear() !== year ||
		dt.getUTCMonth() !== month - 1 ||
		dt.getUTCDate() !== day ||
		dt.getUTCHours() !== hour
	) {
		return null;
	}
	return ms;
}

function parseBaiduId(raw: unknown): ParsedBaiduId | null {
	const id = bareId(raw);
	if (!id) return null;
	const ms = idMillis(id);
	if (ms == null) return null;
	return { id, group: id.slice(0, 10) + id.slice(25), ms };
}

function isBaiduLocation(row: Record<string, unknown>): boolean {
	const source = row.source;
	if (source == null || source === "") return true;
	if (typeof source !== "string") return false;
	const name = source.toLowerCase();
	return name === "baidu" || name === "baidu_pano" || name.includes("baidu");
}

function panoIdOf(row: Record<string, unknown>): unknown {
	if (typeof row.panoId === "string" && row.panoId) return row.panoId;
	const extra = row.extra;
	if (extra && typeof extra === "object" && "panoId" in extra) {
		return (extra as { panoId?: unknown }).panoId;
	}
	return null;
}

function coordinatesOf(data: unknown): unknown[] | null {
	if (Array.isArray(data)) return data;
	if (!data || typeof data !== "object") return null;
	const coords = (data as { customCoordinates?: unknown }).customCoordinates;
	return Array.isArray(coords) ? coords : null;
}

/**
 * Earliest and latest Baidu pano id in an MMA map file (`{ customCoordinates }`).
 * Traverse needs one prefix and car, so a file that mixes cars uses the largest group.
 */
export function traverseRangeFromMap(data: unknown): TraverseEndpointRange | null {
	const rows = coordinatesOf(data);
	if (!rows) return null;
	const groups = new Map<string, ParsedBaiduId[]>();
	for (const row of rows) {
		if (!row || typeof row !== "object") continue;
		const rec = row as Record<string, unknown>;
		if (!isBaiduLocation(rec)) continue;
		const parsed = parseBaiduId(panoIdOf(rec));
		if (!parsed) continue;
		const list = groups.get(parsed.group);
		if (list) list.push(parsed);
		else groups.set(parsed.group, [parsed]);
	}
	let best: ParsedBaiduId[] | null = null;
	for (const list of groups.values()) {
		if (!best || list.length > best.length) best = list;
	}
	if (!best || best.length === 0) return null;
	let start = best[0]!;
	let end = best[0]!;
	for (const item of best) {
		if (item.ms < start.ms) start = item;
		if (item.ms > end.ms) end = item;
	}
	return {
		startPanoId: start.id,
		endPanoId: end.id,
		count: best.length,
		skippedGroups: groups.size - 1,
	};
}
