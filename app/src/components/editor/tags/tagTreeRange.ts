import type { Tag, VirtualTag } from "@/bindings.gen";
import type { TagSortMode } from "@/types";
import type { TagFolderColorMode } from "@/store/settings";
import { colorForName } from "@/lib/util/color";
import { getLocal, setLocal } from "@/lib/hooks/useLocalStorage";

const EXPANDED_KEY = "tagTreeExpanded";

/** The sidebar's persisted expanded-folder set. Other tag-tree surfaces (e.g. the
 *  doclink assign dialog) read it to open matching the sidebar; only the sidebar writes. */
export function loadExpanded(): Set<string> {
	return new Set(getLocal<string[]>(EXPANDED_KEY, []));
}

export function saveExpanded(set: Set<string>) {
	setLocal(EXPANDED_KEY, [...set]);
}

export interface TagTreeNode {
	segment: string;
	fullPath: string;
	/** Structural parent path ("" at root). Never derive this by splitting fullPath on "/" --
	 *  in no-split mode a tag name containing "/" is a single segment. */
	parentPath: string;
	tag: Tag | null;
	inheritedColor: string;
	/** Row fill: solid hex or CSS `linear-gradient(...)` when folder color mode uses gradients. */
	rowBackground: string;
	children: TagTreeNode[];
	descendantTagIds: number[];
	/** Min `order` across descendant tags — used for "default" sort parity with flat mode.
	 *  MAX_SAFE_INTEGER for a subtree with no tags (declared empty folders), sorting it last. */
	sortOrder: number;
	/** A synthetic leaf placing a real tag at a second tree location. Reuses `tag`, but is
	 *  not draggable and never contributes its id to reorder (the real leaf owns that). */
	isAlias: boolean;
}

/** A terminal tag — no children — renders as a flat pill, not a folder row. A childless
 *  tagless node is a declared empty folder (a virtualTags key no tag passes through) and
 *  renders as a folder row; filtering can also leave transient tagless nodes behind. */
export const isLeafTag = (n: TagTreeNode) => n.children.length === 0 && n.tag != null;

/** Initial `virtualTags` entry when the user creates an empty folder. */
export function defaultVirtualFolderEntry(
	path: string,
	mode: TagFolderColorMode,
): VirtualTag {
	if (mode === "random") return { color: colorForName(path) };
	return {};
}

/** Every occupied tree path (tags, aliases, declared folders + all their ancestors) --
 *  mirrors buildTagTree's occupancy, so a free slot here is a free slot in the tree. */
export function collectOccupiedPaths(
	tags: Tag[],
	aliases: Record<string, number>,
	virtualTags: Record<string, VirtualTag>,
): Set<string> {
	const set = new Set<string>();
	const addPrefixes = (path: string) => {
		let p = "";
		for (const s of path.split("/")) {
			p = p ? `${p}/${s}` : s;
			set.add(p);
		}
	};
	for (const t of tags) addPrefixes(t.name);
	for (const k of Object.keys(aliases)) addPrefixes(k);
	for (const k of Object.keys(virtualTags)) addPrefixes(k);
	return set;
}

export function sumCounts(node: TagTreeNode, tagCounts: Record<number, number>): number {
	let total = node.tag ? (tagCounts[node.tag.id] ?? 0) : 0;
	for (const child of node.children) total += sumCounts(child, tagCounts);
	return total;
}

/** How a colorless folder row gets its color: `direct` uses `color` as-is; `firstChild`
 *  inherits the first own-colored descendant in display order, `color` as fallback. */
export interface FolderColorOpts {
	mode: TagFolderColorMode;
	color: string;
}
const DEFAULT_FOLDER_COLOR: FolderColorOpts = { mode: "direct", color: "#888888" };

