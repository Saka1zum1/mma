import { describe, it, expect } from "vitest";
import { isVariant, unionTuple, type Variant } from "@/types/util";

type Shape =
	| { type: "circle"; r: number }
	| { type: "rect"; w: number; h: number }
	| { type: "line"; len: number };

describe("isVariant", () => {
	it("narrows on a single tag", () => {
		const s = { type: "circle", r: 5 } as Shape;
		expect(isVariant(s, "circle")).toBe(true);
		expect(isVariant(s, "rect")).toBe(false);
		if (isVariant(s, "circle")) {
			// type-level: s is narrowed to the circle variant
			expect(s.r).toBe(5);
		}
	});

	it("narrows on a tag union (array)", () => {
		const s = { type: "rect", w: 2, h: 3 } as Shape;
		expect(isVariant(s, ["rect", "line"])).toBe(true);
		expect(isVariant(s, ["circle", "line"])).toBe(false);
		if (isVariant(s, ["rect", "circle"])) {
			// both branches expose distinct fields; access is type-checked
			const area = "r" in s ? Math.PI * s.r * s.r : s.w * s.h;
			expect(area).toBe(6);
		}
	});

	it("accepts a readonly tuple of tags", () => {
		const tags = ["circle", "rect"] as const;
		const s = { type: "circle", r: 1 } as Shape;
		expect(isVariant(s, tags)).toBe(true);
	});

	it("supports a custom discriminant", () => {
		type Ev = { kind: "a"; n: number } | { kind: "b"; s: string };
		const e = { kind: "b", s: "x" } as Ev;
		expect(isVariant(e, "b", "kind")).toBe(true);
		expect(isVariant(e, "a", "kind")).toBe(false);
	});

	it("Variant<> extracts the matching member type", () => {
		const circle: Variant<Shape, "circle"> = { type: "circle", r: 9 };
		expect(circle.r).toBe(9);
	});
});

describe("unionTuple", () => {
	it("returns the tuple when every member is present", () => {
		const all = unionTuple<"a" | "b" | "c">()(["c", "a", "b"]);
		expect(all).toEqual(["c", "a", "b"]);
	});

	it("rejects a tuple missing a member at compile time", () => {
		// @ts-expect-error — "c" is missing from the union tuple
		unionTuple<"a" | "b" | "c">()(["a", "b"]);
	});

	it("rejects a tuple with a non-member at compile time", () => {
		// @ts-expect-error — "z" is not part of the union
		unionTuple<"a" | "b">()(["a", "b", "z"]);
	});
});
