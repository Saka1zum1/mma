import { describe, expect, it } from "vitest";
import { baiduCoverageKind, traverseRangeFromMap } from "@/plugins/generator/engine/traverseRange";

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
