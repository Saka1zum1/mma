// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { getLocal, setLocal } from "@/lib/hooks/useLocalStorage";

describe("useLocalStorage shared store", () => {
	beforeEach(() => localStorage.clear());

	it("getLocal returns the default for a missing key", () => {
		expect(getLocal("missing-1", 42)).toBe(42);
		expect(getLocal("missing-2", [])).toEqual([]);
	});

	it("setLocal updates the in-memory authority that getLocal reads", () => {
		setLocal("k-write", [{ name: "a" }]);
		expect(getLocal("k-write", [])).toEqual([{ name: "a" }]);
	});

	it("setLocal persists JSON to localStorage", () => {
		setLocal("k-persist", { x: 1 });
		expect(JSON.parse(localStorage.getItem("k-persist")!)).toEqual({ x: 1 });
	});

	it("all consumers of a key share one authority", () => {
		setLocal("k-shared", "first");
		const a = getLocal("k-shared", "default");
		setLocal("k-shared", "second");
		const b = getLocal("k-shared", "default");
		expect(a).toBe("first");
		expect(b).toBe("second");
	});

	it("rehydrates from a pre-existing localStorage value", () => {
		localStorage.setItem("k-rehydrate", JSON.stringify(["x", "y"]));
		expect(getLocal("k-rehydrate", [])).toEqual(["x", "y"]);
	});

	it("merges defaults under a stored object so new keys resolve", () => {
		localStorage.setItem("k-merge", JSON.stringify({ a: 1 }));
		expect(getLocal("k-merge", { a: 0, b: 2 })).toEqual({ a: 1, b: 2 });
	});
});
