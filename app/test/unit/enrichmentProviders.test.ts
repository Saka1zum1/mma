import { describe, it, expect, beforeEach } from "vitest";
import {
	registerEnrichmentProvider,
	getEnrichmentProviders,
	getTriggeredProviders,
	registerEnrichFields,
	getEnrichFieldOptions,
	getAllEnrichKeys,
	getDefaultEnrichKeys,
	isFieldEnabled,
	filterEnrichPatch,
} from "@/lib/data/fieldDefs.add";
import { getFieldDef, resetForMapChange } from "@/lib/data/fieldDefRegistry";

// The providers array is module-level and accumulates, so tests see
// providers from prior registrations. We test behavior, not count.

describe("registerEnrichmentProvider", () => {
	it("registers a provider that appears in getEnrichmentProviders", () => {
		const provider = {
			id: "test-provider-" + Math.random(),
			enrich: async () => new Map(),
			fieldDefs: { testField: { type: "number" as const, label: "Test" } },
		};
		registerEnrichmentProvider(provider);
		expect(getEnrichmentProviders()).toContain(provider);
	});

	it("does not register duplicate providers", () => {
		const id = "dedup-test-" + Math.random();
		const p1 = { id, enrich: async () => new Map(), fieldDefs: {} };
		const p2 = { id, enrich: async () => new Map(), fieldDefs: {} };
		registerEnrichmentProvider(p1);
		registerEnrichmentProvider(p2);
		expect(getEnrichmentProviders().filter((p) => p.id === id)).toHaveLength(1);
	});

	it("registers plugin fieldDefs into the registry", () => {
		const id = "registry-test-" + Math.random();
		const key = "registryTestField_" + Math.random().toString(36).slice(2);
		registerEnrichmentProvider({
			id,
			enrich: async () => new Map(),
			fieldDefs: { [key]: { type: "number" as const, label: "Registered" } },
		});
		expect(getFieldDef(key)).toBeDefined();
		expect(getFieldDef(key)!.label).toBe("Registered");
	});
});

describe("getTriggeredProviders", () => {
	it("returns providers whose requires match patched keys", () => {
		const id = "trigger-test-" + Math.random();
		const provider = {
			id,
			enrich: async () => new Map(),
			fieldDefs: {},
			requires: ["datetime"],
		};
		registerEnrichmentProvider(provider);
		const triggered = getTriggeredProviders(["datetime"]);
		expect(triggered).toContain(provider);
	});

	it("does not trigger providers without requires", () => {
		const id = "no-requires-" + Math.random();
		const provider = {
			id,
			enrich: async () => new Map(),
			fieldDefs: {},
		};
		registerEnrichmentProvider(provider);
		const triggered = getTriggeredProviders(["datetime"]);
		expect(triggered).not.toContain(provider);
	});

	it("does not trigger when patched keys do not match requires", () => {
		const id = "no-match-" + Math.random();
		const provider = {
			id,
			enrich: async () => new Map(),
			fieldDefs: {},
			requires: ["datetime"],
		};
		registerEnrichmentProvider(provider);
		const triggered = getTriggeredProviders(["countryCode", "altitude"]);
		expect(triggered).not.toContain(provider);
	});

	it("triggers when any required key is in the patch", () => {
		const id = "partial-match-" + Math.random();
		const provider = {
			id,
			enrich: async () => new Map(),
			fieldDefs: {},
			requires: ["datetime", "timezone"],
		};
		registerEnrichmentProvider(provider);
		const triggered = getTriggeredProviders(["timezone"]);
		expect(triggered).toContain(provider);
	});

	it("returns empty array when no providers match", () => {
		const triggered = getTriggeredProviders(["fieldThatNothingRequires_" + Math.random()]);
		expect(triggered).toHaveLength(0);
	});
});

describe("registerEnrichFields", () => {
	it("adds field options for the enrichment settings UI", () => {
		const key = "enrichTest_" + Math.random().toString(36).slice(2);
		registerEnrichFields([{ key, label: "Test enrichment field" }]);
		const options = getEnrichFieldOptions();
		expect(options.some((o) => o.key === key)).toBe(true);
	});

	it("does not add duplicate field options", () => {
		const key = "enrichDedup_" + Math.random().toString(36).slice(2);
		registerEnrichFields([{ key, label: "A" }]);
		registerEnrichFields([{ key, label: "B" }]);
		expect(getEnrichFieldOptions().filter((o) => o.key === key)).toHaveLength(1);
	});

	it("includes core fields by default", () => {
		const options = getEnrichFieldOptions();
		expect(options.some((o) => o.key === "altitude")).toBe(true);
		expect(options.some((o) => o.key === "countryCode")).toBe(true);
		expect(options.some((o) => o.key === "datetime")).toBe(true);
	});

	it("excludes defaultOff fields from the default set but keeps them selectable", () => {
		expect(getAllEnrichKeys()).toContain("drivingDirection");
		expect(getDefaultEnrichKeys()).not.toContain("drivingDirection");
		// non-defaultOff core fields remain in the default set
		expect(getDefaultEnrichKeys()).toContain("altitude");
	});
});

describe("filterEnrichPatch", () => {
	it("returns full patch when enrichFields is null", () => {
		const patch = { altitude: 100, countryCode: "US" };
		expect(filterEnrichPatch(patch, null)).toEqual(patch);
	});

	it("filters to only enabled fields", () => {
		const patch = { altitude: 100, countryCode: "US", cameraType: "gen4" };
		expect(filterEnrichPatch(patch, ["altitude", "cameraType"])).toEqual({
			altitude: 100,
			cameraType: "gen4",
		});
	});

	it("returns empty when no fields match", () => {
		const patch = { altitude: 100 };
		expect(filterEnrichPatch(patch, ["countryCode"])).toEqual({});
	});
});
