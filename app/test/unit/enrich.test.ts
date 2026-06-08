import { describe, it, expect, vi } from "vitest";

// enrich.add pulls in Tauri/store/SV modules at import; stub the ones buildPatch
// doesn't use so the pure patch logic is testable in a node environment. The real
// filterEnrichPatch (from fieldDefs.add) is kept -- the bug lives in its interaction.
vi.mock("@/store/useMapStore", () => ({
	getCurrentMap: () => null,
	fetchLocationsByIds: async () => [],
	batchUpdateLocations: async () => {},
	patchLocationExtra: async () => {},
}));
vi.mock("@/lib/sv/svMeta", () => ({ fetchSvMetadata: async () => [] }));
vi.mock("@/lib/sv/exactDate", () => ({ resolveExactTimestamp: async () => null }));
vi.mock("@/lib/util/timezone", () => ({ resolveTimezone: () => null }));
vi.mock("@/lib/sv/lookup", () => ({ resolvePanoIds: async () => [] }));

import { buildPatch } from "@/lib/sv/enrich";
import { getDefaultEnrichKeys } from "@/lib/data/fieldDefs";
import { createLocation } from "@/types";
import type { Location } from "@/types";

// Minimal StreetViewPanoramaData stub: only the fields buildPatch reads.
function svData(imageDate: string, extra: Record<string, unknown> = {}): any {
	return {
		imageDate,
		extra: { altitude: 10, countryCode: "US", cameraType: "gen4", panoType: "car", ...extra },
	};
}

function loc(extra: Record<string, unknown>): Location {
	return { ...createLocation({ lat: 1, lng: 2 }), extra };
}

describe("buildPatch — stale datetime/timezone clearing", () => {
	it("clears stale datetime/timezone when imageDate changes, even with datetime enrichment OFF", () => {
		// Default enrich set excludes datetime/timezone (opt-in). The clear must still apply.
		const defaults = getDefaultEnrichKeys();
		expect(defaults).not.toContain("datetime");

		const patch = buildPatch(
			svData("2023-03"),
			loc({ imageDate: "2099-01", datetime: 9999999999, timezone: "Fake/Zone" }),
			defaults,
		)!;

		expect(patch.imageDate).toBe("2023-03");
		expect(patch.datetime).toBeNull();
		expect(patch.timezone).toBeNull();
	});

	it("does NOT add datetime/timezone keys when imageDate is unchanged", () => {
		const patch = buildPatch(
			svData("2099-01"),
			loc({ imageDate: "2099-01", datetime: 9999999999, timezone: "Fake/Zone" }),
			getDefaultEnrichKeys(),
		)!;
		expect("datetime" in patch).toBe(false);
		expect("timezone" in patch).toBe(false);
	});

	it("does NOT clear when there was no stale datetime to begin with", () => {
		const patch = buildPatch(
			svData("2023-03"),
			loc({ imageDate: "2099-01" }), // no datetime
			getDefaultEnrichKeys(),
		)!;
		expect("datetime" in patch).toBe(false);
	});

	it("still respects the filter for normal enrich keys", () => {
		// altitude is in the default set; cameraType too -- both should pass through.
		const patch = buildPatch(svData("2023-03"), loc({ imageDate: "2023-03" }), ["altitude"])!;
		expect(patch.altitude).toBe(10);
		expect("countryCode" in patch).toBe(false); // filtered out
	});
});