/** Walk/create the node chain for `parts`, returning the leaf node. */
function ensurePath(root: TagTreeNode[], parts: string[]): TagTreeNode {
	let level = root;
	let pathSoFar = "";
	let node!: TagTreeNode;
	for (const segment of parts) {
		const parentPath = pathSoFar;
		pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
		let existing = level.find((n) => n.segment === segment);
		if (!existing) {
			existing = {
				segment,
				fullPath: pathSoFar,
				parentPath,
				tag: null,
				inheritedColor: "",
				rowBackground: "",
				children: [],
				descendantTagIds: [],
				sortOrder: 0,
				isAlias: false,
			};
			level.push(existing);
		}
		node = existing;
		level = existing.children;
	}
	return node;
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
	folderColor: FolderColorOpts = DEFAULT_FOLDER_COLOR,
): TagTreeNode[] {
	const root: TagTreeNode[] = [];
	const aliased = aliasedTagIds(aliases);

	for (const tag of tags) {
		if (aliased.has(tag.id)) continue;
		const leaf = ensurePath(root, split ? tag.name.split("/") : [tag.name]);
		if (!leaf.tag) leaf.tag = tag;
	}

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
			const leaf = ensurePath(root, aliasPath.split("/"));
			leaf.tag = tag;
			leaf.isAlias = true;
		}

		for (const path of Object.keys(virtualTags)) {
			ensurePath(root, path.split("/"));
		}
	} else if (Object.keys(aliases).length > 0) {
		const tagById = new Map(tags.map((t) => [t.id, t]));
		for (const [aliasPath, tagId] of Object.entries(aliases)) {
			const tag = tagById.get(tagId);
			if (!tag) continue;
			const leaf = ensurePath(root, [aliasPath]);
			if (!leaf.tag) {
				leaf.tag = tag;
				leaf.isAlias = true;
			}
		}
	}

	const ownColorOf = (node: TagTreeNode) =>
		node.tag?.color ?? virtualTags[node.fullPath]?.color ?? null;

	// First own-colored node in the (sorted) subtree, DFS in display order.
	function firstDescendantColor(node: TagTreeNode): string | null {
		const own = ownColorOf(node);
		if (own) return own;
		for (const child of node.children) {
			const color = firstDescendantColor(child);
			if (color) return color;
		}
		return null;
	}

	/** Leaf-tag colors under `node`, in display order (deduped). */
	function descendantLeafTagColors(node: TagTreeNode): string[] {
		const out: string[] = [];
		const seen = new Set<string>();
		const walk = (n: TagTreeNode) => {
			if (n.tag && isLeafTag(n)) {
				const c = n.tag.color;
				if (!seen.has(c)) {
					seen.add(c);
					out.push(c);
				}
			}
			for (const child of n.children) walk(child);
		};
		walk(node);
		return out;
	}

	function gradientFromTagColors(colors: string[]): string | null {
		if (colors.length === 0) return null;
		if (colors.length === 1) return colors[0];
		const stops = colors
			.map((c, i) => `${c} ${Math.round((i / (colors.length - 1)) * 100)}%`)
			.join(", ");
		return `linear-gradient(90deg, ${stops})`;
	}

	// Runs after sortNodes so firstChild mode sees children in display order.
	function propagateColor(nodes: TagTreeNode[], parentColor: string | null) {
		for (const node of nodes) {
			const ownColor = ownColorOf(node);
			let derived: string | null = ownColor;
			let rowBackground: string | null = null;

			if (!ownColor) {
				switch (folderColor.mode) {
					case "random":
						derived = colorForName(node.fullPath);
						break;
					case "firstChild":
						derived = firstDescendantColor(node);
						break;
					case "childGradient": {
						const cols = descendantLeafTagColors(node);
						const painted = gradientFromTagColors(cols);
						if (painted?.startsWith("linear-gradient")) {
							rowBackground = painted;
							derived = cols[0] ?? null;
						} else {
							derived = painted;
						}
						break;
					}
					default:
						break;
				}
			}

			const effectiveColor = derived ?? parentColor ?? folderColor.color;
			node.inheritedColor = effectiveColor;
			node.rowBackground = rowBackground ?? effectiveColor;
			propagateColor(node.children, effectiveColor);
		}
	}

	function collectMeta(node: TagTreeNode): { ids: number[]; minOrder: number } {
		const ids: number[] = [];
		let minOrder = node.tag?.order ?? Number.POSITIVE_INFINITY;
		if (node.tag && tagIdInDfsOrder(node, aliased)) ids.push(node.tag.id);
		for (const child of node.children) {
			const c = collectMeta(child);
			ids.push(...c.ids);
			if (c.minOrder < minOrder) minOrder = c.minOrder;
		}
		node.descendantTagIds = ids;
		node.sortOrder = minOrder === Number.POSITIVE_INFINITY ? Number.MAX_SAFE_INTEGER : minOrder;
		return { ids, minOrder: node.sortOrder };
	}

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
		const leaves = nodes.filter(isLeafTag);
		const branches = nodes.filter((n) => !isLeafTag(n));
		if (leaves.length > 0 && branches.length > 0) {
			nodes.splice(0, nodes.length, ...leaves, ...branches);
		}
		for (const node of nodes) sortNodes(node.children);
	}

	for (const node of root) collectMeta(node);
	sortNodes(root);
	propagateColor(root, null);

	return root;
}

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

