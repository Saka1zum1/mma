/** Pure selection transforms. These only manipulate the JS selection tree; Rust resolves the actual bitmasks. */

import { match, P } from "ts-pattern";
import type { MapData, FilterOp } from "@/bindings.gen";
import { hslToRgb } from "@/lib/util/color";
import { getFieldDef } from "@/lib/data/fieldDefRegistry";
import { localDateTime, utcDateTime } from "@/lib/util/format";
import { isVariant, unionTuple, type Variant } from "@/types/util";
import { pointInPolygon } from "@/lib/geo/geo";
import { getSettings } from "@/store/settings";
import { shortestUniqueSuffixes } from "@/components/editor/tags/tagTreeRange";

import type { Selection, SelectionProps } from "@/bindings.gen";

/** Variants that wrap children — derived as exactly those carrying a `selections` array. */
export type CompositeType = Extract<SelectionProps, { selections: Selection[] }>["type"];
/** Composite variants that wrap exactly one child (operators, not bags). They never collapse — a
 *  one-child group is degenerate, but one child is a unary node's only valid arity. */
export type UnaryType = "Invert";
/** Composite variants that are flat n-ary groups. */
export type GroupType = Exclude<CompositeType, UnaryType>;

const COMPOSITE_TYPES = unionTuple<CompositeType>()(["Intersection", "Union", "Invert"]);
const GROUP_TYPES = unionTuple<GroupType>()(["Intersection", "Union"]);
export const UNARY_TYPES = unionTuple<UnaryType>()(["Invert"]);

export enum ValidationState {
	Ok = 0,
	UpdateAvailable = 1,
	UpdateApplied = 2,
	NotFound = 3,
	PanoIdBroke = 4,
	Unofficial = 5,
	GoodcamAvailable = 6,
}

/** Display symbol/word for each filter operator. */
export const OP_LABELS: Record<FilterOp, string> = {
	eq: "=",
	neq: "!=",
	gt: ">",
	lt: "<",
	gte: ">=",
	lte: "<=",
	between: "between",
	between_anyyear: "between (any year)",
	between_anytime: "between (any date)",
	has: "has",
	nothas: "does not have",
	contains: "contains",
	notcontains: "does not contain",
};

export function colorForKey(key: string): [number, number, number] {
	let t = 0;
	for (let i = 0; i < key.length; i += 1) t = ((key.charCodeAt(i) + (t << 5)) | 0) + t;
	t = (((t * 214013) | 0) + 2531011) | 0;
	return hslToRgb(Math.abs(t) % 360, 0.5, 0.5);
}

function locationsKey(ids: number[]): string {
	return ids.join(",");
}

/** Ghost keys that "solo" `key`: everything except it. Returns an empty set when `key`
 *  is already the sole visible selection, so a repeat call un-isolates (clears all ghosts). */
export function isolateGhostKeys(
	keys: string[],
	ghosted: ReadonlySet<string>,
	key: string,
): Set<string> {
	const alreadyIsolated = !ghosted.has(key) && keys.every((k) => k === key || ghosted.has(k));
	return alreadyIsolated ? new Set() : new Set(keys.filter((k) => k !== key));
}

/** Pick `n` distinct ids uniformly at random from `ids` using `Math.random`.
 *  `n` is floored and clamped to `[0, ids.length]` (so over-large counts return all ids).
 *  Uses a partial Fisher–Yates shuffle, so the result contains no duplicates and `ids` is not mutated. */
