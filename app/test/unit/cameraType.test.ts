import { describe, it, expect } from "vitest";
import { detectCameraType, cameraTypeFromHeight } from "@/lib/sv/svMeta";

type SvData = google.maps.StreetViewResolvedPanoramaData;

function makeData(opts: {
	height: number;
	imageDate?: string;
	countryCode?: string | null;
	levelId?: string | null;
	lat?: number;
	source?: string | null;
}): SvData {
	const { height, imageDate, countryCode = null, levelId = null, lat = 0, source = null } = opts;
	return {
		tiles: { worldSize: { width: 0, height } },
		imageDate,
		location: { latLng: { lat: () => lat, lng: () => 0 } },
		extra: { countryCode, _levelId: levelId, _source: source },
	} as unknown as SvData;
}

describe("cameraTypeFromHeight", () => {
	it("maps tile world heights to generations", () => {
		expect(cameraTypeFromHeight(1664)).toBe("gen1");
		expect(cameraTypeFromHeight(6656)).toBe("gen2");
		expect(cameraTypeFromHeight(8192)).toBe("gen4");
		expect(cameraTypeFromHeight(999)).toBe(null);
	});
});

describe("detectCameraType", () => {
	it("returns gen1/gen4 directly from height", () => {
		expect(detectCameraType(makeData({ height: 1664 }))).toBe("gen1");
		expect(detectCameraType(makeData({ height: 8192 }))).toBe("gen4");
	});

	it("gen2-height pano with no badcam/tripod signals is gen2", () => {
		expect(detectCameraType(makeData({ height: 6656, imageDate: "2024-05" }))).toBe("gen2");
	});

	it("gen2-height pano with _levelId is tripod", () => {
		expect(detectCameraType(makeData({ height: 6656, levelId: "L1" }))).toBe("tripod");
	});

	it("classifies a badcam-country pano past its threshold as badcam", () => {
		// India threshold: after 2021-10
		expect(
			detectCameraType(makeData({ height: 6656, countryCode: "IN", imageDate: "2022-01" })),
		).toBe("badcam");
	});

	it("does not mark a badcam-country pano before its threshold", () => {
		expect(
			detectCameraType(makeData({ height: 6656, countryCode: "IN", imageDate: "2020-01" })),
		).toBe("gen2");
	});

	it("badcam takes priority over tripod when both apply", () => {
		// Tripod (_levelId) AND in a badcam country past threshold -> returns badcam.
		expect(
			detectCameraType(
				makeData({ height: 6656, countryCode: "IN", imageDate: "2022-01", levelId: "L1" }),
			),
		).toBe("badcam");
	});

	it("scout source refines plain gen2/gen4 to trekker", () => {
		expect(detectCameraType(makeData({ height: 8192, source: "scout" }))).toBe("trekker");
		expect(detectCameraType(makeData({ height: 6656, source: "scout" }))).toBe("trekker");
	});

	it("scout does not override badcam, tripod, or gen1", () => {
		// Indoor tripods are also scout-sourced (e.g. museum floors)
		expect(detectCameraType(makeData({ height: 6656, levelId: "L1", source: "scout" }))).toBe(
			"tripod",
		);
		expect(
			detectCameraType(
				makeData({ height: 6656, countryCode: "IN", imageDate: "2022-01", source: "scout" }),
			),
		).toBe("badcam");
		expect(detectCameraType(makeData({ height: 1664, source: "scout" }))).toBe("gen1");
	});

	it("launch source keeps height-based classification", () => {
		expect(detectCameraType(makeData({ height: 8192, source: "launch" }))).toBe("gen4");
	});

	it("US badcam only above latitude 52", () => {
		const past = { height: 6656, countryCode: "US", imageDate: "2020-01" } as const;
		expect(detectCameraType(makeData({ ...past, lat: 60 }))).toBe("badcam");
		expect(detectCameraType(makeData({ ...past, lat: 40 }))).toBe("gen2");
	});
});

// Exclusive on the month named. Was a UTC-vs-local Date comparison; TZ is pinned to +05:30
// so a reintroduced Date fails here rather than passing on UTC CI.
describe("badcam threshold boundary", () => {
	const bd = (imageDate: string) =>
		detectCameraType(makeData({ height: 6656, imageDate, countryCode: "BD" }));

	it("excludes the threshold month itself", () => {
		expect(bd("2021-04")).toBe("gen2");
	});

	it("includes months after the threshold", () => {
		expect(bd("2021-05")).toBe("badcam");
		expect(bd("2022-01")).toBe("badcam");
	});

	it("excludes months before the threshold", () => {
		expect(bd("2021-03")).toBe("gen2");
		expect(bd("2020-12")).toBe("gen2");
	});
});