export function buildTreePathLabels(
	tagNames: string[],
	folderPaths: string[],
	enabled: boolean,
	_aliasPaths: string[] = [],
): Map<string, string> | null {
	if (!enabled) return null;
	const all = new Set<string>();
	const addWithPrefixes = (path: string) => {
		if (!path) return;
		let p = "";
		for (const s of path.split("/")) {
			p = p ? `${p}/${s}` : s;
			all.add(p);
		}
	};
	for (const n of tagNames) addWithPrefixes(n);
	for (const n of folderPaths) addWithPrefixes(n);
	return shortestUniqueSuffixes([...all]);
}

export function treeNodeDisplayLabel(
	node: Pick<TagTreeNode, "tag" | "fullPath" | "segment" | "isAlias">,
	labels: Map<string, string> | null,
): string {
	// Aliased placements always label from the tag's canonical name, never the alias path.
	if (node.isAlias && node.tag) {
		if (!labels) return leafOf(node.tag.name);
		return labels.get(node.tag.name) ?? leafOf(node.tag.name);
	}
	// Truncation off: hierarchical tree already nests under folders, so the leaf
	// segment is enough. Truncation on: prefer the tree-path key (covers nested tags).
	if (!labels) return node.segment;
	return (
		labels.get(node.fullPath) ??
		(node.tag ? (labels.get(node.tag.name) ?? node.tag.name) : node.segment)
	);
}

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

/** Tag ids that appear under at least one folder alias — canonical tree slots are hidden. */
export function aliasedTagIds(aliases: Record<string, number>): Set<number> {
	return new Set(Object.values(aliases));
}

function tagIdInDfsOrder(node: TagTreeNode, aliased: ReadonlySet<number>): boolean {
	if (!node.tag) return false;
	if (node.isAlias) return true;
	return !aliased.has(node.tag.id);
}

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

/** Delete folder `prefix`: peel one path level from tags / settings under it
 *  (`A/x` → `x`, `A/B/y` → `B/y`), drop the folder's own virtualTags key, and
 *  remap deeper virtualTags / alias keys up one level. Nested structure is kept. */
