import { describe, expect, it } from "vitest";
import { autoTagNames, polygonTagName, providerSourceTag } from "@/plugins/generator/engine/autoTags";
import { addressRegion, googleCountry } from "@/plugins/generator/engine/panoModel";
import { previousPanoId, updateTypeFromHeight } from "@/plugins/generator/engine/updateType";
import { DEFAULT_SETTINGS, type GeneratedLocation, type GeneratorSettings } from "@/plugins/generator/engine/types";
import type { Pano } from "@/plugins/generator/engine/panoModel";

const OFFICIAL = "A".repeat(21) + "A";
const OLDER = "B".repeat(21) + "A";

function loc(patch: Partial<GeneratedLocation>): GeneratedLocation {
	return {
		panoId: "010000000023010112000000001",
		lat: 0,
		lng: 0,
		heading: 0,
		pitch: 0,
		zoom: 0,
		imageDate: "2024-03",
		...patch,
	};
}

function tagged(patch: Partial<GeneratorSettings["tags"]>): GeneratorSettings {
	return { ...DEFAULT_SETTINGS, tags: { ...DEFAULT_SETTINGS.tags, enabled: true, ...patch } };
}

describe("auto tags", () => {
	it("writes the various-map-gen source id, including Tencent as qq", () => {
		expect(providerSourceTag("google")).toBe("google_pano");
		expect(providerSourceTag("googleZoom")).toBe("googleZoom_pano");
		expect(providerSourceTag("tencent")).toBe("qq_pano");
		expect(providerSourceTag("baidu")).toBe("baidu_pano");
	});

	it("slices year, month, and the Baidu car code, and skips empty fields", () => {
		const names = autoTagNames(
			loc({
				provider: "baidu",
				country: "CN",
				region: "Sichuan",
				road: "Renmin Road",
				polygonName: "Chengdu",
				updateType: "newroad",
				procdate: "2024-03-01",
			}),
			tagged({
				provider: true,
				year: true,
				month: true,
				updateType: true,
				country: true,
				countryCode: true,
				region: true,
				road: true,
				polygon: true,
				panoId: true,
				procdate: true,
			}),
		);
		expect(names).toEqual([
			"baidu_pano",
			"01",
			"2024",
			"24-03",
			"Chengdu",
			"China",
			"CN",
			"Sichuan",
			"Renmin Road",
			"newroad",
			"2024-03-01",
		]);
	});

	it("omits a tag whose value is missing", () => {
		expect(
			autoTagNames(loc({ provider: "google", imageDate: null, country: null }), tagged({ year: true, month: true, country: true, panoId: true })),
		).toEqual([]);
	});

	it("does nothing while auto tagging is off", () => {
		expect(autoTagNames(loc({ provider: "google", country: "US" }), DEFAULT_SETTINGS)).toEqual([]);
	});

	it("reads a GeoJSON name, then falls back to Untitled Polygon", () => {
		expect(polygonTagName({ NAME_1: "Île-de-France" })).toBe("Île-de-France");
		expect(polygonTagName({ id: 12 })).toBe("12");
		expect(polygonTagName(null)).toBe("Untitled Polygon");
	});
});

describe("tag fields", () => {
	it("folds TW, HK, and MO into CN and keeps the last address segment", () => {
		expect(googleCountry("TW")).toBe("CN");
		expect(googleCountry("US")).toBe("US");
		expect(addressRegion("Springfield, Illinois")).toBe("Illinois");
		expect(addressRegion("Illinois")).toBe("Illinois");
		expect(addressRegion("")).toBeNull();
	});

	it("maps the previous capture's tile height onto an update tag", () => {
		expect(updateTypeFromHeight(1664)).toBe("gen1update");
		expect(updateTypeFromHeight(6656)).toBe("gen2or3update");
		expect(updateTypeFromHeight(8192)).toBe("gen4update");
		expect(updateTypeFromHeight(null)).toBe("gen4update");
	});

	it("uses the second-to-last official timeline entry as the previous pano", () => {
		const time = [
			{ panoId: "CIHM" + "C".repeat(18), date: "2018-01" },
			{ panoId: OLDER, date: "2020-01" },
			{ panoId: OFFICIAL, date: "2024-03" },
		];
		const pano = { time } as Pano;
		expect(previousPanoId(pano, true)).toBe(OLDER);
		expect(previousPanoId({ time: [time[2]!] } as Pano, true)).toBeNull();
		const unofficial = "CIHM" + "C".repeat(18);
		expect(previousPanoId({ time: [{ panoId: unofficial, date: "2018-01" }, time[2]!] } as Pano, false)).toBe(unofficial);
		expect(previousPanoId({ time: [{ panoId: unofficial, date: "2018-01" }, time[2]!] } as Pano, true)).toBeNull();
	});
});
