import { describe, expect, it } from "vitest";
import {
	derivedFrom,
	withoutDerivedFrom,
	registerEnrichmentProvider,
} from "@/lib/data/fieldDefs";

const noop = async () => new Map<number, Record<string, unknown>>();

describe("derivedFrom", () => {
	const suffix = Math.random();
	registerEnrichmentProvider({
		id: `meta-${suffix}`,
		enrich: noop,
		requires: ["panoId"],
		fieldDefs: { [`imageDate${suffix}`]: { type: "string", label: "Image date" } },
	});
	registerEnrichmentProvider({
		id: `exact-${suffix}`,
		enrich: noop,
		requires: [`imageDate${suffix}`],
		fieldDefs: { [`datetime${suffix}`]: { type: "string", label: "Exact date" } },
	});
	registerEnrichmentProvider({
		id: `sun-${suffix}`,
		enrich: noop,
		requires: [`datetime${suffix}`],
		fieldDefs: { [`sunAzimuth${suffix}`]: { type: "number", label: "Sun" } },
	});
	registerEnrichmentProvider({
		id: `tagsOnly-${suffix}`,
		enrich: noop,
		requires: ["tags"],
		fieldDefs: { [`tagged${suffix}`]: { type: "string", label: "Tagged" } },
	});

	it("follows requires transitively and leaves unrelated fields alone", () => {
		const stale = derivedFrom(["panoId"]);
		expect(stale.has(`imageDate${suffix}`)).toBe(true);
		expect(stale.has(`datetime${suffix}`)).toBe(true);
		expect(stale.has(`sunAzimuth${suffix}`)).toBe(true);
		expect(stale.has(`tagged${suffix}`)).toBe(false);
	});

	it("starts wherever the change is", () => {
		const stale = derivedFrom([`datetime${suffix}`]);
		expect(stale.has(`sunAzimuth${suffix}`)).toBe(true);
		expect(stale.has(`imageDate${suffix}`)).toBe(false);
	});

	it("strips exactly the stale keys from extra", () => {
		const extra = { [`imageDate${suffix}`]: "2020-01", [`tagged${suffix}`]: "x", custom: 1 };
		expect(withoutDerivedFrom(extra, ["panoId"])).toEqual({ [`tagged${suffix}`]: "x", custom: 1 });
		expect(withoutDerivedFrom(extra, ["heading"])).toEqual(extra);
		expect(withoutDerivedFrom(null, ["panoId"])).toBeNull();
	});
});
