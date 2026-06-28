import type { Tag, VirtualTag } from "@/bindings.gen";
import type { TagSortMode } from "@/types";

export interface TagTreeNode {
	segment: string;
	fullPath: string;
	tag: Tag | null;
	inheritedColor: string;
	children: TagTreeNode[];
	descendantTagIds: number[];
	/** Min `order` across descendant tags — used for "default" sort parity with flat mode. */
	sortOrder: number;
}

/** A terminal tag — no children — renders as a flat pill, not a folder row. A childless
 *  node always carries a tag (it's where some tag's path ends); the `tag` guard only
 *  matters for the transient tagless nodes that filtering can leave behind. */
export const isLeafTag = (n: TagTreeNode) => n.children.length === 0 && n.tag != null;

export function sumCounts(node: TagTreeNode, tagCounts: Record<number, number>): number {
	let total = node.tag ? (tagCounts[node.tag.id] ?? 0) : 0;
	for (const child of node.children) total += sumCounts(child, tagCounts);
	return total;
}

/** Build the nested tag tree from `/`-delimited tag names. Within each level, leaf tags
 *  are floated above sub-branches so they render as a flat pill group above folder rows.
 *  `virtualTags` colors folder nodes that have no underlying tag (keyed by full path). */
export function buildTagTree(
	tags: Tag[],
	sortMode: TagSortMode,
	tagCounts: Record<number, number>,
	virtualTags: Record<string, VirtualTag> = {},
): TagTreeNode[] {
	const root: TagTreeNode[] = [];

	for (const tag of tags) {
		const parts = tag.name.split("/");
		let level = root;
		let pathSoFar = "";

		for (let i = 0; i < parts.length; i++) {
			const segment = parts[i];
			pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
			const isLeaf = i === parts.length - 1;

			let existing = level.find((n) => n.segment === segment);
			if (!existing) {
				existing = {
					segment,
					fullPath: pathSoFar,
					tag: isLeaf ? tag : null,
					inheritedColor: "",
					children: [],
					descendantTagIds: [],
					sortOrder: 0,
				};
				level.push(existing);
			} else if (isLeaf && !existing.tag) {
				existing.tag = tag;
			}

			level = existing.children;
		}
	}

	function propagateColor(nodes: TagTreeNode[], parentColor: string | null) {
		for (const node of nodes) {
			// Real tag color wins; otherwise a virtual-tag color for this path; else inherit.
			const ownColor = node.tag?.color ?? virtualTags[node.fullPath]?.color ?? null;
			const effectiveColor = ownColor ?? parentColor ?? "#888888";
			node.inheritedColor = effectiveColor;
			propagateColor(node.children, effectiveColor);
		}
	}

	function collectMeta(node: TagTreeNode): { ids: number[]; minOrder: number } {
		const ids: number[] = [];
		let minOrder = node.tag?.order ?? Number.POSITIVE_INFINITY;
		if (node.tag) ids.push(node.tag.id);
		for (const child of node.children) {
			const c = collectMeta(child);
			ids.push(...c.ids);
			if (c.minOrder < minOrder) minOrder = c.minOrder;
		}
		node.descendantTagIds = ids;
		node.sortOrder = minOrder === Number.POSITIVE_INFINITY ? 0 : minOrder;
		return { ids, minOrder: node.sortOrder };
	}

	// Mirror flat-mode ordering (name / amount / default), recursively per level.
	// `segment` is the name tiebreaker so output is deterministic in every mode.
	// Then float leaf tags above sub-branches at each level: leaves render as a flat
	// pill group and branches as folder rows below them (the userscript's structure).
	function sortNodes(nodes: TagTreeNode[]) {
		nodes.sort((a, b) => {
			if (sortMode === "amount") {
				const d = sumCounts(b, tagCounts) - sumCounts(a, tagCounts);
				if (d !== 0) return d;
			} else if (sortMode === "default") {
				const d = a.sortOrder - b.sortOrder;
				if (d !== 0) return d;
			}
			return a.segment.localeCompare(b.segment);
		});
		const leaves = nodes.filter((n) => n.children.length === 0);
		const branches = nodes.filter((n) => n.children.length > 0);
		if (leaves.length > 0 && branches.length > 0) {
			nodes.splice(0, nodes.length, ...leaves, ...branches);
		}
		for (const node of nodes) sortNodes(node.children);
	}

	propagateColor(root, null);
	for (const node of root) collectMeta(node);
	sortNodes(root);

	return root;
}