export function stripFolderPrefix(
	prefix: string,
	tags: Tag[],
	virtualTags: Record<string, VirtualTag>,
	aliases: Record<string, number> = {},
): {
	tagRenames: TagNameChange[];
	virtualTags: Record<string, VirtualTag>;
	aliases: Record<string, number>;
} {
	const under = (s: string): boolean => s === prefix || s.startsWith(`${prefix}/`);
	const parentPrefix = prefix.includes("/") ? prefix.slice(0, prefix.lastIndexOf("/")) : "";

	const tagRenames: TagNameChange[] = [];
	for (const t of tags) {
		if (t.name.startsWith(`${prefix}/`)) {
			const suffix = t.name.slice(prefix.length + 1);
			const nextName = parentPrefix ? `${parentPrefix}/${suffix}` : suffix;
			if (nextName !== t.name) tagRenames.push({ id: t.id, name: nextName });
		}
	}

	const nextVirtual: Record<string, VirtualTag> = {};
	for (const [path, cfg] of Object.entries(virtualTags)) {
		if (!under(path)) {
			nextVirtual[path] = cfg;
		} else if (path !== prefix) {
			const suffix = path.slice(prefix.length + 1);
			const nextPath = parentPrefix ? `${parentPrefix}/${suffix}` : suffix;
			nextVirtual[nextPath] = cfg;
		}
	}

	const nextAliases: Record<string, number> = {};
	for (const [path, id] of Object.entries(aliases)) {
		if (!under(path)) {
			nextAliases[path] = id;
		} else if (path !== prefix) {
			const suffix = path.slice(prefix.length + 1);
			const nextPath = parentPrefix ? `${parentPrefix}/${suffix}` : suffix;
			nextAliases[nextPath] = id;
		}
	}

	return { tagRenames, virtualTags: nextVirtual, aliases: nextAliases };
}

/** Resolve a split-mode tree node by full path (paths are `/`-joined segments). */
function findByPath(tree: TagTreeNode[], path: string): TagTreeNode | null {
	for (const n of tree) {
		if (n.fullPath === path) return n;
		if (path.startsWith(`${n.fullPath}/`)) return findByPath(n.children, path);
	}
	return null;
}

function aliasLeafSegment(node: TagTreeNode): string {
	return node.tag ? leafOf(node.tag.name) : node.segment;
}

export function canDropInto(tree: TagTreeNode[], dragPaths: string[], targetPath: string): boolean {
	const target = findByPath(tree, targetPath);
	if (!target || isLeafTag(target) || target.isAlias) return false;
	const nodes = dragPaths.map((p) => findByPath(tree, p));
	if (nodes.length === 0 || nodes.some((n) => !n)) return false;
	const hasAlias = nodes.some((n) => n!.isAlias);
	const hasReal = nodes.some((n) => !n!.isAlias);
	if (hasAlias && hasReal) return false;
	if (dragPaths.some((p) => targetPath === p || targetPath.startsWith(`${p}/`))) return false;
	const childSegments = new Set(target.children.map((c) => c.segment));
	return !nodes.some(
		(n) => n!.parentPath !== targetPath && childSegments.has(aliasLeafSegment(n!)),
	);
}

export interface TagMoveResult {
	tagRenames: TagNameChange[];
	virtualTags: Record<string, VirtualTag>;
	aliases: Record<string, number>;
	/** Full DFS tag-id order with the block appended at the end of the target's children. */
	orderedIds: number[];
	/** Old -> new path for each moved branch, for remapExpanded. */
	pathRemaps: [string, string][];
}

/** Current DFS tag-id order. Alias leaves own ids when the canonical slot is suppressed. */
function dfsTagOrder(tree: TagTreeNode[], aliased: ReadonlySet<number>): number[] {
	const out: number[] = [];
	const walk = (level: TagTreeNode[]) => {
		for (const n of level) {
			if (tagIdInDfsOrder(n, aliased)) out.push(n.tag!.id);
			walk(n.children);
		}
	};
	walk(tree);
	return out;
}

/** Place each leaf under `targetPath` as an alias (Add Alias semantics). Real tags keep
 *  their names; existing aliases are rewritten to the new folder. */
function aliasLeavesIntoFolder(
	tags: Tag[],
	nodes: TagTreeNode[],
	targetPath: string,
	virtualTags: Record<string, VirtualTag>,
	aliases: Record<string, number>,
): TagMoveResult {
	const nextAliases = { ...aliases };
	for (const node of nodes) {
		const tag = node.tag!;
		const newPath = `${targetPath}/${aliasLeafSegment(node)}`;
		if (newPath === node.fullPath) continue;
		if (node.isAlias) delete nextAliases[node.fullPath];
		nextAliases[newPath] = tag.id;
	}
	const aliased = aliasedTagIds(nextAliases);
	const nextTree = buildTagTree(tags, "default", {}, virtualTags, nextAliases);
	return {
		tagRenames: [],
		virtualTags,
		aliases: nextAliases,
		orderedIds: dfsTagOrder(nextTree, aliased),
		pathRemaps: [],
	};
}

