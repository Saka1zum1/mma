import { describe, it, expect } from "vitest";
import { boundsOfCoords, hostKindForMapType } from "@/lib/map/host";

describe("boundsOfCoords", () => {
	it("returns the axis-aligned bounds", () => {
		expect(
			boundsOfCoords([
				{ lat: 1, lng: 2 },
				{ lat: -3, lng: 10 },
				{ lat: 5, lng: -4 },
			]),
		).toEqual({ west: -4, south: -3, east: 10, north: 5 });
	});

	it("returns null for no coords", () => {
		expect(boundsOfCoords([])).toBeNull();
	});
});

describe("hostKindForMapType", () => {
	it("routes vector to maplibre, everything else to google", () => {
		expect(hostKindForMapType("vector")).toBe("maplibre");
		expect(hostKindForMapType("map")).toBe("google");
		expect(hostKindForMapType("satellite")).toBe("google");
		expect(hostKindForMapType("osm")).toBe("google");
	});
});
