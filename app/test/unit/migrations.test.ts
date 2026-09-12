// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MIGRATIONS, SUPPORTED_FROM, compareVersions, migrationsFor } from "@/store/migrations";

describe("compareVersions", () => {
	it("orders by numeric component", () => {
		expect(compareVersions("0.9.2", "0.10.0")).toBeLessThan(0);
		expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
		expect(compareVersions("0.9", "0.9.0")).toBe(0);
	});
});

describe("migration registry", () => {
	it("holds no migration older than SUPPORTED_FROM", () => {
		const stale = MIGRATIONS.filter(
			(migration) => compareVersions(migration.since, SUPPORTED_FROM) < 0,
		);
		expect(
			stale.map((migration) => `${migration.since} ${migration.key}: ${migration.describe}`),
		).toEqual([]);
	});

	it("is ordered oldest first", () => {
		const versions = MIGRATIONS.map((migration) => migration.since);
		expect([...versions].sort(compareVersions)).toEqual(versions);
	});

	it("describes every entry", () => {
		for (const migration of MIGRATIONS) {
			expect(migration.describe.length).toBeGreaterThan(0);
			expect(migration.key.length).toBeGreaterThan(0);
		}
	});

	it("restores RGB objects from leftover [r,g,b] color tuples", () => {
		const stored: Record<string, unknown> = {
			markerColor: [42, 42, 42],
			activeLocationColor: { r: 200, g: 0, b: 0 },
			panoDotColor: [255, 0, 0],
		};
		for (const migrate of migrationsFor("appSettings")) migrate(stored);
		expect(stored.markerColor).toEqual({ r: 42, g: 42, b: 42 });
		expect(stored.activeLocationColor).toEqual({ r: 200, g: 0, b: 0 });
		expect(stored.panoDotColor).toEqual({ r: 255, g: 0, b: 0 });
	});

	it("selects by store key", () => {
		expect(migrationsFor("appSettings").length).toBe(
			MIGRATIONS.filter((migration) => migration.key === "appSettings").length,
		);
		expect(migrationsFor("no-such-blob")).toEqual([]);
	});

	it("moves hasSeenWelcome onto its own welcomeSeen key", () => {
		const stored: Record<string, unknown> = { hasSeenWelcome: true };
		for (const migrate of migrationsFor("appSettings")) migrate(stored);
		expect(stored).not.toHaveProperty("hasSeenWelcome");
		expect(localStorage.getItem("welcomeSeen")).toBe("true");
	});
});
