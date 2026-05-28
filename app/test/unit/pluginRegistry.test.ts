// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Plugin } from "@/plugins/registry";
import {
	registerPlugin,
	getPlugin,
	getPlugins,
	unregisterPlugin,
	isPluginEnabled,
	setPluginEnabled,
	getEnabledPlugins,
	activatePlugin,
	activatePlugins,
	deactivatePlugin,
	deactivatePlugins,
	setPendingManifest,
	getRegistrySnapshot,
} from "@/plugins/registry";

function makePlugin(id: string, name: string, activate = vi.fn()): Plugin {
	return { id, name, icon: "test", activate };
}

beforeEach(() => {
	for (const p of getPlugins()) {
		unregisterPlugin(p.id);
		setPluginEnabled(p.id, false);
	}
	deactivatePlugins();
	localStorage.clear();
	setPendingManifest(null);
});

describe("registerPlugin", () => {
	it("registers a plugin retrievable by getPlugin", () => {
		const p = makePlugin("alpha", "Alpha");
		registerPlugin(p);
		expect(getPlugin("alpha")).toBe(p);
	});

	it("merges pendingManifest fields over plugin", () => {
		setPendingManifest({
			id: "ext-1",
			name: "External Plugin",
			description: "From manifest",
			icon: "manifest-icon",
			main: "index.js",
		});
		const activate = vi.fn();
		registerPlugin({ activate });
		const registered = getPlugin("ext-1");
		expect(registered).toBeDefined();
		expect(registered!.id).toBe("ext-1");
		expect(registered!.name).toBe("External Plugin");
		expect(registered!.description).toBe("From manifest");
		expect(registered!.icon).toBe("manifest-icon");
		expect(registered!.activate).toBe(activate);
	});

	it("clears pendingManifest after register", () => {
		setPendingManifest({
			id: "ext-1",
			name: "External",
			description: "",
			icon: "x",
			main: "index.js",
		});
		registerPlugin({ activate: vi.fn() });

		const p = makePlugin("normal", "Normal");
		registerPlugin(p);
		expect(getPlugin("normal")).toBe(p);
		expect(getPlugin("normal")!.id).toBe("normal");
	});
});

describe("getPlugins", () => {
	it("returns plugins sorted by name", () => {
		registerPlugin(makePlugin("c", "Zebra"));
		registerPlugin(makePlugin("a", "Alpha"));
		registerPlugin(makePlugin("b", "Mid"));
		const names = getPlugins().map((p) => p.name);
		expect(names).toEqual(["Alpha", "Mid", "Zebra"]);
	});
});

describe("unregisterPlugin", () => {
	it("removes plugin from registry", () => {
		registerPlugin(makePlugin("rm", "Remove Me"));
		expect(getPlugin("rm")).toBeDefined();
		unregisterPlugin("rm");
		expect(getPlugin("rm")).toBeUndefined();
	});
});

describe("setPluginEnabled / isPluginEnabled", () => {
	it("enables a plugin", () => {
		registerPlugin(makePlugin("e", "E"));
		setPluginEnabled("e", true);
		expect(isPluginEnabled("e")).toBe(true);
	});

	it("disabling removes from enabled set", () => {
		registerPlugin(makePlugin("e", "E"));
		setPluginEnabled("e", true);
		setPluginEnabled("e", false);
		expect(isPluginEnabled("e")).toBe(false);
	});

	it("persists to localStorage", () => {
		registerPlugin(makePlugin("p", "Persist"));
		setPluginEnabled("p", true);
		const stored = JSON.parse(localStorage.getItem("mma_plugins_enabled") || "[]");
		expect(stored).toContain("p");
	});
});

describe("getEnabledPlugins", () => {
	it("returns only enabled and registered plugins", () => {
		const a = makePlugin("a", "A");
		const b = makePlugin("b", "B");
		const c = makePlugin("c", "C");
		registerPlugin(a);
		registerPlugin(b);
		registerPlugin(c);
		setPluginEnabled("a", true);
		setPluginEnabled("c", true);
		const enabled = getEnabledPlugins();
		const ids = enabled.map((p) => p.id);
		expect(ids).toContain("a");
		expect(ids).toContain("c");
		expect(ids).not.toContain("b");
	});
});

