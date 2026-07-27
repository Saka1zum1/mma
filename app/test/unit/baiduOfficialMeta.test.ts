import { describe, it, expect } from "vitest";
import type { BaiduLink, BaiduPanoMeta } from "@/lib/sv/baidu/api";
import { offsetLatLng } from "@/lib/sv/baidu/api";
import {
	baiduIdsFromGetMetadataRequest,
	buildBaiduImageMetadata,
	buildGetMetadataResponse,
	buildSingleImageSearchOk,
	buildTargetOverlay,
	latLngFromSingleImageSearchRequest,
} from "@/lib/sv/baidu/officialMeta";

const OVERLAY_WIDTH = 32;
const OVERLAY_HEIGHT = 16;

/** Decode the double-base64 target overlay bitmap into raw index bytes. */
function decodeOverlay(overlays: unknown[]): Uint8Array {
	const targetOverlay = overlays[3] as unknown[];
	const data = targetOverlay[2] as string;
	const inner = atob(data);
	const binary = atob(inner);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

const sample: BaiduPanoMeta = {
	id: "abc123",
	lng: 116.4,
	lat: 39.9,
	heading: 90,
	pitch: 0,
	roll: 0,
	date: "20240115",
	altitude: 12.5,
	roadName: "Test Rd",
	links: [
		{ pid: "link1", lng: 116.401, lat: 39.9, heading: 45 },
		{ pid: "link2", lng: 116.399, lat: 39.9, heading: 225 },
	],
	neighbors: [
		{ pid: "link1", lng: 116.401, lat: 39.9, heading: 45 },
		{ pid: "link2", lng: 116.399, lat: 39.9, heading: 225 },
		{ pid: "far1", lng: 116.405, lat: 39.902, heading: 60 },
	],
	timeline: [{ id: "hist1", year: 2020, month: 6, isCurrent: false }],
};

describe("baidu officialMeta", () => {
	it("builds official ImageMetadata with BAIDU: keys, neighbors, links, overlays", () => {
		const meta = buildBaiduImageMetadata(sample);
		expect(meta[0]).toEqual([1]);
		expect(meta[1]).toEqual([2, "BAIDU:abc123"]);
		const tiles = meta[2] as unknown[];
		expect(tiles[0]).toBe(2);
		expect(tiles[1]).toBe(2);
		expect(tiles[9]).toBe("BAIDU:abc123");
		const loc = (meta[5] as unknown[])[0] as unknown[];
		// Main location POV is heading-only (no pitch/roll — those tilt the sphere).
		const mainPov = (loc[1] as unknown[])[2] as unknown[];
		expect(mainPov).toEqual([90]);
		const panoramas = (loc[3] as unknown[])[0] as unknown[];
		// 3 neighbors + 1 timeline (links reuse neighbor slots)
		expect(panoramas.length).toBe(4);
		const links = loc[6] as unknown[];
		expect(links.length).toBe(2);
		expect((panoramas[0] as unknown[])[0]).toEqual([2, "BAIDU:link1"]);
		expect((panoramas[2] as unknown[])[0]).toEqual([2, "BAIDU:far1"]);

		const overlays = loc[5] as unknown[];
		expect(overlays).toBeTruthy();
		const targetFormat = overlays[2] as unknown[];
		expect(targetFormat[0]).toBe(1);
		const targetOverlay = overlays[3] as unknown[];
		expect(targetOverlay[1]).toBe(1);
		expect(typeof targetOverlay[2]).toBe("string");
		expect((targetOverlay[2] as string).length).toBeGreaterThan(0);
	});

	it("buildTargetOverlay maps distance bands to neighbor indices", () => {
		const overlays = buildTargetOverlay(sample.neighbors, {
			lat: sample.lat,
			lng: sample.lng,
			heading: sample.heading,
		});
		expect(overlays).toBeTruthy();
		const data = ((overlays as unknown[])[3] as unknown[])[2] as string;
		// Double-base64 (altproviders): atob once → single base64 of 32×16 bytes
		const inner = atob(data);
		const binary = atob(inner);
		expect(binary.length).toBe(32 * 16);
	});

	it("buildTargetOverlay covers every row — no click-to-go gap defaults to an arbitrary neighbor", () => {
		const origin = { lat: 39.9, lng: 116.4, heading: 0 };
		const forward = offsetLatLng(origin.lat, origin.lng, 0, 300);
		const backward = offsetLatLng(origin.lat, origin.lng, 180, 300);
		const neighbors: BaiduLink[] = [
			{ pid: "forward", lng: forward.lng, lat: forward.lat, heading: 0 },
			{ pid: "backward", lng: backward.lng, lat: backward.lat, heading: 180 },
		];

		const overlays = buildTargetOverlay(neighbors, origin) as unknown[];
		const bytes = decodeOverlay(overlays);

		// Column for "straight ahead" (heading == origin.heading, x == 0.5).
		const col = OVERLAY_WIDTH / 2;
		for (let row = 0; row < OVERLAY_HEIGHT; row += 1) {
			const index = bytes[row * OVERLAY_WIDTH + col];
			// Every row (including rows 0-8: at/above the horizon, where a
			// slightly-upward "keep going forward" click lands) must resolve to
			// the forward neighbor (index 0), never silently fall back to an
			// unrelated/opposite candidate.
			expect(index).toBe(0);
		}

		// Column for "straight behind" (heading == origin.heading + 180).
		const backCol = 0;
		for (let row = 0; row < OVERLAY_HEIGHT; row += 1) {
			const index = bytes[row * OVERLAY_WIDTH + backCol];
			expect(index).toBe(1);
		}
	});

	it("wraps GetMetadata / SIS responses", () => {
		expect(buildGetMetadataResponse([sample])[0]).toEqual([0]);
		expect(buildSingleImageSearchOk(sample)[0]).toEqual([0]);
	});

	it("parses GetMetadata request only when all ids are BAIDU:", () => {
		expect(
			baiduIdsFromGetMetadataRequest([
				[],
				[],
				[[[2, "BAIDU:a"]], [[2, "BAIDU:b"]]],
			]),
		).toEqual(["BAIDU:a", "BAIDU:b"]);
		expect(
			baiduIdsFromGetMetadataRequest([[], [], [[[2, "googlePano"]]]]),
		).toBeNull();
	});

	it("reads SingleImageSearch lat/lng/radius", () => {
		const center: unknown[] = [];
		center[2] = 39.9;
		center[3] = 116.4;
		expect(latLngFromSingleImageSearchRequest([[], [center, 50]])).toEqual({
			lat: 39.9,
			lng: 116.4,
			radius: 50,
		});
	});
});
