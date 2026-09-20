import { describe, it, expect } from "vitest";
import { isPluginUpdatable, needsUpdate, resolveBuild, needsBuildUpdate } from "@/plugins/registry";
import type { PluginManifest } from "@/bindings.gen";

function entry(over: Partial<PluginManifest> = {}): PluginManifest {
	return {
		id: "p",
		name: "P",
		description: "",
		icon: "i",
		main: "index.js",
		version: "1.1.0",
		...over,
	};
}

describe("isPluginUpdatable", () => {
	it("flags an update when versions differ", () => {
		expect(isPluginUpdatable("1.0.0", "1.1.0")).toBe(true);
	});

	it("no update when versions match", () => {
		expect(isPluginUpdatable("1.0.0", "1.0.0")).toBe(false);
	});

	it("no update when the installed version is unknown", () => {
		expect(isPluginUpdatable("", "1.0.0")).toBe(false);
		expect(isPluginUpdatable(undefined, "1.0.0")).toBe(false);
	});

	it("no update when the registry version is unknown", () => {
		expect(isPluginUpdatable("1.0.0", "")).toBe(false);
		expect(isPluginUpdatable("1.0.0", undefined)).toBe(false);
	});

	it("does not flag update when installed semver is newer than registry", () => {
		expect(isPluginUpdatable("1.1.0", "1.0.0")).toBe(false);
	});
});

describe("needsUpdate (sidecar-aware)", () => {
	it("flags a JS version drift regardless of sidecar", () => {
		expect(needsUpdate("1.0.0", "1.1.0", "0.1.0", "0.1.0")).toBe(true);
	});

	it("flags a sidecar drift even when JS versions match", () => {
		expect(needsUpdate("1.0.0", "1.0.0", "0.1.0", "0.2.0")).toBe(true);
	});

	it("flags a missing sidecar (nothing installed yet) as an update", () => {
		expect(needsUpdate("1.0.0", "1.0.0", null, "0.1.0")).toBe(true);
		expect(needsUpdate("1.0.0", "1.0.0", undefined, "0.1.0")).toBe(true);
	});

	it("no update when both JS and sidecar match", () => {
		expect(needsUpdate("1.0.0", "1.0.0", "0.1.0", "0.1.0")).toBe(false);
	});

	it("no update for a plugin without a registry sidecar", () => {
		expect(needsUpdate("1.0.0", "1.0.0", null, undefined)).toBe(false);
	});
});

describe("resolveBuild", () => {
	it("returns the catalog build when the app meets minAppVersion", () => {
		expect(resolveBuild(entry({ minAppVersion: "0.9.0" }), "0.10.0")).toEqual({
			version: "1.1.0",
			ref: null,
			minAppVersion: "0.9.0",
		});
	});

	it("returns null when the catalog build needs a newer app", () => {
		expect(resolveBuild(entry({ minAppVersion: "0.11.0" }), "0.10.0")).toBeNull();
	});

	it("treats a missing minimum as compatible", () => {
		expect(resolveBuild(entry(), "0.10.0")?.version).toBe("1.1.0");
	});
});

describe("needsBuildUpdate", () => {
	const target = { version: "1.1.0", ref: null, minAppVersion: null };

	it("follows needsUpdate when the catalog has no pinned older ref", () => {
		expect(needsBuildUpdate("1.0.0", target, null, undefined)).toBe(true);
		expect(needsBuildUpdate("1.1.0", target, null, undefined)).toBe(false);
	});

	it("repairs a missing sidecar even when the JS version is pinned", () => {
		const pinned = { version: "1.0.0", ref: "abc", minAppVersion: null };
		expect(needsBuildUpdate("1.0.0", pinned, null, "0.1.0")).toBe(true);
		expect(needsBuildUpdate("1.0.0", pinned, "0.1.0", "0.1.0")).toBe(false);
	});
});
