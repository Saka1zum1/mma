import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveExactTimestamp } from "@/lib/sv/exactDate";

// Body layout (see exactDate.ts): parsed[2][0][10] = [start, end] epoch seconds.
function probeRange(body: string): [number, number] {
	return JSON.parse(body)[2][0][10];
}

const FOUND = "[]";
const EMPTY = "Search returned no images.";

function stubFetch(impl: (start: number, end: number) => { status: number; body: string }) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init: { body: string }) => {
			const [start, end] = probeRange(init.body);
			const { status, body } = impl(start, end);
			return { ok: status === 200, status, text: async () => body };
		}),
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("resolveExactTimestamp", () => {
	it("searches down to the true capture timestamp", async () => {
		// Ground truth: 2021-06-15 12:34:56 UTC, inside the 2021-06 window.
		const truth = Date.UTC(2021, 5, 15, 12, 34, 56) / 1000;
		let calls = 0;
		stubFetch((start, end) => {
			calls++;
			return {
				status: 200,
				body: start <= truth && truth <= end ? FOUND : EMPTY,
			};
		});
		const ts = await resolveExactTimestamp(1, 2, "2021-06");
		expect(Math.abs(ts - truth)).toBeLessThanOrEqual(1);
		// k-ary rounds: ~10 rounds of BRANCH probes + guard. Catches accidental blowups.
		expect(calls).toBeLessThanOrEqual(50);
	});

	it("throws when the pano is not in the window at all", async () => {
		stubFetch(() => ({ status: 200, body: EMPTY }));
		await expect(resolveExactTimestamp(1, 2, "2021-06")).rejects.toThrow("not a candidate");
	});

	it("treats rate-limit exhaustion as an error, not a negative probe", async () => {
		// Guard probe succeeds, then the endpoint starts returning 429. The old code
		// read that as "no images" and bisected to a confidently wrong timestamp.
		let calls = 0;
		stubFetch((start, end) => {
			calls++;
			if (calls === 1) {
				const truth = Date.UTC(2021, 5, 15) / 1000;
				return { status: 200, body: start <= truth && truth <= end ? FOUND : EMPTY };
			}
			return { status: 429, body: "" };
		});
		await expect(resolveExactTimestamp(1, 2, "2021-06")).rejects.toThrow(/unavailable/);
	}, 30000);

	it("treats a non-retryable HTTP error as an error, not a negative probe", async () => {
		stubFetch(() => ({ status: 400, body: "" }));
		await expect(resolveExactTimestamp(1, 2, "2021-06")).rejects.toThrow(/failed/);
	});
});
