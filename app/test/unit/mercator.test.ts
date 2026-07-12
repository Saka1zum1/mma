import { describe, it, expect } from "vitest";
import { latLngToWorld, worldToLatLng, worldToTile, pixelToLatLng } from "@/lib/geo/mercator";

describe("mercator world projection (Google 256px world)", () => {
	it("maps the origin to the world center", () => {
		expect(latLngToWorld({ lat: 0, lng: 0 })).toEqual({ x: 128, y: 128 });
	});

	it("maps the antimeridian to the world edges", () => {
		expect(latLngToWorld({ lat: 0, lng: -180 }).x).toBe(0);
		expect(latLngToWorld({ lat: 0, lng: 180 }).x).toBe(256);
	});

	it("round-trips arbitrary points", () => {
		for (const p of [
			{ lat: 48.8566, lng: 2.3522 },
			{ lat: -33.8688, lng: 151.2093 },
			{ lat: 64.1466, lng: -21.9426 },
			{ lat: -54.8019, lng: -68.303 },
		]) {
			const w = latLngToWorld(p);
			const back = worldToLatLng(w.x, w.y);
			expect(back.lat).toBeCloseTo(p.lat, 6);
			expect(back.lng).toBeCloseTo(p.lng, 6);
		}
	});
});

describe("worldToTile", () => {
	it("returns integer tile coordinates", () => {
		const t = worldToTile(128, 128, 17);
		expect(Number.isInteger(t.x)).toBe(true);
		expect(Number.isInteger(t.y)).toBe(true);
	});

	it("origin maps to tile 0,0 area", () => {
		const t = worldToTile(0.001, 0.001, 17);
		expect(t.x).toBe(0);
		expect(t.y).toBe(0);
	});

	it("scales with zoom", () => {
		const low = worldToTile(200, 200, 0);
		const high = worldToTile(200, 200, 10);
		expect(high.x).toBeGreaterThan(low.x);
	});
});

describe("pixelToLatLng", () => {
	it("inverts latLngToWorld scaled by zoom", () => {
		const zoom = 10;
		const scale = 2 ** zoom;
		const p = { lat: 40.7128, lng: -74.006 };
		const w = latLngToWorld(p);
		const back = pixelToLatLng(w.x * scale, w.y * scale, zoom);
		expect(back.lat).toBeCloseTo(p.lat, 6);
		expect(back.lng).toBeCloseTo(p.lng, 6);
	});
});
