import type { BaiduTraverseSettings } from "./types";

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

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

interface SkipWindow {
	enabled: boolean;
	start: number;
	end: number;
}

function clampInt(n: number, lo: number, hi: number): number {
	const v = Math.trunc(Number(n));
	if (!Number.isFinite(v)) return lo;
	return Math.min(hi, Math.max(lo, v));
}

/** Minute of day in UTC, matching the scanner's `minute_of_day`. */
function minuteOfDay(ms: number): number {
	const local = ((ms % DAY_MS) + DAY_MS) % DAY_MS;
	return Math.floor(local / MIN_MS);
}

function skipMinute(minute: number, skip: SkipWindow): boolean {
	if (!skip.enabled) return false;
	if (skip.start <= skip.end) return minute >= skip.start && minute <= skip.end;
	return minute >= skip.start || minute <= skip.end;
}

function skippedMinutesPerDay(skip: SkipWindow): number {
	if (!skip.enabled) return 0;
	if (skip.start <= skip.end) return skip.end - skip.start + 1;
	return 1440 - skip.start + skip.end + 1;
}

/** Non-skipped milliseconds in one UTC day slice. `localLo`/`localHi` are 0–86_399_999. */
function countInDay(localLo: number, localHi: number, skip: SkipWindow): number {
	if (!skip.enabled) return localHi - localLo + 1;
	let total = 0;
	let cursor = localLo;
	while (cursor <= localHi) {
		const minuteStart = cursor - (cursor % MIN_MS);
		const segEnd = Math.min(localHi, minuteStart + MIN_MS - 1);
		if (!skipMinute(Math.floor(cursor / MIN_MS), skip)) total += segEnd - cursor + 1;
		cursor = segEnd + 1;
	}
	return total;
}

/** Every non-skipped millisecond from `lo` through `hi`, inclusive. */
function countFine(lo: number, hi: number, skip: SkipWindow): number {
	if (hi < lo) return 0;
	if (!skip.enabled) return hi - lo + 1;
	const loDay = Math.floor(lo / DAY_MS);
	const hiDay = Math.floor(hi / DAY_MS);
	if (loDay === hiDay) return countInDay(lo % DAY_MS, hi % DAY_MS, skip);
	const head = countInDay(lo % DAY_MS, DAY_MS - 1, skip);
	const tail = countInDay(0, hi % DAY_MS, skip);
	const mid = hiDay - loDay - 1;
	return head + tail + mid * (DAY_MS - skippedMinutesPerDay(skip) * MIN_MS);
}

/**
 * Rough windows: each start that is still inside the range and outside the skip emits
 * `duration` milliseconds plus the start itself, then jumps `step` minutes. The window
 * is not cut at the end, same as `ScanState` in sv_net.rs.
 */
function countRough(
	startMs: number,
	endMs: number,
	reverse: boolean,
	stepMin: number,
	durSec: number,
	skip: SkipWindow,
): number {
	const jump = clampInt(stepMin, 1, 1440) * MIN_MS;
	const dur = clampInt(durSec, 1, 3600) * 1000;
	const maxSteps = Math.floor(Math.abs(endMs - startMs) / jump) + 2;
	let cursor = startMs;
	let total = 0;
	for (let i = 0; i < maxSteps; i++) {
		if (reverse ? cursor < endMs : cursor > endMs) break;
		if (!skipMinute(minuteOfDay(cursor), skip)) total += dur + 1;
		cursor += reverse ? -jump : jump;
	}
	return total;
}

/** 27-character id, no `BAIDU:` prefix. Rejects a timestamp chrono would reject. */
function parseEndpoint(raw: string): ParsedBaiduId | null {
	const id = raw.trim();
	if (id.length !== 27) return null;
	const ms = idMillis(id);
	if (ms == null) return null;
	const time = id.slice(10, 25);
	const dt = new Date(ms);
	if (
		dt.getUTCMinutes() !== Number(time.slice(8, 10)) ||
		dt.getUTCSeconds() !== Number(time.slice(10, 12)) ||
		dt.getUTCMilliseconds() !== Number(time.slice(12, 15))
	) {
		return null;
	}
	return { id, group: id.slice(0, 10) + id.slice(25), ms };
}

/**
 * How many pano ids a traverse will send for this range. Null when the endpoints
 * cannot start a scan. Fine scans are counted in constant time; a month of 1 ms
 * steps is billions of ids.
 */
export function traverseProbeTotal(
	t: Pick<
		BaiduTraverseSettings,
		| "startPanoId"
		| "endPanoId"
		| "useRoughScan"
		| "scanStepMin"
		| "scanDurationSec"
		| "skipTimeEnabled"
		| "skipStartMin"
		| "skipEndMin"
	>,
): number | null {
	const start = parseEndpoint(t.startPanoId);
	const end = parseEndpoint(t.endPanoId);
	if (!start || !end || start.group !== end.group) return null;
	const skip: SkipWindow = {
		enabled: t.skipTimeEnabled,
		start: clampInt(t.skipStartMin, 0, 1439),
		end: clampInt(t.skipEndMin, 0, 1439),
	};
	if (t.useRoughScan) {
		return countRough(start.ms, end.ms, start.ms > end.ms, t.scanStepMin, t.scanDurationSec, skip);
	}
	return countFine(Math.min(start.ms, end.ms), Math.max(start.ms, end.ms), skip);
}
