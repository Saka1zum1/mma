import type { GeneratedLocation, GeneratorSettings, StreetViewProvider } from "./types";

const POLYGON_NAME_KEYS = [
	"name",
	"NAME",
	"NAME_1",
	"NAMELSAD",
	"NAMELSAD10",
	"city",
	"CITY",
	"county",
	"COUNTY",
	"COUNTY_STATE_CODE",
	"COUNTY_STATE_NAME",
	"PRNAME",
	"prov_name_en",
	"state",
	"STATE",
	"country",
	"COUNTRY",
	"id",
	"ID",
] as const;

/** various-map-gen `getPolygonName`. The fallback is the tag value, not a translated label. */
export function polygonTagName(properties: Record<string, unknown> | null | undefined): string {
	const props = properties ?? {};
	for (const key of POLYGON_NAME_KEYS) {
		const value = props[key];
		if (typeof value === "string" && value) return value;
		if (typeof value === "number") return String(value);
	}
	return "Untitled Polygon";
}

/** Country tag is the English name, matching various-map-gen's default locale. */
function englishCountry(code: string): string {
	try {
		return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) || code;
	} catch {
		return code;
	}
}

/** various-map-gen stores the provider as `{source}_pano`, with Tencent as `qq`. */
export function providerSourceTag(provider: StreetViewProvider): string {
	return `${provider === "tencent" ? "qq" : provider}_pano`;
}

/** Tags various-map-gen writes when auto tagging is on. Empty values are skipped. */
export function autoTagNames(loc: GeneratedLocation, settings: GeneratorSettings | null): string[] {
	const tags = settings?.tags;
	if (!tags?.enabled) return [];
	const names: string[] = [];
	if (tags.provider && loc.provider) names.push(providerSourceTag(loc.provider));
	if (tags.panoId && loc.provider === "baidu" && loc.panoId && loc.panoId.length >= 2) names.push(loc.panoId.slice(-2));
	if (tags.year && loc.imageDate && loc.imageDate.length >= 4) names.push(loc.imageDate.slice(0, 4));
	if (tags.month && loc.imageDate && loc.imageDate.length >= 7) names.push(loc.imageDate.slice(2, 7));
	if (tags.polygon && loc.polygonName) names.push(loc.polygonName);
	if (tags.country && loc.country) names.push(englishCountry(loc.country));
	if (tags.countryCode && loc.country) names.push(loc.country);
	if (tags.region && loc.region) names.push(loc.region);
	if (tags.road && loc.road) names.push(loc.road);
	if (tags.updateType && loc.updateType) names.push(loc.updateType);
	if (tags.procdate && loc.procdate) names.push(loc.procdate);
	return names.map((name) => name.trim()).filter(Boolean);
}
