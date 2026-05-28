// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mmaRequire, preloadModules, getAvailableExternals } from "@/plugins/externals";

describe("mmaRequire", () => {
	it("returns react module", () => {
		const mod = mmaRequire("react");
		expect(mod).toBeTruthy();
		expect(mod).toHaveProperty("createElement");
	});

	it("returns react-dom module", () => {
		const mod = mmaRequire("react-dom");
		expect(mod).toBeTruthy();
		expect(mod).toHaveProperty("createPortal");
	});

	it("returns react/jsx-runtime module", () => {
		const mod = mmaRequire("react/jsx-runtime");
		expect(mod).toBeTruthy();
		expect(mod).toHaveProperty("jsx");
	});

	it("throws for unknown module with name in message", () => {
		expect(() => mmaRequire("lodash")).toThrowError(
			'Module "lodash" is not available as an MMA external.',
		);
	});

	it("throws for empty string module id", () => {
		expect(() => mmaRequire("")).toThrowError("not available as an MMA external");
	});
});

describe("getAvailableExternals", () => {
	it("returns an array", () => {
		const externals = getAvailableExternals();
		expect(Array.isArray(externals)).toBe(true);
	});

	it("contains react and react-dom", () => {
		const externals = getAvailableExternals();
		expect(externals).toContain("react");
		expect(externals).toContain("react-dom");
	});

	it("contains all 11 eager modules", () => {
		const externals = getAvailableExternals();
		const expected = [
			"react",
			"react-dom",
			"react/jsx-runtime",
			"react/jsx-dev-runtime",
			"@deck.gl/core",
			"@deck.gl/layers",
			"@deck.gl/google-maps",
			"@luma.gl/core",
			"@luma.gl/engine",
			"@luma.gl/shadertools",
			"@luma.gl/webgl",
		];
		for (const id of expected) {
			expect(externals).toContain(id);
		}
	});

	it("has at least 11 entries", () => {
		expect(getAvailableExternals().length).toBeGreaterThanOrEqual(11);
	});
});

describe("preloadModules", () => {
	it("resolves with empty array", async () => {
		await expect(preloadModules([])).resolves.toBeUndefined();
	});

	it("resolves for already-eager modules (no-op)", async () => {
		await expect(preloadModules(["react", "react-dom"])).resolves.toBeUndefined();
	});

	it("rejects for unknown module with name in message", async () => {
		await expect(preloadModules(["nonexistent"])).rejects.toThrowError(
			'Module "nonexistent" is not available as an MMA external.',
		);
	});

	it("rejects if any module in the list is unknown", async () => {
		await expect(preloadModules(["react", "unknown-lib"])).rejects.toThrowError(
			"not available as an MMA external",
		);
	});
});

describe("globalThis.__mma_require", () => {
	it("is set to the mmaRequire function", () => {
		expect(globalThis.__mma_require).toBe(mmaRequire);
	});

	it("works as a global lookup", () => {
		const mod = globalThis.__mma_require("react");
		expect(mod).toBeTruthy();
	});
});