export function moveIntoFolder(
	tree: TagTreeNode[],
	dragPaths: string[],
	targetPath: string,
	tags: Tag[],
	virtualTags: Record<string, VirtualTag>,
	aliases: Record<string, number>,
): TagMoveResult | null {
	if (!canDropInto(tree, dragPaths, targetPath)) return null;
	const nodes = dragPaths.map((p) => findByPath(tree, p)!);

	// Leaf drops use alias semantics (including moving an existing alias to another folder).
	if (nodes.every(isLeafTag)) {
		return aliasLeavesIntoFolder(tags, nodes, targetPath, virtualTags, aliases);
	}

	// Block members are siblings (disjoint prefixes), so the cascades never overlap.
	let workingTags = tags;
	let workingVT = virtualTags;
	let workingAliases = aliases;
	const renameById = new Map<number, string>();
	const pathRemaps: [string, string][] = [];
	for (const node of nodes) {
		const newPath = `${targetPath}/${node.segment}`;
		const res = cascadeRename(node.fullPath, newPath, workingTags, workingVT, workingAliases);
		for (const r of res.tagRenames) renameById.set(r.id, r.name);
		workingTags = workingTags.map((t) => {
			const next = res.tagRenames.find((r) => r.id === t.id);
			return next ? { ...t, name: next.name } : t;
		});
		workingVT = res.virtualTags;
		workingAliases = res.aliases;
		if (node.children.length > 0) pathRemaps.push([node.fullPath, newPath]);
	}

	const dragSet = new Set(dragPaths);
	const orderedIds: number[] = [];
	const aliased = aliasedTagIds(workingAliases);
	const emitSubtree = (n: TagTreeNode) => {
		if (tagIdInDfsOrder(n, aliased)) orderedIds.push(n.tag!.id);
		for (const c of n.children) emitSubtree(c);
	};
	const walk = (level: TagTreeNode[]) => {
		for (const n of level) {
			if (dragSet.has(n.fullPath)) continue;
			if (tagIdInDfsOrder(n, aliased)) orderedIds.push(n.tag!.id);
			walk(n.children);
			if (n.fullPath === targetPath) for (const b of nodes) emitSubtree(b);
		}
	};
	walk(tree);

	return {
		tagRenames: [...renameById].map(([id, name]) => ({ id, name })),
		virtualTags: workingVT,
		aliases: workingAliases,
		orderedIds,
		pathRemaps,
	};
}

export function removeLeavesFromFolder(
	tree: TagTreeNode[],
	leafPaths: string[],
	virtualTags: Record<string, VirtualTag>,
	aliases: Record<string, number> = {},
): TagMoveResult | null {
	const nodes = leafPaths
		.map((p) => findByPath(tree, p))
		.filter((n): n is TagTreeNode => !!n);
	const leaves = nodes.filter(
		(n) => isLeafTag(n) && !n.isAlias && n.parentPath !== "",
	);
	if (leaves.length === 0) return null;

	// Strip one structural folder level: `<parent>/<segment>` -> `<segment>`. The leaf
	// segment is unchanged (leafOf stays the same), so alias segments don't need syncing.
	const renameById = new Map<number, string>();
	for (const n of leaves) renameById.set(n.tag!.id, n.segment);

	const dragSet = new Set(leaves.map((n) => n.fullPath));
	const orderedIds: number[] = [];
	const aliased = aliasedTagIds(aliases);
	const emitBlock = (n: TagTreeNode) => {
		if (tagIdInDfsOrder(n, aliased)) orderedIds.push(n.tag!.id);
		for (const c of n.children) emitBlock(c);
	};
	// Emit every non-dragged id in tree order, then append the pulled-out leaves at the
	// end (they land as the last root pills under the persisted order).
	const walk = (level: TagTreeNode[]) => {
		for (const n of level) {
			if (dragSet.has(n.fullPath)) continue;
			if (tagIdInDfsOrder(n, aliased)) orderedIds.push(n.tag!.id);
			walk(n.children);
		}
	};
	walk(tree);
	for (const n of leaves) emitBlock(n);

	return {
		tagRenames: [...renameById].map(([id, name]) => ({ id, name })),
		virtualTags,
		aliases,
		orderedIds,
		pathRemaps: [],
	};
}

