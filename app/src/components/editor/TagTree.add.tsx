import { useState, useMemo, useCallback, useRef } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { Icon } from "@/components/primitives/Icon";
import { mdiChevronDown, mdiChevronRight, mdiPencil } from "@mdi/js";
import { textColorFor } from "@/lib/util/color";
import { fmt } from "@/lib/util/format";
import { toggleTagSelections, reorderTags } from "@/store/useMapStore";
import { TagContextMenuContent } from "./TagManager";
import { rangeToggleTagIds, reorderSiblingsFlatOrder } from "./tagTreeRange.add";
import type { Tag, TagSortMode } from "@/types";

interface TreeDrag {
	enabled: boolean;
	dragPath: string | null;
	dropTarget: { path: string; position: "before" | "after" } | null;
	onMouseDown: (e: React.MouseEvent, node: TagTreeNode) => void;
	onMouseMove: (e: React.MouseEvent, node: TagTreeNode, el: HTMLElement) => void;
	onMouseUp: () => void;
	onMouseLeave: () => void;
}

interface TagTreeNode {
	segment: string;
	fullPath: string;
	tag: Tag | null;
	inheritedColor: string;
	children: TagTreeNode[];
	descendantTagIds: number[];
	/** Min `order` across descendant tags — used for "default" sort parity with flat mode. */
	sortOrder: number;
}

function buildTagTree(
	tags: Tag[],
	sortMode: TagSortMode,
	tagCounts: Record<number, number>,
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
			const ownColor = node.tag?.color ?? null;
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
		for (const node of nodes) sortNodes(node.children);
	}

	propagateColor(root, null);
	for (const node of root) collectMeta(node);
	sortNodes(root);

	return root;
}

function sumCounts(node: TagTreeNode, tagCounts: Record<number, number>): number {
	let total = node.tag ? (tagCounts[node.tag.id] ?? 0) : 0;
	for (const child of node.children) total += sumCounts(child, tagCounts);
	return total;
}

const EXPANDED_KEY = "tagTreeExpanded";

function loadExpanded(): Set<string> {
	try {
		const raw = localStorage.getItem(EXPANDED_KEY);
		if (raw) return new Set(JSON.parse(raw));
	} catch { /* ignored */ }
	return new Set();
}

function saveExpanded(set: Set<string>) {
	localStorage.setItem(EXPANDED_KEY, JSON.stringify([...set]));
}

interface TagTreeViewProps {
	tags: Tag[];
	selectedTagIds: Set<number>;
	tagCounts: Record<number, number>;
	sortMode: TagSortMode;
	onEditTag: (tagId: number) => void;
	onRenameTag: (tag: { id: number; name: string }) => void;
	filterText: string;
}

