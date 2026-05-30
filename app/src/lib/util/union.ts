/**
 * Generic helpers for discriminated unions. Work over *any* tagged union,
 * defaulting to a `"type"` discriminant.
 *
 *   type Shape = { type: "circle"; r: number } | { type: "rect"; w: number };
 *   Variant<Shape, "circle">                     // { type: "circle"; r: number }
 *   if (isVariant(shape, "circle")) shape.r      // narrowed, no cast
 *   if (isVariant(shape, ["circle", "rect"])) …  // narrowed to the union
 */

/** The member(s) of union `U` whose discriminant `D` (default `"type"`) is `V`. */
export type Variant<U, V extends U[D], D extends keyof U = "type" & keyof U> = Extract<
	U,
	Record<D, V>
>;

/** Narrowing guard: is `value` one of the given variant tag(s)? */
export function isVariant<U, const V extends U[D], D extends keyof U = "type" & keyof U>(
	value: U,
	tag: V | readonly V[],
	discriminant: D = "type" as D,
): value is Extract<U, Record<D, V>> {
	const tags = (Array.isArray(tag) ? tag : [tag]) as readonly PropertyKey[];
	return tags.includes(value[discriminant] as PropertyKey);
}

/**
 * Build a readonly tuple the compiler verifies contains *every* member of union
 * `T` (in any order). Omitting one is a type error naming the missing member, so
 * a runtime list stays provably in sync with its source-of-truth union type.
 *
 *   const ALL = unionTuple<"a" | "b">()(["a", "b"]);   // ok
 *   const OOPS = unionTuple<"a" | "b">()(["a"]);        // error: missing "b"
 */
export const unionTuple =
	<T extends PropertyKey>() =>
	<const U extends readonly T[]>(
		tuple: U & ([T] extends [U[number]] ? unknown : { readonly __missing: Exclude<T, U[number]> }),
	): U =>
		tuple;
