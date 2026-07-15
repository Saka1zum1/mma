// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { executeMmaPath } from "@/lib/remote/host";

describe("executeMmaPath", () => {
	beforeAll(() => {
		(window as unknown as { MMA: unknown }).MMA = {
			ping: () => "pong",
			echo: async (v: unknown) => v,
			counter: {
				n: 5,
				addTo(x: number) {
					return this.n + x;
				},
			},
			version: "1.0",
		};
	});

	it("calls a top-level function with args", async () => {
		expect(await executeMmaPath("ping", [])).toBe("pong");
		expect(await executeMmaPath("echo", [{ a: 1 }])).toEqual({ a: 1 });
	});

	it("binds nested methods to their parent object", async () => {
		expect(await executeMmaPath("counter.addTo", [3])).toBe(8);
	});

	it("returns plain values when the path is not a function", async () => {
		expect(await executeMmaPath("version", [])).toBe("1.0");
		expect(await executeMmaPath("counter.n", [])).toBe(5);
	});

	it("rejects unknown paths", async () => {
		await expect(executeMmaPath("nope", [])).rejects.toThrow("Unknown MMA path");
		await expect(executeMmaPath("counter.missing", [])).rejects.toThrow("Unknown MMA path");
		await expect(executeMmaPath("", [])).rejects.toThrow("Unknown MMA path");
	});

	it("rejects args passed to a non-function", async () => {
		await expect(executeMmaPath("version", [1])).rejects.toThrow("not a function");
	});
});
