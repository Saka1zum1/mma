/**
 * Pure planning logic for bulk metadata-field operations (rename / merge / delete / set).
 * These compute the `extra` replacement blobs and selection-reference rewrites; the store
 * orchestrates IPC, definitions, and persistence. Kept side-effect-free for testability.
 */

import type { Location, ExtraFieldDef } from "@/types";
import type { Selection, SelectionProps } from "@/store/selections";
import { buildSelection } from "@/store/selections";

/** When a move target already holds a value, which field's value survives. */
export type MergeWinner = "from" | "to";

/** A planned partial patch to one location (top-level field or `extra`). */
export interface LocationUpdate {
	id: number;
	patch: Partial<Location>;
}

/** Built-in top-level Location fields offered in the bulk "Set field" picker, with display metadata. */
export const TOP_LEVEL_SET_FIELDS: Record<string, ExtraFieldDef> = {
	heading: { type: "number", label: "Heading" },
	pitch: { type: "number", label: "Pitch" },
	zoom: { type: "number", label: "Zoom" },
};

/** Shape a single field assignment into a patch: built-in keys patch the top-level
 *  field, every other key nests under `extra`. The one place that knows the difference. */
export function fieldPatch(key: string, value: unknown): Partial<Location> {
	return (
		key in TOP_LEVEL_SET_FIELDS ? { [key]: value } : { extra: { [key]: value } }
	) as Partial<Location>;
}

/**
 * Rename/merge field `from` into `to`. Rename and merge are the same operation —
 * "rename" is just the case where no location already has `to`. When a location has
 * both keys, `winner` decides which value survives under the `to` key.
 * Returns updates only for locations that actually change.
 */
export function planFieldMove(
	locations: Location[],
	from: string,
	to: string,
	winner: MergeWinner,
): LocationUpdate[] {
	if (from === to || !to) return [];
	const updates: LocationUpdate[] = [];
	for (const loc of locations) {
		const extra = loc.extra;
		if (!extra || !(from in extra)) continue;
		const next = { ...extra };
		const fromVal = next[from];
		const hasTo = to in next;
		delete next[from];
		if (!hasTo || winner === "from") next[to] = fromVal;
		// winner === "to" with existing target: keep `next[to]` untouched
		updates.push({ id: loc.id, patch: { extra: next } });
	}
	return updates;
}

/** Remove field `key` from every location that has it. */
export function planFieldDelete(locations: Location[], key: string): LocationUpdate[] {
	const updates: LocationUpdate[] = [];
	for (const loc of locations) {
		if (!loc.extra || !(key in loc.extra)) continue;
		const next = { ...loc.extra };
		delete next[key];
		updates.push({ id: loc.id, patch: { extra: next } });
	}
	return updates;
}

/**
 * Apply `patch` to every location, skipping those it wouldn't change. `extra` is
 * merged into each location's existing extra; all other keys overwrite directly.
 * The caller asserts intent by how it shapes `patch` (e.g. `{ heading }` vs
 * `{ extra: { foo } }`); this function holds no notion of which fields are which.
 */
export function planFieldSet(locations: Location[], patch: Partial<Location>): LocationUpdate[] {
	const updates: LocationUpdate[] = [];
	for (const loc of locations) {
		if (!changesLocation(loc, patch)) continue;
		const next = patch.extra
			? { ...patch, extra: { ...(loc.extra ?? {}), ...patch.extra } }
			: patch;
		updates.push({ id: loc.id, patch: next });
	}
	return updates;
}

/** True if applying `patch` would alter `loc`. Compares requested `extra` keys
 *  against the existing extra; all other keys against the top-level field. */
function changesLocation(loc: Location, patch: Partial<Location>): boolean {
	for (const [k, v] of Object.entries(patch)) {
		if (k === "extra") {
			for (const [ek, ev] of Object.entries(v as Record<string, unknown>)) {
				if ((loc.extra ?? {})[ek] !== ev) return true;
			}
		} else if ((loc as Record<string, unknown>)[k] !== v) {
			return true;
		}
	}
	return false;
}

/**
 * Rewrite Filter `field` references in a selection tree: `from` → `to`, or drop the
 * Filter when `to` is null (field deleted). Composites collapse if emptied, or unwrap
 * to their sole survivor (matching the rest of the selection engine's semantics).
 */
function rewriteSelection(
	sel: Selection,
	from: string,
	to: string | null,
): Selection | null {
	const p = sel.props;
	if (p.type === "Filter") {
		if (p.field !== from) return sel;
		return to === null ? null : buildSelection({ ...p, field: to });
	}
	if ("selections" in p) {
		const children = p.selections
			.map((c) => rewriteSelection(c, from, to))
			.filter((c): c is Selection => c !== null);
		if (children.length === 0) return null;
		if (children.length === 1 && p.type !== "Invert") return children[0];
		return buildSelection({ ...p, selections: children } as SelectionProps);
	}
	return sel;
}

/** Group locations by the string value of `field` in their `extra`. Skips null/empty.
 *  Returns a map from field-value to the location ids that carry it. */
export function groupByField(locations: Location[], field: string): Map<string, number[]> {
	const groups = new Map<string, number[]>();
	for (const loc of locations) {
		const v = loc.extra?.[field];
		if (v == null || v === "") continue;
		const key = String(v);
		const arr = groups.get(key);
		if (arr) arr.push(loc.id);
		else groups.set(key, [loc.id]);
	}
	return groups;
}

export function rewriteSelectionFields(
	selections: Selection[],
	from: string,
	to: string | null,
): Selection[] {
	return selections
		.map((s) => rewriteSelection(s, from, to))
		.filter((s): s is Selection => s !== null);
}