/** Tag ids to toggle for a shift-click range over the tree's visible rows. Unions the
 *  descendant ids of every row in the [anchor, target] span, de-duped, but excludes the
 *  anchor's own descendants — those were selected by the anchor click, and (when the anchor
 *  is an expanded parent) its child rows sit inside the span, so toggling them would undo it. */
export function rangeToggleTagIds(
	rows: { descendantTagIds: number[] }[],
	anchorIdx: number,
	targetIdx: number,
): number[] {
	const lo = Math.min(anchorIdx, targetIdx);
	const hi = Math.max(anchorIdx, targetIdx);
	const exclude = new Set(rows[anchorIdx].descendantTagIds);
	const ids = new Set<number>();
	for (let i = lo; i <= hi; i++) {
		for (const id of rows[i].descendantTagIds) {
			if (!exclude.has(id)) ids.add(id);
		}
	}
	return [...ids];
}

export interface TagNameChange {
	id: number;
	name: string;
}

/** Rewrite the path prefix `oldPrefix` -> `newPrefix` across every tag and virtual-tag
 *  key whose path is `oldPrefix` itself or sits under it (`oldPrefix/...`). Used to rename
 *  a tag-tree folder and cascade to its descendants. Returns the tag renames plus the
 *  rewritten virtualTags map. Collisions (target path already exists) just merge -- last
 *  write wins -- which is the intended folder-merge behavior. */
export function cascadeRename(
	oldPrefix: string,
	newPrefix: string,
	tags: Tag[],
	virtualTags: Record<string, VirtualTag>,
): { tagRenames: TagNameChange[]; virtualTags: Record<string, VirtualTag> } {
	const moved = newPrefix !== oldPrefix;
	const rewrite = (s: string): string | null => {
		if (!moved) return null;
		if (s === oldPrefix) return newPrefix;
		if (s.startsWith(`${oldPrefix}/`)) return newPrefix + s.slice(oldPrefix.length);
		return null;
	};

	const tagRenames: TagNameChange[] = [];
	for (const t of tags) {
		const next = rewrite(t.name);
		if (next !== null && next !== t.name) tagRenames.push({ id: t.id, name: next });
	}

	const nextVirtual: Record<string, VirtualTag> = {};
	for (const [path, cfg] of Object.entries(virtualTags)) {
		nextVirtual[rewrite(path) ?? path] = cfg;
	}

	return { tagRenames, virtualTags: nextVirtual };
}

interface OrderNode {
	fullPath: string;
	tag: { id: number } | null;
	children: OrderNode[];
}

function parentPathOf(path: string): string {
	const i = path.lastIndexOf("/");
	return i === -1 ? "" : path.slice(0, i);
}

function siblingsAt<T extends OrderNode>(tree: T[], parent: string): T[] {
	if (parent === "") return tree;
	let result: T[] = tree;
	const find = (arr: T[]): boolean => {
		for (const n of arr) {
			if (n.fullPath === parent) {
				result = n.children as T[];
				return true;
			}
			if (find(n.children as T[])) return true;
		}
		return false;
	};
	find(tree);
	return result;
}

/** Full DFS tag-id order reflecting an in-level move of `dragPath` to before/after
 *  `dropPath`. Returns null if the two paths aren't siblings (same parent) or aren't found.
 *  Every other node keeps its relative order; the moved node carries its whole subtree. */
export function reorderSiblingsFlatOrder<T extends OrderNode>(
	tree: T[],
	dragPath: string,
	dropPath: string,
	position: "before" | "after",
): number[] | null {
	const parent = parentPathOf(dragPath);
	if (dragPath === dropPath || parentPathOf(dropPath) !== parent) return null;

	const siblings = siblingsAt(tree, parent);
	const dragNode = siblings.find((n) => n.fullPath === dragPath);
	const targetNode = siblings.find((n) => n.fullPath === dropPath);
	if (!dragNode || !targetNode) return null;

	const without = siblings.filter((n) => n !== dragNode);
	let idx = without.indexOf(targetNode);
	if (idx === -1) return null;
	if (position === "after") idx++;
	without.splice(idx, 0, dragNode);

	const out: number[] = [];
	const dfs = (nodes: OrderNode[], cur: string) => {
		const ordered = cur === parent ? without : nodes;
		for (const n of ordered) {
			if (n.tag) out.push(n.tag.id);
			dfs(n.children, n.fullPath);
		}
	};
	dfs(tree, "");
	return out;
}
