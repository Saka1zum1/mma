// Selection disambiguation engine: given N groups of locations, rank metadata
// fields by how strongly they *separate* the groups (not by modal frequency).
// Pure and store-free; tested in engine.test.ts.

import type { CountBy, ComparisonType, ExtraFieldDef, Location, Selector } from "@/bindings.gen";
import { buildSelection } from "@/store/selections";
import {
	getFieldDef,
	fieldValueLabel,
	isWritableField,
	getBuiltinKeys,
} from "@/lib/data/fieldDefRegistry";
import { fieldValue } from "@/lib/data/fieldOps";
import { ymOrdinal } from "@/lib/util/date";
import { t, msg } from "@/lib/i18n";
import {
	kruskalEps2,
	circularEta2,
	circularSummary,
	cramersV,
	coverageV,
	quartiles,
} from "./stats";

/** A group must have at least this many present values for a field before its
 *  value score is trusted; below this the field is flagged low-confidence. */
const MIN_PRESENT = 8;
/** How many top categories to surface per group in a categorical summary. */
const TOP_N = 3;
/** Fields excluded from analysis: they encode the location/answer itself rather
 *  than an in-round visual tell, so flagging them as "divergent" is pointless. */
const EXCLUDED_FIELDS = new Set(["countryCode", "timezone", "panoId"]);

/** The field carrying each location's tag ids. */
export const TAGS_COLUMN = "tags";

/** One group's size and, per analyzed field, its value counts. */
export interface GroupCounts {
	size: number;
	counts: Record<string, CountBy>;
}

/** Each group narrowed to the locations no other group holds. */
export function exclusiveGroups(selectors: Selector[]): Selector[] {
	return selectors.map((s, i) => {
		const others = selectors.filter((_, j) => j !== i);
		if (others.length === 0) return s;
		const rest: Selector =
			others.length === 1
				? others[0]
				: { type: "Union", selections: others.map((o) => buildSelection(o)) };
		return {
			type: "Intersection",
			selections: [
				buildSelection(s),
				buildSelection({ type: "Invert", selections: [buildSelection(rest)] }),
			],
		};
	});
}

export type ValueFormat = "number" | "month" | "dateTime";

export interface TopValue {
	label: string;
	freq: number;
}

export interface GroupSummary {
	n: number;
	present: number;
	median: number | null;
	p25: number | null;
	p75: number | null;
	meanDeg: number | null;
	concentration: number | null;
	top: TopValue[];
}

export interface FieldDivergence {
	key: string;
	label: string;
	comparison: ComparisonType;
	format: ValueFormat;
	/** How strongly the field's values separate the groups, [0,1]. `null` when
	 *  fewer than two groups have any present values. */
	valueScore: number | null;
	/** How strongly field *presence* (vs absence) separates the groups, [0,1]. */
	coverageScore: number;
	/** True when at least one group has too few present values to trust valueScore. */
	lowConfidence: boolean;
	groups: GroupSummary[];
}

export interface DisambiguateResult {
	fields: FieldDivergence[];
	groupSizes: number[];
}

/** A location tagged with the index of the single group it belongs to. */
export type Labeled = { group: number; loc: Location };

/** Which single group a row belongs to across per-group membership sets:
 *  the group index for exactly one, `null` for none, `"overlap"` for more than one. */
export function soleGroup(masks: Set<number>[], id: number): number | null | "overlap" {
	let found: number | null = null;
	for (let gi = 0; gi < masks.length; gi++) {
		if (masks[gi].has(id)) {
			if (found !== null) return "overlap";
			found = gi;
		}
	}
	return found;
}

function emptyGroup(n: number, present: number): GroupSummary {
	return {
		n,
		present,
		median: null,
		p25: null,
		p75: null,
		meanDeg: null,
		concentration: null,
		top: [],
	};
}

/** Resolve how a field is compared. An explicit `comparison` on the def wins;
 *  otherwise inferred from `type`. */
export function resolvedComparison(def: ExtraFieldDef | undefined): ComparisonType {
	if (def?.comparison) return def.comparison;
	switch (def?.type) {
		case "number":
		case "date":
		case "month":
			return { type: "linear" };
		default:
			return { type: "categorical" };
	}
}

/** Infer a field type from a sample value: numbers -> number, `YYYY-MM` -> month, else string. */
function inferFieldType(value: unknown): ExtraFieldDef["type"] {
	if (typeof value === "number") return "number";
	if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) return "month";
	return "string";
}

