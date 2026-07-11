import type { Tag, VirtualTag } from "@/bindings.gen";
import type { TagSortMode } from "@/types";

export interface TagTreeNode {
	segment: string;
	fullPath: string;
	/** Structural parent path ("" at root). Never derive this by splitting fullPath on "/" --
	 *  in no-split mode a tag name containing "/" is a single segment. */
	parentPath: string;
	tag: Tag | null;
	inheritedColor: string;
	children: TagTreeNode[];
	descendantTagIds: number[];
	/** Min `order` across descendant tags — used for "default" sort parity with flat mode. */
	sortOrder: number;
	/** A synthetic leaf placing a real tag at a second tree location. Reuses `tag`, but is
	 *  not draggable and never contributes its id to reorder (the real leaf owns that). */
	isAlias: boolean;
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
 *  `virtualTags` colors folder nodes that have no underlying tag (keyed by full path).
 *  `split: false` renders the flat view: each tag name is a single leaf ("/" is literal
 *  text, no folders), and aliases/virtualTags don't apply. */
export function buildTagTree(
	tags: Tag[],
	sortMode: TagSortMode,
	tagCounts: Record<number, number>,
	virtualTags: Record<string, VirtualTag> = {},
	aliases: Record<string, number> = {},
	split = true,
): TagTreeNode[] {
	const root: TagTreeNode[] = [];

	for (const tag of tags) {
		const parts = split ? tag.name.split("/") : [tag.name];
		let level = root;
		let pathSoFar = "";

		for (let i = 0; i < parts.length; i++) {
			const segment = parts[i];
			const parentPath = pathSoFar;
			pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
			const isLeaf = i === parts.length - 1;

			let existing = level.find((n) => n.segment === segment);
			if (!existing) {
				existing = {
					segment,
					fullPath: pathSoFar,
					parentPath,
					tag: isLeaf ? tag : null,
					inheritedColor: "",
					children: [],
					descendantTagIds: [],
					sortOrder: 0,
					isAlias: false,
				};
				level.push(existing);
			} else if (isLeaf && !existing.tag) {
				existing.tag = tag;
			}

			level = existing.children;
		}
	}

	// Insert alias leaves: a real tag placed at a second path. Skip a dangling alias
	// (tag deleted) or one whose path is already occupied by any real node — an alias only
	// fills a free leaf slot, never clobbers (and never leaves a stray empty folder).
	if (split) {
		const tagById = new Map(tags.map((t) => [t.id, t]));
		const resolve = (path: string): TagTreeNode | null => {
			let level = root;
			let found: TagTreeNode | null = null;
			for (const segment of path.split("/")) {
				found = level.find((n) => n.segment === segment) ?? null;
				if (!found) return null;
				level = found.children;
			}
			return found;
		};
		for (const [aliasPath, tagId] of Object.entries(aliases)) {
			const tag = tagById.get(tagId);
			if (!tag || resolve(aliasPath)) continue;
			const parts = aliasPath.split("/");
			let level = root;
			let pathSoFar = "";
			for (let i = 0; i < parts.length; i++) {
				const segment = parts[i];
				const parentPath = pathSoFar;
				pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
				const isLeaf = i === parts.length - 1;
				let existing = level.find((n) => n.segment === segment);
				if (!existing) {
					existing = {
						segment,
						fullPath: pathSoFar,
						parentPath,
						tag: isLeaf ? tag : null,
						inheritedColor: "",
						children: [],
						descendantTagIds: [],
						sortOrder: 0,
						isAlias: isLeaf,
					};
					level.push(existing);
				}
				level = existing.children;
			}
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

/** Map each `/`-delimited name to the shortest trailing path-segment run that uniquely
 *  identifies it within `names`. A name with no collision collapses to its last segment;
 *  one whose suffix is shared widens until distinct, falling back to the full path. */
export function shortestUniqueSuffixes(names: string[]): Map<string, string> {
	const parts = names.map((n) => n.split("/"));
	const out = new Map<string, string>();
	for (let i = 0; i < names.length; i++) {
		const p = parts[i];
		let depth = 1;
		let suffix = p.slice(-depth).join("/");
		while (
			depth < p.length &&
			parts.some((other, j) => j !== i && other.slice(-depth).join("/") === suffix)
		) {
			depth++;
			suffix = p.slice(-depth).join("/");
		}
		out.set(names[i], suffix);
	}
	return out;
}

export interface TagNameChange {
	id: number;
	name: string;
}

const leafOf = (name: string) => name.split("/").pop() ?? name;

/** An alias leaf displays its path's last segment, fixed at creation from the tag's leaf
 *  name. When a tag's leaf name changes, rewrite the last segment of every alias key
 *  pointing at it so the alias keeps showing the tag's name. Returns null when no alias
 *  changed. Collisions merge last-write-wins, same as cascadeRename. */
export function syncAliasSegments(
	aliases: Record<string, number>,
	renames: { id: number; oldName: string; newName: string }[],
): Record<string, number> | null {
	const byId = new Map(
		renames.filter((r) => leafOf(r.oldName) !== leafOf(r.newName)).map((r) => [r.id, r]),
	);
	if (byId.size === 0) return null;
	let changed = false;
	const next: Record<string, number> = {};
	for (const [path, id] of Object.entries(aliases)) {
		const r = byId.get(id);
		if (r) {
			const parts = path.split("/");
			parts[parts.length - 1] = leafOf(r.newName);
			next[parts.join("/")] = id;
			changed = true;
		} else {
			next[path] = id;
		}
	}
	return changed ? next : null;
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
	aliases: Record<string, number> = {},
): {
	tagRenames: TagNameChange[];
	virtualTags: Record<string, VirtualTag>;
	aliases: Record<string, number>;
} {
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

	// Alias keys are tree paths too — move any sitting at or under the renamed folder.
	let nextAliases: Record<string, number> = {};
	for (const [path, id] of Object.entries(aliases)) {
		nextAliases[rewrite(path) ?? path] = id;
	}

	// Only the tag at exactly `oldPrefix` gets a new leaf segment (descendants keep
	// theirs), so aliases pointing at it need their displayed segment synced too.
	const rootTag = moved ? tags.find((t) => t.name === oldPrefix) : undefined;
	if (rootTag) {
		nextAliases =
			syncAliasSegments(nextAliases, [
				{ id: rootTag.id, oldName: oldPrefix, newName: newPrefix },
			]) ?? nextAliases;
	}

	return { tagRenames, virtualTags: nextVirtual, aliases: nextAliases };
}

interface OrderNode {
	fullPath: string;
	tag: { id: number } | null;
	children: OrderNode[];
	isAlias?: boolean;
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
 *  `dropPath`. `parent` is the drag node's structural parentPath ("" at root) -- it can't
 *  be derived from the path string, which may contain literal "/" in no-split mode.
 *  Returns null if the two paths aren't siblings under `parent` or aren't found.
 *  Every other node keeps its relative order; the moved node carries its whole subtree. */
export function reorderSiblingsFlatOrder<T extends OrderNode>(
	tree: T[],
	dragPath: string,
	dropPath: string,
	position: "before" | "after",
	parent: string,
): number[] | null {
	if (dragPath === dropPath) return null;

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
			if (n.tag && !n.isAlias) out.push(n.tag.id); // alias leaves don't own the id
			dfs(n.children, n.fullPath);
		}
	};
	dfs(tree, "");
	return out;
}
