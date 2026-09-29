import { describe, expect, it } from "vitest";
import {
	baiduCoverageKind,
	traverseProbeTotal,
	traverseRangeFromMap,
} from "@/plugins/generator/engine/traverseRange";
import type { BaiduTraverseSettings } from "@/plugins/generator/engine/types";

const EARLY = "010000000023010112000000001";
const LATE = "010000000023060100000000001";
const OTHER_CAR = "010000000023030100000000002";

describe("baidu traverse coverage tags", () => {
	it("leaves normal coverage untagged", () => {
		expect(baiduCoverageKind({ Roads: [{ Name: "A" }], TimeLine: [{ ID: "a" }, { ID: "b" }] })).toBeNull();
	});

	it("tags a roadless capture as hidden coverage", () => {
		expect(baiduCoverageKind({ Roads: [], TimeLine: [{ ID: "a" }] })).toBe("hidden");
		expect(baiduCoverageKind({})).toBe("hidden");
	});

	it("uses timeline coverage instead of hidden coverage when several dates exist", () => {
		expect(baiduCoverageKind({ Roads: [], TimeLine: [{ ID: "a" }, { ID: "b" }] })).toBe("timeline");
	});
});

describe("traverse range from an MMA map file", () => {
	it("uses the earliest and latest id of the largest car", () => {
		const range = traverseRangeFromMap({
			name: "sample",
			customCoordinates: [
				{ panoId: `BAIDU:${LATE}`, source: "baidu_pano" },
				{ panoId: EARLY, source: "baidu_pano" },
				{ panoId: OTHER_CAR, source: "baidu_pano" },
				{ panoId: "google-id", source: "google" },
				{ extra: { panoId: LATE }, source: "baidu" },
			],
		});
		expect(range).toEqual({
			startPanoId: EARLY,
			endPanoId: LATE,
			count: 3,
			skippedGroups: 1,
		});
	});

	it("rejects a file that is not map data", () => {
		expect(traverseRangeFromMap({ name: "empty" })).toBeNull();
		expect(traverseRangeFromMap({ customCoordinates: [{ lat: 1, lng: 2 }] })).toBeNull();
	});
});

function pidAt(ms: number, car = "01", prefix = "0100000000"): string {
	const d = new Date(ms);
	const p = (n: number, w: number) => String(n).padStart(w, "0");
	const time =
		p(d.getUTCFullYear() % 100, 2) +
		p(d.getUTCMonth() + 1, 2) +
		p(d.getUTCDate(), 2) +
		p(d.getUTCHours(), 2) +
		p(d.getUTCMinutes(), 2) +
		p(d.getUTCSeconds(), 2) +
		p(d.getUTCMilliseconds(), 3);
	return `${prefix}${time}${car}`;
}

function total(
	start: number,
	end: number,
	extra: Partial<BaiduTraverseSettings> = {},
): number | null {
	return traverseProbeTotal({
		startPanoId: pidAt(start),
		endPanoId: pidAt(end),
		useRoughScan: false,
		scanStepMin: 1,
		scanDurationSec: 1,
		skipTimeEnabled: false,
		skipStartMin: 0,
		skipEndMin: 0,
		...extra,
	});
}

describe("traverse probe total", () => {
	const t0 = Date.UTC(2023, 0, 1, 0, 0, 0, 0);

	it("counts every millisecond of a fine scan, in either direction", () => {
		expect(total(t0, t0)).toBe(1);
		expect(total(t0, t0 + 999)).toBe(1000);
		expect(total(t0 + 999, t0)).toBe(1000);
	});

	it("drops whole skip minutes, including a window that wraps midnight", () => {
		expect(total(t0, t0 + 119_999, { skipTimeEnabled: true, skipStartMin: 0, skipEndMin: 0 })).toBe(
			60_000,
		);
		const late = Date.UTC(2023, 0, 1, 23, 59, 0, 0);
		const early = Date.UTC(2023, 0, 2, 0, 1, 0, 0);
		expect(
			total(late, early, { skipTimeEnabled: true, skipStartMin: 23 * 60 + 59, skipEndMin: 0 }),
		).toBe(1);
	});

	it("counts full days in constant time", () => {
		const threeDays = Date.UTC(2023, 0, 4) - 1;
		expect(total(t0, threeDays)).toBe(3 * 86_400_000);
		expect(total(t0, threeDays, { skipTimeEnabled: true, skipStartMin: 0, skipEndMin: 0 })).toBe(
			3 * (86_400_000 - 60_000),
		);
	});

	it("counts a rough window in full, then jumps, and does not clamp the last window", () => {
		expect(total(t0, t0, { useRoughScan: true, scanDurationSec: 1, scanStepMin: 1 })).toBe(1001);
		expect(total(t0, t0 + 60_000, { useRoughScan: true, scanDurationSec: 1, scanStepMin: 1 })).toBe(
			2002,
		);
		expect(
			total(t0 + 60_000, t0, { useRoughScan: true, scanDurationSec: 1, scanStepMin: 1 }),
		).toBe(2002);
		expect(
			total(t0, t0, {
				useRoughScan: true,
				scanDurationSec: 60,
				skipTimeEnabled: true,
				skipStartMin: 1,
				skipEndMin: 1,
			}),
		).toBe(60_001);
	});

	it("treats a skipped rough start as a jump with nothing to send", () => {
		expect(
			total(t0, t0, { useRoughScan: true, skipTimeEnabled: true, skipStartMin: 0, skipEndMin: 0 }),
		).toBe(0);
	});

	it("rejects endpoints that cannot start a scan", () => {
		expect(total(t0, t0, { startPanoId: "nope" })).toBeNull();
		expect(traverseProbeTotal({
			startPanoId: pidAt(t0, "01"),
			endPanoId: pidAt(t0, "02"),
			useRoughScan: false,
			scanStepMin: 1,
			scanDurationSec: 1,
			skipTimeEnabled: false,
			skipStartMin: 0,
			skipEndMin: 0,
		})).toBeNull();
	});
});
