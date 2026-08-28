// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { getLocal, setLocal, persisted } from "@/lib/hooks/useLocalStorage";
import { MIGRATIONS, type StoredMigration } from "@/store/migrations";

function withMigration(migration: StoredMigration, run: () => void) {
	MIGRATIONS.push(migration);
	try {
		run();
	} finally {
		MIGRATIONS.splice(MIGRATIONS.indexOf(migration), 1);
	}
}

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

	it("runs migrations before defaults merge and writes migrated data back", () => {
		localStorage.setItem("k-mig", JSON.stringify({ color: { r: 1, g: 2, b: 3 } }));
		withMigration(
			{
				since: "0.0.0",
				key: "k-mig",
				describe: "color object -> tuple",
				apply: (value) => {
					const color = value.color as { r: number; g: number; b: number };
					if (color && !Array.isArray(color)) value.color = [color.r, color.g, color.b];
				},
			},
			() => {
				expect(getLocal(persisted("k-mig", { color: [0, 0, 0], size: 5 }))).toEqual({
					color: [1, 2, 3],
					size: 5,
				});
				expect(JSON.parse(localStorage.getItem("k-mig")!)).toEqual({
					color: [1, 2, 3],
				});
			},
		);
	});

	it("does not rewrite disk when migrations change nothing", () => {
		const raw = JSON.stringify({ n: 7 });
		localStorage.setItem("k-noop", raw);
		withMigration(
			{
				since: "0.0.0",
				key: "k-noop",
				describe: "n string -> number",
				apply: (value) => {
					if (typeof value.n === "string") value.n = Number(value.n);
				},
			},
			() => {
				getLocal(persisted("k-noop", { n: 0 }));
				expect(localStorage.getItem("k-noop")).toBe(raw);
			},
		);
	});
});
