import { describe, it, expect } from "vitest";
import type { TencentNeighbor } from "@/lib/sv/tencent/api";
import { offsetLatLng } from "@/lib/sv/baidu/api";
import { buildTargetOverlay } from "@/lib/sv/tencent/officialMeta";

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

describe("tencent officialMeta", () => {
	it("buildTargetOverlay covers every row — no click-to-go gap defaults to an arbitrary neighbor", () => {
		const origin = { lat: 22.54, lng: 114.06, heading: 0 };
		const forward = offsetLatLng(origin.lat, origin.lng, 0, 300);
		const backward = offsetLatLng(origin.lat, origin.lng, 180, 300);
		const neighbors: TencentNeighbor[] = [
			{ svid: "forward", lng: forward.lng, lat: forward.lat, heading: 0 },
			{ svid: "backward", lng: backward.lng, lat: backward.lat, heading: 180 },
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

	it("buildTargetOverlay returns null when there are no candidates", () => {
		expect(
			buildTargetOverlay([], { lat: 0, lng: 0, heading: 0 }),
		).toBeNull();
	});
});