function fieldLabel(key: string, def: ExtraFieldDef | undefined): string {
	if (def?.label) return def.label;
	if (key === "heading") return msg("Heading");
	if (key === "pitch") return msg("Pitch");
	if (key === "zoom") return msg("Zoom");
	return key;
}

function isLowConfidence(present: number[]): boolean {
	return present.some((p) => p < MIN_PRESENT);
}

function countedNumber(value: string, def: ExtraFieldDef | undefined): number | null {
	if (def?.type === "month") return ymOrdinal(value);
	const n = Number(value);
	if (value !== "" && Number.isFinite(n)) return n;
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : ms / 1000;
}

function expandNumbers(
	counts: [string, number][] | undefined,
	def: ExtraFieldDef | undefined,
): number[] {
	const out: number[] = [];
	for (const [value, count] of counts ?? []) {
		const n = countedNumber(value, def);
		if (n === null) continue;
		for (let i = 0; i < count; i++) out.push(n);
	}
	return out;
}

function numericFieldFromCounts(
	key: string,
	groups: GroupCounts[],
	groupSizes: number[],
	comparison: ComparisonType,
	def: ExtraFieldDef | undefined,
): FieldDivergence {
	const perGroup = groups.map((g) => expandNumbers(g.counts[key]?.counts, def));
	const present = perGroup.map((v) => v.length);
	const valueScore =
		comparison.type === "circular"
			? circularEta2(perGroup, comparison.period)
			: kruskalEps2(perGroup);
	const coverageScore = coverageV(groupSizes, present);
	const lowConfidence = isLowConfidence(present);
	const summaries: GroupSummary[] = perGroup.map((vals, g) => {
		const s = emptyGroup(groupSizes[g], vals.length);
		if (vals.length > 0) {
			if (comparison.type === "circular") {
				const { mean, concentration } = circularSummary(vals, comparison.period);
				s.meanDeg = mean;
				s.concentration = concentration;
			} else {
				const [p25, median, p75] = quartiles(vals);
				s.p25 = p25;
				s.median = median;
				s.p75 = p75;
			}
		}
		return s;
	});
	const format: ValueFormat =
		def?.type === "month" ? "month" : def?.type === "date" ? "dateTime" : "number";
	return {
		key,
		label: fieldLabel(key, def),
		comparison,
		format,
		valueScore,
		coverageScore,
		lowConfidence,
		groups: summaries,
	};
}

function categoricalFromCounts(
	key: string,
	groups: GroupCounts[],
	groupSizes: number[],
	def: ExtraFieldDef | undefined,
): FieldDivergence {
	const perGroup = groups.map((g) => new Map(g.counts[key]?.counts ?? []));
	const present = groups.map((g) => g.counts[key]?.covered ?? 0);
	const valueScore = cramersV(perGroup);
	const coverageScore = coverageV(groupSizes, present);
	const lowConfidence = isLowConfidence(present);
	const summaries: GroupSummary[] = perGroup.map((counts, g) => {
		const s = emptyGroup(groupSizes[g], present[g]);
		if (present[g] > 0) {
			const pairs = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
			s.top = pairs.slice(0, TOP_N).map(([val, c]) => ({
				label: fieldValueLabel(def, val),
				freq: c / present[g],
			}));
		}
		return s;
	});
	return {
		key,
		label: fieldLabel(key, def),
		comparison: { type: "categorical" },
		format: "number",
		valueScore,
		coverageScore,
		lowConfidence,
		groups: summaries,
	};
}

function tagFromCounts(
	tid: string,
	groups: GroupCounts[],
	groupSizes: number[],
	tagNames: Record<number, string>,
): FieldDivergence {
	const perGroup = groups.map((g, i) => {
		const tagged = new Map(g.counts[TAGS_COLUMN]?.counts ?? []).get(tid) ?? 0;
		return new Map([
			["yes", tagged],
			["no", groupSizes[i] - tagged],
		]);
	});
	const label = tagNames[Number(tid)] ?? t("Tag {id}", { id: tid });
	const valueScore = cramersV(perGroup);
	const coverageScore = coverageV(groupSizes, groupSizes);
	const groupsOut: GroupSummary[] = perGroup.map((counts, g) => {
		const s = emptyGroup(groupSizes[g], groupSizes[g]);
		const pairs = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
		s.top = pairs.slice(0, TOP_N).map(([val, c]) => ({
			label: fieldValueLabel(undefined, val),
			freq: groupSizes[g] > 0 ? c / groupSizes[g] : 0,
		}));
		return s;
	});
	return {
		key: `tag:${tid}`,
		label,
		comparison: { type: "categorical" },
		format: "number",
		valueScore,
		coverageScore,
		lowConfidence: isLowConfidence(groupSizes),
		groups: groupsOut,
	};
}