export function sampleIds(ids: number[], n: number): number[] {
	const k = Math.max(0, Math.min(Math.floor(n), ids.length));
	const pool = ids.slice();
	for (let i = 0; i < k; i += 1) {
		const j = i + Math.floor(Math.random() * (pool.length - i));
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	return pool.slice(0, k);
}

export function resolveLocations(props: SelectionProps): number[] {
	return match(props)
		.with({ type: P.union("Locations", "Manual", "ValidationState", "Reviewed") }, (p) => [
			...p.locations,
		])
		.otherwise(() => []);
}

function keyForProps(props: SelectionProps, locations: number[]): string {
	return match(props)
		.with({ type: "Locations" }, () => locationsKey(locations))
		.with({ type: "Everything" }, () => "everything")
		// polygon keys are unique per draw; use a generated id stored on first init
		.with({ type: "Polygon" }, () => `polygon:${crypto.randomUUID()}`)
		.with({ type: "Tag" }, (p) => `tag:${p.tagId}`)
		.with({ type: "Untagged" }, () => "untagged")
		.with({ type: "Unpanned" }, () => "unpanned")
		.with({ type: "PanoIds" }, () => "panoids")
		.with({ type: "NotPanoIds" }, () => "notpanoids")
		.with({ type: "Uncommitted" }, () => "uncommitted")
		.with({ type: "Duplicates" }, (p) => `duplicates:${p.distance}`)
		.with({ type: "Manual" }, () => "manual")
		.with({ type: "ValidationState" }, (p) => `validation:${p.state}`)
		.with({ type: "Reviewed" }, (p) => `review:${p.sessionId}:${p.mode}`)
		.with({ type: "Intersection" }, (p) => p.selections.map((s) => `(${s.key})`).join("^"))
		.with({ type: "Union" }, (p) => p.selections.map((s) => `(${s.key})`).join("|"))
		.with({ type: "Invert" }, (p) => `!${p.selections[0].key}`)
		.with(
			{ type: "Filter" },
			(p) =>
				`filter:${p.field}:${p.op}:${String(p.value)}${p.value2 != null ? `:${String(p.value2)}` : ""}${p.tzLocal ? ":local" : ""}`,
		)
		.with({ type: "TopK" }, (p) => `topk:${p.field}:${p.k}:${p.ascending}`)
		.exhaustive();
}

/** Overlay color for a selection. Reviewed is green (145), unreviewed is violet (280): both stay
 *  well clear of the red active-location marker so the cursor never blends in — everything else is hashed from its key. */
function selectionColor(props: SelectionProps, key: string): [number, number, number] {
	if (props.type !== "Reviewed") return colorForKey(key);
	return props.mode === "unreviewed" ? hslToRgb(280, 0.6, 0.5) : hslToRgb(145, 0.6, 0.5);
}

/** Create a Selection with a deterministic key and overlay color from its props. */
export function buildSelection(props: SelectionProps): Selection {
	const locations = resolveLocations(props);
	const key = keyForProps(props, locations);
	return { key, color: selectionColor(props, key), props, count: 0 };
}

// dedupe by key, preserving order of last occurrence
function dedupe(selections: Selection[]): Selection[] {
	const map = new Map<string, Selection>();
	for (const s of selections) map.set(s.key, s);
	return map.size === selections.length ? selections : Array.from(map.values());
}

export function addSelection(
	current: Selection[],
	props: SelectionProps,
): Selection[] {
	return dedupe([...current, buildSelection(props)]);
}

/** Keys of every Polygon selection whose geometry contains the point. */
export function polygonSelectionsContaining(selections: Selection[], lat: number, lng: number): string[] {
	const keys: string[] = [];
	for (const sel of selections) {
		if (sel.props.type !== "Polygon") continue;
		const { coordinates, extraPolygons } = sel.props.polygon;
		const polys = extraPolygons ? [coordinates, ...extraPolygons] : [coordinates];
		if (polys.some((rings) => pointInPolygon(lng, lat, rings))) keys.push(sel.key);
	}
	return keys;
}

/** Remove a selection by key. Composites (Intersection/Union/Invert) unwrap their children back into the list. */
export function removeSelection(current: Selection[], key: string): Selection[] {
	return current.flatMap((s) => {
		if (s.key !== key) return [s];
		if (isVariant(s.props, COMPOSITE_TYPES)) return s.props.selections;
		return [];
	});
}

/** Split selections into [matching the keys, everything else]. */
function partitionByKeys(current: Selection[], keys: string[]): [Selection[], Selection[]] {
	const targets: Selection[] = [];
	const others: Selection[] = [];
	for (const s of current) (keys.includes(s.key) ? targets : others).push(s);
	return [targets, others];
}

/** Merge targeted selections into a single composite, flattening nested groups of the same type. */
function composeSelectionGroup(
	current: Selection[],
	keys: string[] | null,
	type: "Intersection" | "Union",
): Selection[] {
	if (current.length < 2) return current;
	const [targets, others] = partitionByKeys(current, keys ?? current.map((s) => s.key));
	const flat = targets.flatMap((s) => (s.props.type === type ? s.props.selections : [s]));
	return [...others, buildSelection({ type, selections: dedupe(flat) })];
}

export const intersectSelections = (current: Selection[], keys: string[] | null) =>
	composeSelectionGroup(current, keys, "Intersection");

export const unionSelections = (current: Selection[], keys: string[] | null) =>
	composeSelectionGroup(current, keys, "Union");

/** Invert targeted selections. Single target toggles in-place at any depth; multiple are wrapped in Union then Invert. */
export function invertSelections(
	current: Selection[],
	keys: string[] | null,
): Selection[] {
	if (current.length === 0) return current;
	const targetKeys = keys ?? current.map((s) => s.key);
	// single-target invert toggles in-place, nested children included
	if (targetKeys.length === 1) {
		const toggle = (m: Selection): Selection =>
			m.props.type === "Invert"
				? m.props.selections[0]
				: buildSelection({ type: "Invert", selections: [m] });
		for (let i = 0; i < current.length; i++) {
			const inverted = transformInTree(current[i], targetKeys[0], toggle);
			if (inverted) return spliceMerging(current, i, inverted);
		}
		return current;
	}
	const [targets, others] = partitionByKeys(current, targetKeys);
	const flat = targets.flatMap((s) => (s.props.type === "Union" ? s.props.selections : [s]));
	const inner =
		flat.length === 1 ? flat[0] : buildSelection({ type: "Union", selections: flat });
	return [...others, buildSelection({ type: "Invert", selections: [inner] })];
}

export function toggleManualSelection(
	current: Selection[],
	locationId: number,
): Selection[] {
	const idx = current.findIndex((s) => s.key === "manual");
	if (idx === -1)
		return [...current, buildSelection({ type: "Manual", locations: [locationId] })];
	const sel = current[idx];
	const ids = (sel.props as Variant<SelectionProps, "Manual">).locations.slice();
	const at = ids.indexOf(locationId);
	if (at === -1) ids.push(locationId);
	else ids.splice(at, 1);
	if (ids.length === 0) return current.toSpliced(idx, 1);
	const next = buildSelection({ type: "Manual", locations: ids });
	return current.with(idx, next);
}

export function reorderSelections(
	current: Selection[],
	fromKey: string,
	toKey: string,
	position: "before" | "after",
): Selection[] {
	const fromIdx = current.findIndex((s) => s.key === fromKey);
	if (fromIdx === -1) return current;
	const item = current[fromIdx];
	const without = current.toSpliced(fromIdx, 1);
	let toIdx = without.findIndex((s) => s.key === toKey);
	if (toIdx === -1) return current;
	if (position === "after") toIdx++;
	return without.toSpliced(toIdx, 0, item);
}

/** Drag-drop composition: merge drag into drop as a new composite, absorbing existing children of the same type. */
export function composeSelections(
	current: Selection[],
	dragKey: string,
	dropKey: string,
	mode: GroupType,
): Selection[] {
	const dragIdx = current.findIndex((s) => s.key === dragKey);
	const dropIdx = current.findIndex((s) => s.key === dropKey);
	if (dragIdx === -1 || dropIdx === -1 || dragIdx === dropIdx) return current;
	const drag = current[dragIdx];
	const drop = current[dropIdx];

	let children: Selection[];
	if (isVariant(drop.props, mode)) {
		children = [...drop.props.selections, drag];
	} else {
		children = [drop, drag];
	}
	const composite = buildSelection({ type: mode, selections: dedupe(children) });

	return current.filter((_, i) => i !== dragIdx).map((s) => (s.key === dropKey ? composite : s));
}

/** Unwrap a unary operator (e.g. Invert) to the n-ary group it wraps, returning that group's props
 *  plus a `rewrap` that restores the operator; a plain group returns itself with an identity rewrap.
 *  Null when there's no group to operate on. Single source for "a unary node keeps its wrapper" —
 *  every site that rebuilds a composite's children routes through it. */
function unwrapUnary(
	sel: Selection,
): { props: Variant<SelectionProps, GroupType>; rewrap: (inner: Selection) => Selection } | null {
	const unary = isVariant(sel.props, UNARY_TYPES) ? sel.props.type : null;
	const props = isVariant(sel.props, UNARY_TYPES) ? sel.props.selections[0].props : sel.props;
	if (!isVariant(props, GROUP_TYPES)) return null;
	return {
		props,
		rewrap: (inner) => (unary ? buildSelection({ type: unary, selections: [inner] }) : inner),
	};
}

function removeChildFromComposite(
	sel: Selection,
	parentKey: string,
	childKey: string,
): { updated: Selection; removed: Selection } | null {
	const grp = unwrapUnary(sel);
	if (!grp) return null;
	const { props: compositeProps, rewrap } = grp;
	const children = compositeProps.selections;

	if (sel.key === parentKey) {
		const childIdx = children.findIndex((s) => s.key === childKey);
		if (childIdx === -1) return null;
		const child = children[childIdx];
		const unwrapped = isVariant(child.props, GROUP_TYPES) ? child.props.selections : [];
		const remaining = [
			...children.slice(0, childIdx),
			...unwrapped,
			...children.slice(childIdx + 1),
		];
		const group =
			remaining.length <= 1
				? remaining[0] ?? child
				: buildSelection({ type: compositeProps.type, selections: remaining });
		return { updated: rewrap(group), removed: child };
	}

	for (let i = 0; i < children.length; i++) {
		const result = removeChildFromComposite(children[i], parentKey, childKey);
		if (result) {
			const newChildren = children.with(i, result.updated);
			return {
				updated: rewrap(buildSelection({ type: compositeProps.type, selections: newChildren })),
				removed: result.removed,
			};
		}
	}
	return null;
}

/** Pull a child out of a composite back into the top-level list. Parent collapses if only one child remains. */
export function decomposeChild(
	current: Selection[],
	parentKey: string,
	childKey: string,
): Selection[] {
	for (let i = 0; i < current.length; i++) {
		if (current[i].key === parentKey) {
			const result = removeChildFromComposite(current[i], parentKey, childKey);
			if (!result) return current;
			const out = [...current];
			out[i] = result.updated;
			out.splice(i + 1, 0, result.removed);
			return out;
		}
		const nested = removeChildFromComposite(current[i], parentKey, childKey);
		if (nested) {
			const out = [...current];
			out[i] = nested.updated;
			out.splice(i + 1, 0, nested.removed);
			return out;
		}
	}
	return current;
}

export function removeFromComposite(
	current: Selection[],
	parentKey: string,
	childKey: string,
): Selection[] {
	for (let i = 0; i < current.length; i++) {
		const result = removeChildFromComposite(current[i], parentKey, childKey);
		if (result) {
			const out = [...current];
			out[i] = result.updated;
			return out;
		}
	}
	return current;
}

export function composeSiblings(
	current: Selection[],
	parentKey: string,
	dragKey: string,
	dropKey: string,
	mode: GroupType,
): Selection[] {
	const parentIdx = current.findIndex((s) => s.key === parentKey);
	if (parentIdx === -1) return current;
	const grp = unwrapUnary(current[parentIdx]);
	if (!grp) return current;
	const { props: compositeProps, rewrap } = grp;

	const children = compositeProps.selections;
	const dragChild = children.find((s) => s.key === dragKey);
	const dropChild = children.find((s) => s.key === dropKey);
	if (!dragChild || !dropChild) return current;

	const nested = buildSelection({ type: mode, selections: [dropChild, dragChild] });
	const newChildren = children
		.filter((s) => s.key !== dragKey)
		.map((s) => (s.key === dropKey ? nested : s));
	const newParent = rewrap(buildSelection({ type: compositeProps.type, selections: newChildren }));
	return current.with(parentIdx, newParent);
}

export function composeWithChild(
	current: Selection[],
	dragKey: string,
	parentKey: string,
	childKey: string,
	mode: GroupType,
): Selection[] {
	const parentIdx = current.findIndex((s) => s.key === parentKey);
	const dragIdx = current.findIndex((s) => s.key === dragKey);
	if (parentIdx === -1 || dragIdx === -1) return current;
	const drag = current[dragIdx];
	const grp = unwrapUnary(current[parentIdx]);
	if (!grp) return current;
	const { props: compositeProps, rewrap } = grp;

	const children = compositeProps.selections;
	const childIdx = children.findIndex((s) => s.key === childKey);
	if (childIdx === -1) return current;
	const child = children[childIdx];

	const nested = buildSelection({ type: mode, selections: [child, drag] });
	const newChildren = children.with(childIdx, nested);
	const newParent = rewrap(buildSelection({ type: compositeProps.type, selections: newChildren }));

	return current.filter((_, i) => i !== dragIdx).map((s) => (s.key === parentKey ? newParent : s));
}

/** Put `replaced` at `index` in `list`, enforcing unique keys at this level: if it collides
 *  with another entry, drop the spliced (edited) one and keep the pre-existing. Index-based so
 *  it's correct at every level — a re-key can collide with a sibling not just where the edit
 *  happened but at any composite up the path (e.g. editing one group's child to match another
 *  group makes the two groups identical). */
function spliceMerging(list: Selection[], index: number, replaced: Selection): Selection[] {
	if (list.some((s, j) => j !== index && s.key === replaced.key)) {
		return list.filter((_, j) => j !== index);
	}
	return list.with(index, replaced);
}

/** Find the node identified by `key` at any depth and replace it with `fn(matched)`, rebuilding the
 *  keys of every composite on the path so identity stays consistent. Enforces the unique-key
 *  invariant via {@link spliceMerging}. A group that merges down to one child collapses to that
 *  child; Invert is unary, so it always keeps its wrapper around the rebuilt child. */
function transformInTree(
	sel: Selection,
	key: string,
	fn: (matched: Selection) => Selection,
): Selection | null {
	if (sel.key === key) return fn(sel);
	if (!isVariant(sel.props, COMPOSITE_TYPES)) return null;
	const children = sel.props.selections;
	for (let i = 0; i < children.length; i++) {
		const next = transformInTree(children[i], key, fn);
		if (next) {
			const newChildren = spliceMerging(children, i, next);
			if (newChildren.length === 1 && !isVariant(sel.props, UNARY_TYPES)) return newChildren[0];
			return buildSelection({ type: sel.props.type, selections: newChildren });
		}
	}
	return null;
}

/** Replace the selection identified by `oldKey` (at any depth) with one built from `props`,
 *  rebuilding the keys of every composite on the path so identity stays consistent. Used to
 *  edit a filter in place without dropping it from its AND/OR group. Enforces the unique-key
 *  invariant recursively (via {@link spliceMerging}): if a re-key collides with an existing
 *  selection at any level, merge into it — drop this edit, keep the existing one. A selection's
 *  key is its identity, so a duplicate key would break every key-addressed op (recolor,
 *  reorder, drag-highlight, remove). */
export function replaceSelection(
	current: Selection[],
	oldKey: string,
	props: SelectionProps,
): Selection[] {
	for (let i = 0; i < current.length; i++) {
		const replaced = transformInTree(current[i], oldKey, () => buildSelection(props));
		if (replaced) return spliceMerging(current, i, replaced);
	}
	return current;
}

/** Human-readable label for a selection, resolving tag names and filter ops. */
export function selectionDisplayName(map: MapData, sel: Selection): string {
	return match(sel.props)
		.with({ type: "Locations" }, (p) => p.name ?? "Selection")
		.with({ type: "Everything" }, () => "Everything")
		.with({ type: "Polygon" }, (p) =>
			p.polygon.properties?.name ? `Polygon: ${p.polygon.properties.name}` : "Polygon",
		)
		.with({ type: "Tag" }, (p) => `Tag: ${tagDisplayName(map, p.tagId)}`)
		.with({ type: "Untagged" }, () => "Untagged")
		.with({ type: "Unpanned" }, () => "Unpanned")
		.with({ type: "PanoIds" }, () => "Pano ID locations")
		.with({ type: "NotPanoIds" }, () => "Coordinate locations")
		.with({ type: "Uncommitted" }, () => "Uncommitted")
		.with({ type: "Duplicates" }, (p) => `Duplicates (${p.distance}m)`)
		.with({ type: "Manual" }, () => "Manual selection")
		.with({ type: "ValidationState" }, (p) => validationStateLabel(p.state))
		.with({ type: "Reviewed" }, (p) => (p.mode === "unreviewed" ? "Unreviewed" : "Reviewed"))
		.with({ type: "Intersection" }, () => "Intersection")
		.with({ type: "Union" }, () => "Union")
		.with({ type: "Invert" }, (p) => `Invert: ${selectionDisplayName(map, p.selections[0])}`)
		.with({ type: "Filter" }, (p) => {
			const fieldDef = getFieldDef(p.field);
			const fieldLabel = fieldDef?.label ?? p.field;
			if (p.op === "has") return `has ${fieldLabel}`;
			if (p.op === "nothas") return `missing ${fieldLabel}`;
			const fmtMD = (v: unknown) => {
				const s = String(v);
				const m = /^(\d{2})-(\d{2})$/.exec(s);
				if (m) {
					const dt = new Date(2000, Number(m[1]) - 1, Number(m[2]));
					return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
				}
				return s;
			};
			// tzLocal values are wall-clock instants encoded as UTC epochs: render via UTC getters.
			const fmtVal = (v: unknown) => {
				const s = String(v);
				if (fieldDef?.type === "enum" && fieldDef.labels?.[s]) return fieldDef.labels[s];
				if (fieldDef?.type === "date") {
					const n = Number(v);
					if (!isNaN(n)) return p.tzLocal ? utcDateTime(n) : localDateTime(n);
				}
				return s;
			};
			const tzSuffix = p.tzLocal ? " (location time)" : "";
			if (p.op === "between_anyyear")
				return `${fieldLabel} ${OP_LABELS[p.op]} ${fmtMD(p.value)}..${fmtMD(p.value2)}${tzSuffix}`;
			if (p.op === "between_anytime")
				return `${fieldLabel} ${OP_LABELS[p.op]} ${p.value}..${p.value2}${tzSuffix}`;
			if (p.op === "between")
				return `${fieldLabel} ${OP_LABELS[p.op as FilterOp]} ${fmtVal(p.value)}..${fmtVal(p.value2)}${tzSuffix}`;
			return `${fieldLabel} ${OP_LABELS[p.op as FilterOp]} ${fmtVal(p.value)}${tzSuffix}`;
		})
		.with({ type: "TopK" }, (p) => {
			const fieldDef = getFieldDef(p.field);
			const label = fieldDef?.label ?? p.field;
			return `${p.ascending ? "Bottom" : "Top"} ${p.k} by ${label}`;
		})
		.exhaustive();
}

let suffixCache: { tags: MapData["meta"]["tags"]; suffixes: Map<string, string> } | null = null;

/** Display label for a tag NAME. In tree view with `truncateTagPaths` on, collapses the
 *  `/`-path to its shortest unique suffix; otherwise returns the name verbatim. Memoized on
 *  the tag-set reference (reassigned on every tag mutation) so list rendering stays O(n). */
export function displayTagName(map: MapData, name: string): string {
	const s = getSettings();
	if (s.tagViewMode !== "tree" || !s.truncateTagPaths) return name;
	const tags = map.meta.tags;
	if (!suffixCache || suffixCache.tags !== tags) {
		const names = Object.values(tags).map((t) => t.name);
		suffixCache = { tags, suffixes: shortestUniqueSuffixes(names) };
	}
	return suffixCache.suffixes.get(name) ?? name;
}

function tagDisplayName(map: MapData, tagId: number): string {
	const name = map.meta.tags[tagId]?.name;
	return name == null ? String(tagId) : displayTagName(map, name);
}

function validationStateLabel(state: ValidationState): string {
	switch (state) {
		case ValidationState.Ok:
			return "Valid location";
		case ValidationState.UpdateAvailable:
			return "Newer coverage available";
		case ValidationState.UpdateApplied:
			return "Coverage updated since last view";
		case ValidationState.NotFound:
			return "Not found";
		case ValidationState.PanoIdBroke:
			return "Pano ID broke";
		case ValidationState.Unofficial:
			return "Unofficial";
		case ValidationState.GoodcamAvailable:
			return "Badcam, but good coverage available";
	}
}

export function setSelectionColors(
	current: Selection[],
	key: string,
	color: [number, number, number],
): Selection[] {
	const idx = current.findIndex((s) => s.key === key);
	if (idx === -1) return current;
	return current.with(idx, { ...current[idx], color });
}

export function setPolygonName(current: Selection[], key: string, name: string): Selection[] {
	return current.map((s) => {
		if (s.key !== key || s.props.type !== "Polygon") return s;
		const props: SelectionProps = {
			...s.props,
			polygon: { ...s.props.polygon, properties: { ...s.props.polygon.properties, name } },
		};
		return { ...s, props };
	});
}
