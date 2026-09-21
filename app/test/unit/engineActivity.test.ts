import { describe, expect, it } from "vitest";
import { engineRows } from "@/lib/engineActivity";
import type { ProcedureActivity } from "@/bindings.gen";

const activity = (partial: Partial<ProcedureActivity> = {}): ProcedureActivity => ({
	runs: [],
	queries: [],
	requestsPerSecond: 0,
	...partial,
});

describe("engineRows", () => {
	it("is idle when nothing is running", () => {
		expect(engineRows(null).idle).toBe(true);
		expect(engineRows(activity()).idle).toBe(true);
	});

	it("shows one row per provider with a fraction of done over total", () => {
		const rows = engineRows(
			activity({
				runs: [
					{
						runId: 1,
						providerId: "weather",
						label: "Weather",
						total: 100,
						done: 25,
						failed: 1,
						skipped: 4,
						instances: 2,
						inflight: 8,
						inflightLimit: 48,
						rateWaiting: 3,
						retries: 6,
					},
				],
				requestsPerSecond: 12.5,
			}),
		);
		expect(rows.idle).toBe(false);
		expect(rows.providers).toEqual([
			{
				key: "1:weather",
				label: "Weather",
				fraction: 0.25,
				done: 25,
				total: 100,
				failed: 1,
				skipped: 4,
				inflight: 8,
				inflightLimit: 48,
				rateWaiting: 3,
				retries: 6,
				instances: 2,
			},
		]);
		expect(rows.requestsPerSecond).toBe(12.5);
	});

	it("falls back to the provider id when it has no label", () => {
		expect(
			engineRows(
				activity({
					runs: [
						{
							runId: 2,
							providerId: "bare",
							label: null,
							total: 0,
							done: 0,
							failed: 0,
							skipped: 0,
							instances: 0,
							inflight: 0,
							inflightLimit: 48,
							rateWaiting: 0,
							retries: 0,
						},
					],
				}),
			).providers[0],
		).toMatchObject({ label: "bare", fraction: 0 });
	});

	it("names a query by its procedure file stem", () => {
		expect(
			engineRows(
				activity({
					queries: [
						{
							entry: "res://procedures/nearby.js",
							inflight: 2,
							inflightLimit: 48,
							retries: 1,
						},
					],
				}),
			).queries,
		).toEqual([{ entry: "nearby", inflight: 2, inflightLimit: 48, retries: 1 }]);
	});
});