function sampleDefFromCounts(key: string, groups: GroupCounts[]): ExtraFieldDef | undefined {
	for (const g of groups) {
		const first = g.counts[key]?.counts[0]?.[0];
		if (first != null)
			return {
				type: inferFieldType(
					Number.isFinite(Number(first)) && !/^\d{4}-\d{2}$/.test(first) ? Number(first) : first,
				),
			};
	}
	return undefined;
}

/** Rank the fields counted in `groups` by how strongly they separate the groups. */
export function divergenceFromCounts(
	groups: GroupCounts[],
	fieldDefs: Record<string, ExtraFieldDef>,
	tagNames: Record<number, string>,
): DisambiguateResult {
	const groupSizes = groups.map((g) => g.size);
	const fields: FieldDivergence[] = [];
	const keys = new Set<string>();
	for (const g of groups) for (const k of Object.keys(g.counts)) keys.add(k);
	keys.delete(TAGS_COLUMN);
	for (const k of EXCLUDED_FIELDS) keys.delete(k);

	const builtins = getBuiltinKeys().filter((k) => keys.has(k) && isWritableField(k));
	const extras = [...keys].filter((k) => !builtins.includes(k)).sort();
	for (const key of [...builtins, ...extras]) {
		const def = fieldDefs[key] ?? getFieldDef(key) ?? sampleDefFromCounts(key, groups);
		const comparison = resolvedComparison(def);
		if (comparison.type === "categorical") {
			fields.push(categoricalFromCounts(key, groups, groupSizes, def));
		} else {
			fields.push(numericFieldFromCounts(key, groups, groupSizes, comparison, def));
		}
	}

	const tagIds = new Set<string>();
	for (const g of groups) for (const [tid] of g.counts[TAGS_COLUMN]?.counts ?? []) tagIds.add(tid);
	for (const tid of [...tagIds].sort((a, b) => Number(a) - Number(b))) {
		fields.push(tagFromCounts(tid, groups, groupSizes, tagNames));
	}

	fields.sort((a, b) => sortKey(b) - sortKey(a));
	return { fields, groupSizes };
}

function addCount(group: GroupCounts, key: string, value: string) {
	let bucket = group.counts[key];
	if (!bucket) group.counts[key] = bucket = { counts: [], covered: 0 };
	const hit = bucket.counts.find((c) => c[0] === value);
	if (hit) hit[1]++;
	else bucket.counts.push([value, 1]);
}

function notePresent(group: GroupCounts, key: string) {
	let bucket = group.counts[key];
	if (!bucket) group.counts[key] = bucket = { counts: [], covered: 0 };
	bucket.covered++;
}

/** The value counts `computeDivergence` used to derive by walking locations. */
function countsFromLabeled(labeled: Labeled[], numGroups: number): GroupCounts[] {
	const groups: GroupCounts[] = Array.from({ length: numGroups }, () => ({ size: 0, counts: {} }));
	const builtins = getBuiltinKeys().filter(isWritableField);
	for (const { group, loc } of labeled) {
		const g = groups[group];
		g.size++;
		for (const key of builtins) {
			if (EXCLUDED_FIELDS.has(key)) continue;
			const text = countedText(fieldValue(loc, key));
			if (text === null) continue;
			notePresent(g, key);
			addCount(g, key, text);
		}
		if (loc.extra) {
			for (const key of Object.keys(loc.extra)) {
				if (EXCLUDED_FIELDS.has(key)) continue;
				const text = countedText(loc.extra[key]);
				if (text === null) continue;
				notePresent(g, key);
				addCount(g, key, text);
			}
		}
		if (loc.tags.length > 0) notePresent(g, TAGS_COLUMN);
		for (const tid of loc.tags) addCount(g, TAGS_COLUMN, String(tid));
	}
	return groups;
}

function countedText(v: unknown): string | null {
	if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
	if (typeof v === "string") return v === "" ? null : v;
	if (typeof v === "boolean") return String(v);
	return null;
}

function sortKey(f: FieldDivergence): number {
	if (f.valueScore !== null && !f.lowConfidence) return 1 + f.valueScore;
	return f.coverageScore;
}

/** Rank metadata fields by how strongly they separate `numGroups` labeled groups. */
export function computeDivergence(
	labeled: Labeled[],
	numGroups: number,
	fieldDefs: Record<string, ExtraFieldDef>,
	tagNames: Record<number, string>,
): DisambiguateResult {
	return divergenceFromCounts(countsFromLabeled(labeled, numGroups), fieldDefs, tagNames);
}
