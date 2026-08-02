import { describe, it, expect } from "vitest";
import {
	samplePath,
	interpolateLatLng,
	bearingDegrees,
	pathLengthMeters,
	destinationPoint,
} from "@/plugins/hyperlapse/route/RouteGenerator";
import { orderByDrivingDirection } from "@/plugins/hyperlapse/route/SequenceBuilder";
import { PovController, resolveFrameLook } from "@/plugins/hyperlapse/pov";
import type { LatLng } from "@/types";
import { distMeters } from "@/lib/geo/geo";
import { createLocation } from "@/types";

function nearly(a: number, b: number, eps = 1e-4) {
	expect(Math.abs(a - b)).toBeLessThan(eps);
}

describe("interpolateLatLng", () => {
	it("returns endpoints at t=0 and t=1", () => {
		const a = { lat: 37.8, lng: -122.48 };
		const b = { lat: 37.81, lng: -122.47 };
		expect(interpolateLatLng(a, b, 0)).toEqual(a);
		expect(interpolateLatLng(a, b, 1)).toEqual(b);
	});

	it("midpoint is roughly halfway by distance", () => {
		const a = { lat: 0, lng: 0 };
		const b = { lat: 0, lng: 1 };
		const mid = interpolateLatLng(a, b, 0.5);
		nearly(distMeters(a, mid), distMeters(mid, b), 1);
	});
});

describe("bearingDegrees", () => {
	it("due north is ~0", () => {
		nearly(bearingDegrees({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }), 0, 0.5);
	});

	it("due east is ~90", () => {
		nearly(bearingDegrees({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }), 90, 0.5);
	});
});

describe("samplePath", () => {
	it("samples a straight line at roughly equal spacing", () => {
		const start = { lat: 37.8, lng: -122.48 };
		const end = destinationPoint(start, 90, 200);
		const samples = samplePath([start, end], { distanceBetweenPoints: 20, maxPoints: 50 });
		expect(samples.length).toBeGreaterThan(5);
		expect(distMeters(samples[0], start)).toBeLessThan(1);
		expect(distMeters(samples[samples.length - 1], end)).toBeLessThan(1);
	});

	it("respects maxPoints on a long path", () => {
		const start = { lat: 37.8, lng: -122.48 };
		const end = destinationPoint(start, 0, 5000);
		const samples = samplePath([start, end], { distanceBetweenPoints: 5, maxPoints: 20 });
		expect(samples.length).toBeLessThanOrEqual(20);
	});
});

describe("pathLengthMeters", () => {
	it("sums segment lengths", () => {
		const path: LatLng[] = [
			{ lat: 0, lng: 0 },
			{ lat: 0, lng: 0.01 },
			{ lat: 0.01, lng: 0.01 },
		];
		const total = pathLengthMeters(path);
		nearly(total, distMeters(path[0], path[1]) + distMeters(path[1], path[2]), 0.1);
	});
});

describe("orderByDrivingDirection", () => {
	it("returns a chain covering all locations", () => {
		const locs = [
			createLocation({
				lat: 31.2,
				lng: 121.5,
				heading: 90,
				panoId: "a",
				extra: { drivingDirection: 90 },
			}),
			createLocation({
				lat: 31.2,
				lng: 121.5005,
				heading: 90,
				panoId: "b",
				extra: { drivingDirection: 90 },
			}),
			createLocation({
				lat: 31.2,
				lng: 121.501,
				heading: 90,
				panoId: "c",
				extra: { drivingDirection: 90 },
			}),
		];
		const ordered = orderByDrivingDirection([locs[2], locs[0], locs[1]]);
		expect(ordered).toHaveLength(3);
		expect(new Set(ordered.map((l) => l.panoId))).toEqual(new Set(["a", "b", "c"]));
		expect(ordered[0].lng).toBeLessThan(ordered[ordered.length - 1].lng);
	});

	it("handles single location", () => {
		const loc = createLocation({ lat: 1, lng: 2, panoId: "x" });
		expect(orderByDrivingDirection([loc])).toEqual([loc]);
	});

	it("orients chain so playback moves with driving direction", () => {
		const locs = [
			createLocation({
				lat: 31.2,
				lng: 121.501,
				heading: 270,
				panoId: "c",
				extra: { drivingDirection: 270 },
			}),
			createLocation({
				lat: 31.2,
				lng: 121.5005,
				heading: 270,
				panoId: "b",
				extra: { drivingDirection: 270 },
			}),
			createLocation({
				lat: 31.2,
				lng: 121.5,
				heading: 270,
				panoId: "a",
				extra: { drivingDirection: 270 },
			}),
		];
		const ordered = orderByDrivingDirection(locs);
		expect(ordered.map((l) => l.panoId)).toEqual(["c", "b", "a"]);
	});
});

describe("PovController", () => {
	const frame = {
		lat: 0,
		lng: 0,
		heading: 45,
		drivingDirection: 45,
		textureCenterHeading: 45,
		pitch: 10,
	};

	it("drive mode looks along driving direction (texture-relative)", () => {
		const pov = new PovController();
		pov.applyConfig({
			lookMode: "drive",
			lookAt: null,
			fixedHeading: 0,
			useFixedPitch: false,
			fixedPitch: 0,
		});
		expect(pov.resolveBase(frame)).toEqual({ heading: 0, pitch: 10 });
	});

	it("drive mode offsets when texture center differs from driving direction", () => {
		const pov = new PovController();
		pov.applyConfig({
			lookMode: "drive",
			lookAt: null,
			fixedHeading: 0,
			useFixedPitch: false,
			fixedPitch: 0,
		});
		expect(
			pov.resolveBase({
				...frame,
				drivingDirection: 90,
				textureCenterHeading: 0,
				heading: 90,
			}),
		).toEqual({ heading: 90, pitch: 10 });
	});

	it("free mode uses texture-forward heading", () => {
		expect(
			resolveFrameLook(frame, {
				lookMode: "free",
				lookAt: null,
				fixedHeading: 90,
				useFixedPitch: false,
				fixedPitch: 0,
			}),
		).toEqual({ heading: 0, pitch: 10 });
	});

	it("lookAt overrides heading and locks heading drag", () => {
		const pov = new PovController();
		pov.applyConfig({
			lookMode: "lookAt",
			lookAt: { lat: 0, lng: 1 },
			fixedHeading: 0,
			useFixedPitch: false,
			fixedPitch: 0,
		});
		nearly(pov.resolveBase(frame).heading, 45, 0.5);
		expect(pov.canDragHeading()).toBe(false);
	});

	it("interactive offsets stack on base look", () => {
		const pov = new PovController();
		pov.applyConfig({
			lookMode: "drive",
			lookAt: null,
			fixedHeading: 0,
			useFixedPitch: false,
			fixedPitch: 0,
		});
		pov.headingOffset = 10;
		pov.pitchOffset = -5;
		expect(pov.resolve(frame)).toEqual({ heading: 10, pitch: 5 });
	});
});
