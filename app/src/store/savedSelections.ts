import type { Selection, SelectionProps, PolygonGeometry, FilterOp } from "@/bindings.gen";
import { buildSelection } from "./selections";
import { getSettings, setSetting } from "./settings";
import { addSelections, getTag, getVisibleTags } from "./useMapStore";
import { cmd } from "@/lib/commands";

export interface SavedSelectionItem {
	props: SavedSelectionProps;
	color: [number, number, number];
}

export interface SavedSelection {
	id: string;
	name: string;
	items: SavedSelectionItem[];
	createdAt: number;
}

export type SavedSelectionProps =
	| { type: "Everything" }
	| { type: "Polygon"; polygon: PolygonGeometry; includeInformational: boolean }
	| { type: "TagName"; tagName: string }
	| { type: "Untagged" }
	| { type: "Unpanned" }
	| { type: "PanoIds" }
	| { type: "NotPanoIds" }
	| { type: "Uncommitted" }
	| { type: "Duplicates"; distance: number }
	| { type: "Filter"; field: string; op: FilterOp; value: unknown; value2?: unknown }
	| { type: "TopK"; field: string; k: number; ascending: boolean }
	| { type: "Intersection"; selections: SavedSelectionProps[] }
	| { type: "Union"; selections: SavedSelectionProps[] }
	| { type: "Invert"; selections: SavedSelectionProps[] };

export function selectionToSaved(sel: Selection): SavedSelectionProps | null {
	return propsToSaved(sel.props);
}

function propsToSaved(props: SelectionProps): SavedSelectionProps | null {
	switch (props.type) {
		case "Locations":
		case "Manual":
		case "ValidationState":
			return null;

		case "Tag": {
			const tag = getTag(props.tagId);
			if (!tag) return null;
			return { type: "TagName", tagName: tag.name };
		}

		case "Intersection":
		case "Union":
		case "Invert": {
			const children = props.selections
				.map((child) => propsToSaved(child.props))
				.filter((c): c is SavedSelectionProps => c !== null);
			if (children.length === 0) return null;
			return { type: props.type, selections: children };
		}

		default:
			return props as SavedSelectionProps;
	}
}

/** Visible tags only — a saved selection must not resurrect a soft-deleted ghost. */
function resolveTagByName(tagName: string): number | null {
	const lower = tagName.toLowerCase();
	for (const tag of getVisibleTags()) {
		if (tag.name.toLowerCase() === lower) return tag.id;
	}
	return null;
}

/** Resolve a saved rule against the open map, or null when it no longer applies
 *  (e.g. the tag name doesn't exist here). */
export function savedToSelectionProps(saved: SavedSelectionProps): SelectionProps | null {
	switch (saved.type) {
		case "TagName": {
			const tagId = resolveTagByName(saved.tagName);
			if (tagId === null) return null;
			return { type: "Tag", tagId };
		}

		case "Intersection":
		case "Union":
		case "Invert": {
			const children = saved.selections
				.map((child) => savedToSelectionProps(child))
				.filter((c): c is SelectionProps => c !== null);
			if (children.length === 0) return null;
			const builtChildren = children.map((p) => buildSelection(p));
			return { type: saved.type, selections: builtChildren };
		}

		default:
			return saved as SelectionProps;
	}
}

// Resolution

/** Resolve a saved selection to the union of its items' matching location ids. */
export async function resolveSavedSelectionIds(id: string): Promise<Set<number>> {
	const ids = new Set<number>();
	const saved = getSavedSelections().find((s) => s.id === id);
	if (saved) {
		const propsList = saved.items
			.map((item) => savedToSelectionProps(item.props))
			.filter((p): p is SelectionProps => p !== null);
		const resolved = await Promise.all(propsList.map((p) => cmd.storeResolveSelection(p)));
		for (const arr of resolved) for (const locId of arr) ids.add(locId);
	}
	return ids;
}

// Display

/** Short human-readable description of a saved-selection rule. */
export function describeRule(props: SavedSelectionProps): string {
	switch (props.type) {
		case "Everything":
			return "All";
		case "Polygon":
			return props.polygon.properties?.name || "Polygon";
		case "TagName":
			return `Tag: ${props.tagName}`;
		case "Untagged":
			return "Untagged";
		case "Unpanned":
			return "Unpanned";
		case "PanoIds":
			return "Has Pano ID";
		case "NotPanoIds":
			return "No Pano ID";
		case "Uncommitted":
			return "Uncommitted";
		case "Duplicates":
			return `Dupes (${props.distance}m)`;
		case "Filter":
			return `${props.field} ${props.op} ${String(props.value)}`;
		case "TopK":
			return `${props.ascending ? "Bottom" : "Top"} ${props.k} by ${props.field}`;
		case "Intersection":
			return props.selections.map(describeRule).join(" AND ");
		case "Union":
			return props.selections.map(describeRule).join(" OR ");
		case "Invert":
			return `NOT (${props.selections.map(describeRule).join(", ")})`;
	}
}

// CRUD

/** All saved selection rules (global, name-based; shared across maps). */
export function getSavedSelections(): SavedSelection[] {
	return getSettings().savedSelections;
}

export function saveCurrentSelections(name: string, selections: Selection[]): boolean {
	const items: SavedSelectionItem[] = [];
	for (const sel of selections) {
		const props = selectionToSaved(sel);
		if (props) items.push({ props, color: sel.color });
	}
	if (items.length === 0) return false;

	const entry: SavedSelection = {
		id: crypto.randomUUID(),
		name,
		items,
		createdAt: Date.now(),
	};
	setSetting("savedSelections", [...getSavedSelections(), entry]);
	return true;
}

export function deleteSavedSelection(id: string): void {
	setSetting(
		"savedSelections",
		getSavedSelections().filter((s) => s.id !== id),
	);
}

export function applySavedSelection(saved: SavedSelection): number {
	const batch: SelectionProps[] = [];
	for (const item of saved.items) {
		const props = savedToSelectionProps(item.props);
		if (props) batch.push(props);
	}
	if (batch.length > 0) addSelections(batch);
	return batch.length;
}
