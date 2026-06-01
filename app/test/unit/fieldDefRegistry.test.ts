import { describe, it, expect, beforeEach } from "vitest";
import {
	getFieldDef,
	getAllFieldDefs,
	registerPluginFieldDefs,
	setUserFieldDefs,
	mergeUserFieldDefs,
	resetForMapChange,
} from "@/lib/data/fieldDefRegistry";

beforeEach(() => {
	resetForMapChange();
});

// Core field defs live in Rust (`known_field_def`) and reach the registry only via
// the user layer (persisted into a map's `extra.fields`). The JS registry itself has
// no hardcoded core layer — it resolves user > plugin only.

describe("lookup", () => {
	it("returns undefined for keys with no def in any layer", () => {
		expect(getFieldDef("plumbus")).toBeUndefined();
		expect(getFieldDef("altitude")).toBeUndefined();
	});
});

describe("plugin defs", () => {
	it("registers and retrieves plugin field defs", () => {
		registerPluginFieldDefs({
			sunAzimuth: { type: "number", label: "Sun azimuth" },
		});
		const def = getFieldDef("sunAzimuth");
		expect(def).toBeDefined();
		expect(def!.label).toBe("Sun azimuth");
	});

	it("plugin defs survive resetForMapChange", () => {
		registerPluginFieldDefs({
			sunAzimuth: { type: "number", label: "Sun azimuth" },
		});
		resetForMapChange();
		expect(getFieldDef("sunAzimuth")).toBeDefined();
	});
});

describe("user defs (highest priority)", () => {
	it("overrides plugin defs", () => {
		registerPluginFieldDefs({
			sunAzimuth: { type: "number", label: "Sun azimuth" },
		});
		setUserFieldDefs({
			sunAzimuth: { type: "number", label: "My custom label" },
		});
		expect(getFieldDef("sunAzimuth")!.label).toBe("My custom label");
	});

	it("cleared by resetForMapChange", () => {
		const key = "userOnly_" + Math.random().toString(36).slice(2);
		setUserFieldDefs({
			[key]: { type: "number", label: "Custom" },
		});
		expect(getFieldDef(key)!.label).toBe("Custom");
		resetForMapChange();
		expect(getFieldDef(key)).toBeUndefined();
	});
});

describe("getAllFieldDefs", () => {
	it("merges user and plugin layers", () => {
		registerPluginFieldDefs({
			sunAzimuth: { type: "number", label: "Sun azimuth" },
		});
		setUserFieldDefs({
			altitude: { type: "number", label: "Custom alt" },
			userField: { type: "string", label: "Custom" },
		});
		const all = getAllFieldDefs();
		expect(all.altitude.label).toBe("Custom alt");
		expect(all.sunAzimuth.label).toBe("Sun azimuth");
		expect(all.userField.label).toBe("Custom");
	});

	it("drops user defs after resetForMapChange", () => {
		setUserFieldDefs({ onlyUser: { type: "string", label: "User" } });
		expect(getAllFieldDefs().onlyUser).toBeDefined();
		resetForMapChange();
		expect(getAllFieldDefs().onlyUser).toBeUndefined();
	});
});

describe("priority order", () => {
	it("user > plugin", () => {
		registerPluginFieldDefs({
			altitude: { type: "number", label: "Plugin alt" },
		});
		expect(getFieldDef("altitude")!.label).toBe("Plugin alt");

		setUserFieldDefs({
			altitude: { type: "number", label: "User alt" },
		});
		expect(getFieldDef("altitude")!.label).toBe("User alt");

		resetForMapChange();
		expect(getFieldDef("altitude")!.label).toBe("Plugin alt");
	});
});

describe("mergeUserFieldDefs (auto-register merge)", () => {
	it("adds new defs to the live user layer", () => {
		mergeUserFieldDefs({ plumbus: { type: "number", label: "Plumbus" } });
		expect(getFieldDef("plumbus")!.type).toBe("number");
	});

	it("does not clobber an existing user def -- existing wins", () => {
		setUserFieldDefs({ plumbus: { type: "string", label: "User edited" } });
		// A later auto-registered def for the same key must NOT overwrite the user's edit.
		mergeUserFieldDefs({ plumbus: { type: "number", label: "Inferred" } });
		expect(getFieldDef("plumbus")!.type).toBe("string");
		expect(getFieldDef("plumbus")!.label).toBe("User edited");
	});

	it("keeps existing defs while merging in new keys", () => {
		setUserFieldDefs({ existing: { type: "string", label: "Existing" } });
		mergeUserFieldDefs({ fresh: { type: "number", label: "Fresh" } });
		expect(getFieldDef("existing")!.label).toBe("Existing");
		expect(getFieldDef("fresh")!.label).toBe("Fresh");
	});
});
