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