export function TagTreeView({
	tags,
	selectedTagIds,
	tagCounts,
	sortMode,
	onEditTag,
	onRenameTag,
	filterText,
}: TagTreeViewProps) {
	const tree = useMemo(
		() => buildTagTree(tags, sortMode, tagCounts),
		[tags, sortMode, tagCounts],
	);
	const [expandedPaths, setExpandedPaths] = useState(loadExpanded);

	const toggleExpanded = useCallback((path: string) => {
		setExpandedPaths((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			saveExpanded(next);
			return next;
		});
	}, []);

	const filteredTree = useMemo(() => {
		if (!filterText) return tree;
		const lower = filterText.toLowerCase();

		function filterNodes(nodes: TagTreeNode[]): TagTreeNode[] {
			const result: TagTreeNode[] = [];
			for (const node of nodes) {
				const nameMatch = node.segment.toLowerCase().includes(lower);
				const filteredChildren = filterNodes(node.children);
				if (nameMatch || filteredChildren.length > 0) {
					result.push({ ...node, children: filteredChildren });
				}
			}
			return result;
		}

		return filterNodes(tree);
	}, [tree, filterText]);

	const forceExpanded = !!filterText;

	// Flattened render order of currently-visible rows — the basis for shift-click ranges.
	const visibleRows = useMemo(() => {
		const rows: TagTreeNode[] = [];
		const walk = (nodes: TagTreeNode[]) => {
			for (const node of nodes) {
				rows.push(node);
				const isOpen = forceExpanded || expandedPaths.has(node.fullPath);
				if (node.children.length > 0 && isOpen) walk(node.children);
			}
		};
		walk(filteredTree);
		return rows;
	}, [filteredTree, expandedPaths, forceExpanded]);

	const rowIndex = useMemo(
		() => new Map(visibleRows.map((n, i) => [n.fullPath, i])),
		[visibleRows],
	);

	const anchorPathRef = useRef<string | null>(null);

	// --- In-level drag reorder (only in "default" sort, not while filtering) ---
	const [dragPath, setDragPath] = useState<string | null>(null);
	const [dropTarget, setDropTarget] = useState<{ path: string; position: "before" | "after" } | null>(null);
	const dragEnabled = sortMode === "default" && !filterText;
	const draggedRef = useRef(false);

	const handleDragMouseDown = useCallback(
		(e: React.MouseEvent, node: TagTreeNode) => {
			draggedRef.current = false; // fresh interaction; a drag that ends off-row won't fire a click to clear it
			if (!dragEnabled || e.button !== 0) return;
			if ((e.target as HTMLElement).closest("button")) return;
			const startX = e.clientX;
			const startY = e.clientY;
			let started = false;
			const onMove = (me: MouseEvent) => {
				if (!started && (Math.abs(me.clientX - startX) > 4 || Math.abs(me.clientY - startY) > 4)) {
					started = true;
					draggedRef.current = true;
					setDragPath(node.fullPath);
				}
			};
			const onUp = () => {
				window.removeEventListener("mousemove", onMove);
				window.removeEventListener("mouseup", onUp);
				setDragPath(null);
				setDropTarget(null);
			};
			window.addEventListener("mousemove", onMove);
			window.addEventListener("mouseup", onUp);
		},
		[dragEnabled],
	);

	const handleDragMouseMove = useCallback(
		(e: React.MouseEvent, node: TagTreeNode, el: HTMLElement) => {
			if (!dragPath || dragPath === node.fullPath) return;
			const dragParent = dragPath.lastIndexOf("/") === -1 ? "" : dragPath.slice(0, dragPath.lastIndexOf("/"));
			const nodeParent = node.fullPath.lastIndexOf("/") === -1 ? "" : node.fullPath.slice(0, node.fullPath.lastIndexOf("/"));
			if (dragParent !== nodeParent) return; // in-level only
			const rect = el.getBoundingClientRect();
			const position = e.clientY - rect.top < rect.height / 2 ? "before" : "after";
			setDropTarget({ path: node.fullPath, position });
		},
		[dragPath],
	);

	const handleDragMouseUp = useCallback(() => {
		if (dragPath && dropTarget) {
			const order = reorderSiblingsFlatOrder(tree, dragPath, dropTarget.path, dropTarget.position);
			if (order) reorderTags(order);
		}
		setDragPath(null);
		setDropTarget(null);
	}, [dragPath, dropTarget, tree]);

	const handleDragMouseLeave = useCallback(() => setDropTarget(null), []);

	const drag: TreeDrag = {
		enabled: dragEnabled,
		dragPath,
		dropTarget,
		onMouseDown: handleDragMouseDown,
		onMouseMove: handleDragMouseMove,
		onMouseUp: handleDragMouseUp,
		onMouseLeave: handleDragMouseLeave,
	};

	const handleRowClick = useCallback(
		(node: TagTreeNode, shiftKey: boolean) => {
			if (draggedRef.current) {
				draggedRef.current = false;
				return; // suppress the click that ends a drag
			}
			const targetIdx = rowIndex.get(node.fullPath);
			const anchorIdx =
				anchorPathRef.current != null ? rowIndex.get(anchorPathRef.current) : undefined;

			if (shiftKey && anchorIdx != null && targetIdx != null && anchorIdx !== targetIdx) {
				const ids = rangeToggleTagIds(visibleRows, anchorIdx, targetIdx);
				if (ids.length > 0) toggleTagSelections(ids);
			} else {
				// Single-node select/deselect of all its descendant tags.
				const allChildrenSelected =
					node.children.length > 0 && node.descendantTagIds.every((id) => selectedTagIds.has(id));
				const isSelected = node.tag ? selectedTagIds.has(node.tag.id) : false;
				const effectiveSelected = isSelected || allChildrenSelected;
				const ids = node.descendantTagIds.filter((id) =>
					effectiveSelected ? selectedTagIds.has(id) : !selectedTagIds.has(id),
				);
				if (ids.length > 0) toggleTagSelections(ids);
			}
			anchorPathRef.current = node.fullPath;
		},
		[rowIndex, visibleRows, selectedTagIds],
	);

	return (
		<ul className="tag-tree">
			{filteredTree.map((node) => (
				<TagTreeNodeRow
					key={node.fullPath}
					node={node}
					depth={0}
					selectedTagIds={selectedTagIds}
					tagCounts={tagCounts}
					onEditTag={onEditTag}
					onRenameTag={onRenameTag}
					forceExpanded={forceExpanded}
					expandedPaths={expandedPaths}
					onToggleExpanded={toggleExpanded}
					onRowClick={handleRowClick}
					drag={drag}
				/>
			))}
		</ul>
	);
}