describe("activatePlugin", () => {
	it("calls activate and stores cleanup", () => {
		const cleanup = vi.fn();
		const activate = vi.fn(() => cleanup);
		registerPlugin(makePlugin("act", "Act", activate));
		activatePlugin("act");
		expect(activate).toHaveBeenCalledOnce();
		deactivatePlugin("act");
		expect(cleanup).toHaveBeenCalledOnce();
	});

	it("is idempotent - second call does nothing", () => {
		const activate = vi.fn(() => vi.fn());
		registerPlugin(makePlugin("idem", "Idem", activate));
		activatePlugin("idem");
		activatePlugin("idem");
		expect(activate).toHaveBeenCalledOnce();
	});

	it("no-op for unregistered id", () => {
		expect(() => activatePlugin("nonexistent")).not.toThrow();
	});

	it("works when activate returns void", () => {
		const activate = vi.fn();
		registerPlugin(makePlugin("void", "Void", activate));
		activatePlugin("void");
		expect(activate).toHaveBeenCalledOnce();
		expect(() => deactivatePlugin("void")).not.toThrow();
	});
});

describe("deactivatePlugin", () => {
	it("calls cleanup function", () => {
		const cleanup = vi.fn();
		registerPlugin(makePlugin("d", "D", () => cleanup));
		activatePlugin("d");
		deactivatePlugin("d");
		expect(cleanup).toHaveBeenCalledOnce();
	});

	it("no-op for non-active plugin", () => {
		registerPlugin(makePlugin("na", "NA"));
		expect(() => deactivatePlugin("na")).not.toThrow();
	});
});

describe("activatePlugins", () => {
	it("activates all enabled plugins", () => {
		const actA = vi.fn();
		const actB = vi.fn();
		const actC = vi.fn();
		registerPlugin(makePlugin("a", "A", actA));
		registerPlugin(makePlugin("b", "B", actB));
		registerPlugin(makePlugin("c", "C", actC));
		setPluginEnabled("a", true);
		setPluginEnabled("c", true);
		activatePlugins();
		expect(actA).toHaveBeenCalledOnce();
		expect(actB).not.toHaveBeenCalled();
		expect(actC).toHaveBeenCalledOnce();
	});
});

describe("deactivatePlugins", () => {
	it("calls all cleanups and clears", () => {
		const cleanupA = vi.fn();
		const cleanupB = vi.fn();
		registerPlugin(makePlugin("a", "A", () => cleanupA));
		registerPlugin(makePlugin("b", "B", () => cleanupB));
		activatePlugin("a");
		activatePlugin("b");
		deactivatePlugins();
		expect(cleanupA).toHaveBeenCalledOnce();
		expect(cleanupB).toHaveBeenCalledOnce();
		deactivatePlugin("a");
		expect(cleanupA).toHaveBeenCalledOnce();
	});
});

describe("registrySnapshot", () => {
	it("changes on register, unregister, and enable/disable", () => {
		const v0 = getRegistrySnapshot();

		registerPlugin(makePlugin("s", "S"));
		const v1 = getRegistrySnapshot();
		expect(v1).toBeGreaterThan(v0);

		unregisterPlugin("s");
		const v2 = getRegistrySnapshot();
		expect(v2).toBeGreaterThan(v1);

		registerPlugin(makePlugin("s2", "S2"));
		const v3 = getRegistrySnapshot();

		setPluginEnabled("s2", true);
		const v4 = getRegistrySnapshot();
		expect(v4).toBeGreaterThan(v3);

		setPluginEnabled("s2", false);
		const v5 = getRegistrySnapshot();
		expect(v5).toBeGreaterThan(v4);
	});
});