/** Drop an alias block onto a non-folder area: strip those alias keys. */
export function removeAliasesAtPaths(
	aliases: Record<string, number>,
	paths: string[],
): Record<string, number> | null {
	let changed = false;
	const next = { ...aliases };
	for (const p of paths) {
		if (p in next) {
			delete next[p];
			changed = true;
		}
	}
	return changed ? next : null;
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

// Mirrors row highlighting: own tag selected, or a branch with every descendant selected.
// The length guard keeps empty folders out ([].every is vacuously true).
const isEffectivelySelected = (n: TagTreeNode, sel: ReadonlySet<number>): boolean =>
	(n.tag != null && sel.has(n.tag.id)) ||
	(n.descendantTagIds.length > 0 && n.descendantTagIds.every((id) => sel.has(id)));

export function collectDragBlock(
	tree: TagTreeNode[],
	grabbed: TagTreeNode,
	selectedTagIds: ReadonlySet<number>,
): string[] {
	const grabbedIsLeaf = isLeafTag(grabbed);
	return siblingsAt(tree, grabbed.parentPath)
		.filter(
			(n) =>
				n.fullPath === grabbed.fullPath ||
				(!n.isAlias && isLeafTag(n) === grabbedIsLeaf && isEffectivelySelected(n, selectedTagIds)),
		)
		.map((n) => n.fullPath);
}

/** Move one node a single slot among its siblings (-1 up, +1 down). Returns the new flat
 *  DFS tag-id order, or null at either end. Keyboard counterpart to a drag reorder. */
export function stepSiblingFlatOrder<T extends OrderNode>(
	tree: T[],
	path: string,
	parent: string,
	delta: -1 | 1,
	aliased: ReadonlySet<number> = new Set(),
): number[] | null {
	const siblings = siblingsAt(tree, parent);
	const from = siblings.findIndex((n) => n.fullPath === path);
	if (from === -1) return null;
	const to = from + delta;
	const neighbour = siblings[to];
	if (!neighbour) return null;
	return reorderSiblingsFlatOrder(
		tree,
		[path],
		neighbour.fullPath,
		delta < 0 ? "before" : "after",
		parent,
		aliased,
	);
}

export function reorderSiblingsFlatOrder<T extends OrderNode>(
	tree: T[],
	dragPaths: string[],
	dropPath: string,
	position: "before" | "after",
	parent: string,
	aliased: ReadonlySet<number> = new Set(),
): number[] | null {
	const dragSet = new Set(dragPaths);
	if (dragSet.has(dropPath)) return null;

	const siblings = siblingsAt(tree, parent);
	const block = siblings.filter((n) => dragSet.has(n.fullPath));
	const targetNode = siblings.find((n) => n.fullPath === dropPath);
	if (block.length === 0 || !targetNode) return null;

	const without = siblings.filter((n) => !dragSet.has(n.fullPath));
	let idx = without.indexOf(targetNode);
	if (position === "after") idx++;
	without.splice(idx, 0, ...block);

	const out: number[] = [];
	const dfs = (nodes: OrderNode[], cur: string) => {
		const ordered = cur === parent ? without : nodes;
		for (const n of ordered) {
			if (n.tag && tagIdInDfsOrder(n as TagTreeNode, aliased)) out.push(n.tag.id);
			dfs(n.children, n.fullPath);
		}
	};
	dfs(tree, "");
	return out;
}