function TagTreeNodeRow({
	node,
	depth,
	selectedTagIds,
	tagCounts,
	onEditTag,
	onRenameTag,
	forceExpanded,
	expandedPaths,
	onToggleExpanded,
	onRowClick,
	drag,
}: {
	node: TagTreeNode;
	depth: number;
	selectedTagIds: Set<number>;
	tagCounts: Record<number, number>;
	onEditTag: (tagId: number) => void;
	onRenameTag: (tag: { id: number; name: string }) => void;
	forceExpanded: boolean;
	expandedPaths: Set<string>;
	onToggleExpanded: (path: string) => void;
	onRowClick: (node: TagTreeNode, shiftKey: boolean) => void;
	drag: TreeDrag;
}) {
	const hasChildren = node.children.length > 0;
	const isOpen = forceExpanded || expandedPaths.has(node.fullPath);

	const isSelected = node.tag ? selectedTagIds.has(node.tag.id) : false;
	const allChildrenSelected =
		hasChildren && node.descendantTagIds.every((id) => selectedTagIds.has(id));
	const someChildrenSelected =
		hasChildren &&
		!allChildrenSelected &&
		node.descendantTagIds.some((id) => selectedTagIds.has(id));

	const effectiveSelected = isSelected || allChildrenSelected;

	const bg = node.inheritedColor;
	const fg = textColorFor(bg);
	const count = sumCounts(node, tagCounts);

	const handleChevronClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onToggleExpanded(node.fullPath);
	};

	return (
		<li className="tag-tree__node">
			<ContextMenu.Root modal={false}>
				<ContextMenu.Trigger asChild>
					<div
						className={`tag-tree__row${effectiveSelected ? " is-selected" : ""}${someChildrenSelected ? " is-partial" : ""}${drag.dragPath === node.fullPath ? " is-dragging" : ""}`}
						style={{
							backgroundColor: bg,
							color: fg,
							marginLeft: `${depth * 1.25}rem`,
							cursor: drag.enabled ? "grab" : "pointer",
						}}
						data-drop={drag.dropTarget?.path === node.fullPath ? drag.dropTarget.position : undefined}
						onClick={(e) => onRowClick(node, e.shiftKey)}
						onMouseDown={(e) => drag.onMouseDown(e, node)}
						onMouseMove={(e) => drag.onMouseMove(e, node, e.currentTarget)}
						onMouseUp={drag.onMouseUp}
						onMouseLeave={drag.onMouseLeave}
					>
						{hasChildren ? (
							<button
								className="tag-tree__chevron"
								onClick={handleChevronClick}
								type="button"
								style={{ color: fg }}
							>
								<Icon path={isOpen ? mdiChevronDown : mdiChevronRight} size={18} />
							</button>
						) : (
							<span className="tag-tree__chevron-spacer" />
						)}
						<span className="tag-tree__label">{node.segment}</span>
						<small className="tag-tree__count">{fmt.format(count)}</small>
						<button
							className="button tag-tree__edit"
							onClick={(e) => {
								e.stopPropagation();
								if (node.tag) onEditTag(node.tag.id);
							}}
							type="button"
							style={{ color: fg, visibility: node.tag ? "visible" : "hidden" }}
						>
							<Icon path={mdiPencil} size={14} />
						</button>
					</div>
				</ContextMenu.Trigger>
				{node.tag && (
					<ContextMenu.Portal>
						<TagContextMenuContent
							tagId={node.tag!.id}
							totalCount={sumCounts(node, tagCounts)}
							onRename={() =>
								onRenameTag({ id: node.tag!.id, name: node.tag!.name })
							}
						/>
					</ContextMenu.Portal>
				)}
			</ContextMenu.Root>
			{hasChildren && isOpen && (
				<ul className="tag-tree__children">
					{node.children.map((child) => (
						<TagTreeNodeRow
							key={child.fullPath}
							node={child}
							depth={depth + 1}
							selectedTagIds={selectedTagIds}
							tagCounts={tagCounts}
							onEditTag={onEditTag}
							onRenameTag={onRenameTag}
							forceExpanded={forceExpanded}
							expandedPaths={expandedPaths}
							onToggleExpanded={onToggleExpanded}
							onRowClick={onRowClick}
							drag={drag}
						/>
					))}
				</ul>
			)}
		</li>
	);
}

