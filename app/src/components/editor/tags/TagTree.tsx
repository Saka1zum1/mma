import {
	memo,
	useState,
	useMemo,
	useCallback,
	useEffectEvent,
	useLayoutEffect,
	useRef,
	forwardRef,
	useImperativeHandle,
} from "react";
import { createPortal } from "react-dom";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { Icon } from "@/components/primitives/Icon";
import { mdiChevronDown, mdiChevronRight, mdiPencil, mdiFolder } from "@mdi/js";
import { textColorFor } from "@/lib/util/color";
import { fmt } from "@/lib/util/format";
import { toggleTagSelections, reorderTags } from "@/store/useMapStore";
import { TagContextMenuContent } from "./TagManager";
import {
	rangeToggleTagIds,
	reorderSiblingsFlatOrder,
	buildTagTree,
	sumCounts,
	isLeafTag,
	type TagTreeNode,
} from "./tagTreeRange";
import type { TagSortMode } from "@/types";
import type { Tag, VirtualTag } from "@/bindings.gen";

type DropTarget = { path: string; position: "before" | "after" };

/** Identity-stable gesture handlers -- volatile drag state travels as separate
 *  dragPath/dropTarget props so memoized rows aren't invalidated by this object. */
interface TreeDragHandlers {
	onMouseDown: (e: React.MouseEvent, node: TagTreeNode) => void;
	onMouseMove: (
		e: React.MouseEvent,
		node: TagTreeNode,
		el: HTMLElement,
		horizontal?: boolean,
	) => void;
}

const EXPANDED_KEY = "tagTreeExpanded";

function loadExpanded(): Set<string> {
	try {
		const raw = localStorage.getItem(EXPANDED_KEY);
		if (raw) return new Set(JSON.parse(raw));
	} catch {
		/* ignored */
	}
	return new Set();
}

function saveExpanded(set: Set<string>) {
	localStorage.setItem(EXPANDED_KEY, JSON.stringify([...set]));
}

export interface TagTreeHandle {
	/** Rewrite expanded-folder paths after a cascade rename so the renamed folder stays open. */
	remapExpanded: (oldPrefix: string, newPrefix: string) => void;
}

interface TagTreeViewProps {
	tags: Tag[];
	/** false = flat view: every tag name is a single leaf pill, no folders. */
	split: boolean;
	selectedTagIds: ReadonlySet<number>;
	tagCounts: Record<number, number>;
	sortMode: TagSortMode;
	virtualTags: Record<string, VirtualTag>;
	aliases: Record<string, number>;
	onEditTag: (node: TagTreeNode) => void;
	onEditVirtual: (fullPath: string) => void;
	onRenameTag: (tag: { id: number; name: string }) => void;
	onAddAlias: (tag: { id: number; name: string }) => void;
	onRemoveAlias: (aliasPath: string) => void;
	filterText: string;
}

export const TagTreeView = forwardRef<TagTreeHandle, TagTreeViewProps>(function TagTreeView(
	{
		tags,
		split,
		selectedTagIds,
		tagCounts,
		sortMode,
		virtualTags,
		aliases,
		onEditTag,
		onEditVirtual,
		onRenameTag,
		onAddAlias,
		onRemoveAlias,
		filterText,
	}: TagTreeViewProps,
	ref,
) {
	const tree = useMemo(
		() => buildTagTree(tags, sortMode, tagCounts, virtualTags, aliases, split),
		[tags, sortMode, tagCounts, virtualTags, aliases, split],
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

	useImperativeHandle(
		ref,
		() => ({
			remapExpanded(oldPrefix, newPrefix) {
				if (oldPrefix === newPrefix) return;
				setExpandedPaths((prev) => {
					const next = new Set<string>();
					for (const p of prev) {
						if (p === oldPrefix) next.add(newPrefix);
						else if (p.startsWith(`${oldPrefix}/`)) next.add(newPrefix + p.slice(oldPrefix.length));
						else next.add(p);
					}
					saveExpanded(next);
					return next;
				});
			},
		}),
		[],
	);

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
	// Must match the render split exactly: leaf pills first, then branch rows (recursed).
	const visibleRows = useMemo(() => {
		const rows: TagTreeNode[] = [];
		const walk = (nodes: TagTreeNode[]) => {
			for (const node of nodes) if (isLeafTag(node)) rows.push(node);
			for (const node of nodes) {
				if (isLeafTag(node)) continue;
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
	const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
	const dragEnabled = sortMode === "default" && !filterText;
	const draggedRef = useRef(false);
	const dragNodeRef = useRef<TagTreeNode | null>(null);
	const previewRef = useRef<HTMLUListElement>(null);
	const dragPosRef = useRef({ x: 0, y: 0 });
	// Mirror dropTarget into a ref + always-current tree so the window mouseup can commit
	// the reorder wherever the release lands (live-insertion can leave the cursor over the
	// hidden gap, where a per-element onMouseUp would never fire).
	const dropTargetRef = useRef<DropTarget | null>(null);
	const treeRef = useRef(tree);
	treeRef.current = tree;
	// Set while dragging a leaf pill — drives the floating "picked up" preview.
	const [dragLeaf, setDragLeaf] = useState<{ color: string; label: string; count: number } | null>(
		null,
	);

	const applyDropTarget = (v: DropTarget | null) => {
		dropTargetRef.current = v;
		setDropTarget(v);
	};

	const handleDragMouseDown = useEffectEvent((e: React.MouseEvent, node: TagTreeNode) => {
		draggedRef.current = false; // fresh interaction; a drag that ends off-row won't fire a click to clear it
		if (!dragEnabled || e.button !== 0 || node.isAlias) return; // alias leaves aren't reorderable
		if ((e.target as HTMLElement).closest("button")) return;
		e.preventDefault(); // don't start a text selection
		const startX = e.clientX;
		const startY = e.clientY;
		// Grab offset within the pill, so the pickup point stays under the cursor (not the top-left corner).
		const rect = e.currentTarget.getBoundingClientRect();
		const grabX = e.clientX - rect.left;
		const grabY = e.clientY - rect.top;
		let started = false;
		const onMove = (me: MouseEvent) => {
			if (!started && (Math.abs(me.clientX - startX) > 4 || Math.abs(me.clientY - startY) > 4)) {
				started = true;
				draggedRef.current = true;
				dragNodeRef.current = node;
				document.body.style.userSelect = "none";
				document.body.classList.add("mm-tag-dragging");
				dragPosRef.current = { x: me.clientX - grabX, y: me.clientY - grabY };
				setDragPath(node.fullPath);
				if (isLeafTag(node)) {
					setDragLeaf({
						color: node.tag!.color,
						label: node.segment,
						count: tagCounts[node.tag!.id] ?? 0,
					});
				}
			}
			if (started) {
				dragPosRef.current = { x: me.clientX - grabX, y: me.clientY - grabY };
				const el = previewRef.current;
				if (el) {
					el.style.left = `${dragPosRef.current.x - 4}px`;
					el.style.top = `${dragPosRef.current.y - 4}px`;
				}
			}
		};
		const onUp = () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
			document.body.style.userSelect = "";
			document.body.classList.remove("mm-tag-dragging");
			const dropT = dropTargetRef.current;
			const clear = () => {
				dragNodeRef.current = null;
				dropTargetRef.current = null;
				setDragPath(null);
				setDropTarget(null);
				setDragLeaf(null);
			};
			const order =
				started && dropT
					? reorderSiblingsFlatOrder(
							treeRef.current,
							node.fullPath,
							dropT.path,
							dropT.position,
							node.parentPath,
						)
					: null;
			// Hold the preview/hidden state until the async reorder lands, so the pill doesn't
			// flash back to its old slot before the new order arrives.
			if (order) reorderTags(order).finally(clear);
			else clear();
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	});

	const handleDragMouseMove = useEffectEvent(
		(e: React.MouseEvent, node: TagTreeNode, el: HTMLElement, horizontal = false) => {
			const src = dragNodeRef.current;
			if (!src || src.fullPath === node.fullPath || node.isAlias) return; // don't drop onto an alias
			if (src.parentPath !== node.parentPath) return; // in-level only
			// Pills reorder among pills, rows among rows — never across the leaf/branch split.
			if ((src.children.length === 0) !== (node.children.length === 0)) return;
			const rect = el.getBoundingClientRect();
			const position = horizontal
				? e.clientX - rect.left < rect.width / 2
					? "before"
					: "after"
				: e.clientY - rect.top < rect.height / 2
					? "before"
					: "after";
			if (
				dropTargetRef.current?.path !== node.fullPath ||
				dropTargetRef.current.position !== position
			) {
				applyDropTarget({ path: node.fullPath, position });
			}
		},
	);

	const drag: TreeDragHandlers = useMemo(
		() => ({ onMouseDown: handleDragMouseDown, onMouseMove: handleDragMouseMove }),
		[],
	);

	const handleRowClick = useEffectEvent((node: TagTreeNode, shiftKey: boolean, altKey: boolean) => {
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
		} else if (altKey && node.tag) {
			// Solo: toggle only this node's own tag, ignoring descendants.
			toggleTagSelections([node.tag.id]);
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
	});

	const rootPills = filteredTree.filter(isLeafTag);
	const rootRows = filteredTree.filter((n) => !isLeafTag(n));

	return (
		<>
			<TagLeafGroup
				nodes={rootPills}
				depth={0}
				selectedTagIds={selectedTagIds}
				tagCounts={tagCounts}
				onEditTag={onEditTag}
				onRenameTag={onRenameTag}
				onAddAlias={onAddAlias}
				onRemoveAlias={onRemoveAlias}
				onRowClick={handleRowClick}
				drag={drag}
				dragPath={dragPath}
				dropTarget={dropTarget}
			/>
			{rootRows.length > 0 && (
				<ul className="tag-tree">
					{rootRows.map((node) => (
						<TagTreeNodeRow
							key={node.fullPath}
							node={node}
							depth={0}
							selectedTagIds={selectedTagIds}
							tagCounts={tagCounts}
							onEditTag={onEditTag}
							onEditVirtual={onEditVirtual}
							onRenameTag={onRenameTag}
							onAddAlias={onAddAlias}
							onRemoveAlias={onRemoveAlias}
							forceExpanded={forceExpanded}
							expandedPaths={expandedPaths}
							onToggleExpanded={toggleExpanded}
							onRowClick={handleRowClick}
							drag={drag}
							dragPath={dragPath}
							dropTarget={dropTarget}
						/>
					))}
				</ul>
			)}
			{dragLeaf &&
				createPortal(
					<ul
						className="tag-list tag-drag-preview"
						ref={previewRef}
						style={{ left: dragPosRef.current.x - 4, top: dragPosRef.current.y - 4 }}
					>
						<li
							className="tag has-button"
							style={{ backgroundColor: dragLeaf.color, color: textColorFor(dragLeaf.color) }}
						>
							<button className="button tag__button tag__button--edit" type="button" tabIndex={-1}>
								<Icon path={mdiPencil} />
							</button>
							<label className="tag__text">
								{dragLeaf.label}
								<small style={{ marginLeft: ".375rem", fontWeight: 600, verticalAlign: "middle" }}>
									{fmt.format(dragLeaf.count)}
								</small>
							</label>
						</li>
					</ul>,
					document.body,
				)}
		</>
	);
});

const TagTreeNodeRow = memo(function TagTreeNodeRow({
	node,
	depth,
	selectedTagIds,
	tagCounts,
	onEditTag,
	onEditVirtual,
	onRenameTag,
	onAddAlias,
	onRemoveAlias,
	forceExpanded,
	expandedPaths,
	onToggleExpanded,
	onRowClick,
	drag,
	dragPath,
	dropTarget,
}: {
	node: TagTreeNode;
	depth: number;
	selectedTagIds: ReadonlySet<number>;
	tagCounts: Record<number, number>;
	onEditTag: (node: TagTreeNode) => void;
	onEditVirtual: (fullPath: string) => void;
	onRenameTag: (tag: { id: number; name: string }) => void;
	onAddAlias: (tag: { id: number; name: string }) => void;
	onRemoveAlias: (aliasPath: string) => void;
	forceExpanded: boolean;
	expandedPaths: Set<string>;
	onToggleExpanded: (path: string) => void;
	onRowClick: (node: TagTreeNode, shiftKey: boolean, altKey: boolean) => void;
	drag: TreeDragHandlers;
	dragPath: string | null;
	dropTarget: DropTarget | null;
}) {
	const hasChildren = node.children.length > 0;
	const isOpen = forceExpanded || expandedPaths.has(node.fullPath);
	const childPills = hasChildren ? node.children.filter(isLeafTag) : [];
	const childRows = hasChildren ? node.children.filter((n) => !isLeafTag(n)) : [];

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
						className={`tag-tree__row${effectiveSelected ? " is-selected" : ""}${someChildrenSelected ? " is-partial" : ""}${dragPath === node.fullPath ? " is-dragging" : ""}`}
						style={{
							backgroundColor: bg,
							color: fg,
							marginLeft: `${depth * 1.25}rem`,
							cursor: "pointer",
						}}
						data-drop={dropTarget?.path === node.fullPath ? dropTarget.position : undefined}
						onClick={(e) => onRowClick(node, e.shiftKey, e.altKey)}
						onMouseDown={(e) => drag.onMouseDown(e, node)}
						onMouseMove={(e) => drag.onMouseMove(e, node, e.currentTarget)}
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
						{!node.tag && (
							<Icon path={mdiFolder} size={13} style={{ color: fg, opacity: 0.5, flexShrink: 0 }} />
						)}
						<small className="tag-tree__count">{fmt.format(count)}</small>
						<button
							className="button tag-tree__edit"
							onClick={(e) => {
								e.stopPropagation();
								if (node.tag) onEditTag(node);
								else onEditVirtual(node.fullPath);
							}}
							type="button"
							style={{ color: fg }}
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
							onRename={() => onRenameTag({ id: node.tag!.id, name: node.tag!.name })}
							onAddAlias={() => onAddAlias({ id: node.tag!.id, name: node.tag!.name })}
						/>
					</ContextMenu.Portal>
				)}
			</ContextMenu.Root>
			{hasChildren && isOpen && (
				<>
					<TagLeafGroup
						nodes={childPills}
						depth={depth + 1}
						selectedTagIds={selectedTagIds}
						tagCounts={tagCounts}
						onEditTag={onEditTag}
						onRenameTag={onRenameTag}
						onAddAlias={onAddAlias}
						onRemoveAlias={onRemoveAlias}
						onRowClick={onRowClick}
						drag={drag}
						dragPath={dragPath}
						dropTarget={dropTarget}
					/>
					{childRows.length > 0 && (
						<ul className="tag-tree__children">
							{childRows.map((child) => (
								<TagTreeNodeRow
									key={child.fullPath}
									node={child}
									depth={depth + 1}
									selectedTagIds={selectedTagIds}
									tagCounts={tagCounts}
									onEditTag={onEditTag}
									onEditVirtual={onEditVirtual}
									onRenameTag={onRenameTag}
									onAddAlias={onAddAlias}
									onRemoveAlias={onRemoveAlias}
									forceExpanded={forceExpanded}
									expandedPaths={expandedPaths}
									onToggleExpanded={onToggleExpanded}
									onRowClick={onRowClick}
									drag={drag}
									dragPath={dragPath}
									dropTarget={dropTarget}
								/>
							))}
						</ul>
					)}
				</>
			)}
		</li>
	);
});

/** Live drag order: the dragged pill is spliced to its prospective slot so the group
 *  visibly opens a gap there (the dragged pill itself is hidden via `is-dragging`). Returns
 *  `nodes` unchanged when the drag/drop isn't within this group. */
function leafDisplayOrder(
	nodes: TagTreeNode[],
	dragPath: string | null,
	dropTarget: DropTarget | null,
): TagTreeNode[] {
	if (!dragPath || !dropTarget) return nodes;
	const dragIdx = nodes.findIndex((n) => n.fullPath === dragPath);
	if (dragIdx === -1) return nodes;
	const without = nodes.filter((_, i) => i !== dragIdx);
	let insertAt = without.findIndex((n) => n.fullPath === dropTarget.path);
	if (insertAt === -1) return nodes;
	if (dropTarget.position === "after") insertAt++;
	without.splice(insertAt, 0, nodes[dragIdx]);
	return without;
}

/** FLIP: while a drag reorders the group, displaced pills glide to their new slot
 *  instead of teleporting. Children are matched to `display` by index (the ul renders
 *  exactly that order); the dragged pill itself is hidden, so it's skipped. */
function useSwapAnimation(
	ulRef: React.RefObject<HTMLUListElement | null>,
	display: TagTreeNode[],
	dragPath: string | null,
) {
	const prevRects = useRef(new Map<string, DOMRect>());
	useLayoutEffect(() => {
		const ul = ulRef.current;
		const rects = new Map<string, DOMRect>();
		if (ul) {
			display.forEach((node, i) => {
				const el = ul.children[i] as HTMLElement | undefined;
				if (!el) return;
				el.getAnimations().forEach((a) => a.cancel());
				rects.set(node.fullPath, el.getBoundingClientRect());
			});
			if (dragPath) {
				display.forEach((node, i) => {
					if (node.fullPath === dragPath) return;
					const prev = prevRects.current.get(node.fullPath);
					const next = rects.get(node.fullPath);
					if (!prev || !next) return;
					const dx = prev.left - next.left;
					const dy = prev.top - next.top;
					if (dx || dy) {
						(ul.children[i] as HTMLElement).animate(
							[{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
							{ duration: 150, easing: "ease" },
						);
					}
				});
			}
		}
		prevRects.current = rects;
	});
}

/** A group of terminal tags rendered as flat pills, indented to sit under their parent
 *  folder row (depth 0 for root leaves and the whole flat view). */
const TagLeafGroup = memo(function TagLeafGroup({
	nodes,
	depth,
	selectedTagIds,
	tagCounts,
	onEditTag,
	onRenameTag,
	onAddAlias,
	onRemoveAlias,
	onRowClick,
	drag,
	dragPath,
	dropTarget,
}: {
	nodes: TagTreeNode[];
	depth: number;
	selectedTagIds: ReadonlySet<number>;
	tagCounts: Record<number, number>;
	onEditTag: (node: TagTreeNode) => void;
	onRenameTag: (tag: { id: number; name: string }) => void;
	onAddAlias: (tag: { id: number; name: string }) => void;
	onRemoveAlias: (aliasPath: string) => void;
	onRowClick: (node: TagTreeNode, shiftKey: boolean, altKey: boolean) => void;
	drag: TreeDragHandlers;
	dragPath: string | null;
	dropTarget: DropTarget | null;
}) {
	const display = leafDisplayOrder(nodes, dragPath, dropTarget);
	const ulRef = useRef<HTMLUListElement>(null);
	useSwapAnimation(ulRef, display, dragPath);
	if (nodes.length === 0) return null;
	return (
		<ul
			ref={ulRef}
			className="tag-list tag-tree__leaves"
			style={depth > 0 ? { marginLeft: `${depth * 1.25}rem` } : undefined}
		>
			{display.map((node) => (
				<TagTreeLeaf
					key={node.fullPath}
					node={node}
					count={tagCounts[node.tag!.id] ?? 0}
					isSelected={selectedTagIds.has(node.tag!.id)}
					isDragging={dragPath === node.fullPath}
					onEditTag={onEditTag}
					onRenameTag={onRenameTag}
					onAddAlias={onAddAlias}
					onRemoveAlias={onRemoveAlias}
					onRowClick={onRowClick}
					drag={drag}
				/>
			))}
		</ul>
	);
});

const TagTreeLeaf = memo(function TagTreeLeaf({
	node,
	count,
	isSelected,
	isDragging,
	onEditTag,
	onRenameTag,
	onAddAlias,
	onRemoveAlias,
	onRowClick,
	drag,
}: {
	node: TagTreeNode;
	count: number;
	isSelected: boolean;
	isDragging: boolean;
	onEditTag: (node: TagTreeNode) => void;
	onRenameTag: (tag: { id: number; name: string }) => void;
	onAddAlias: (tag: { id: number; name: string }) => void;
	onRemoveAlias: (aliasPath: string) => void;
	onRowClick: (node: TagTreeNode, shiftKey: boolean, altKey: boolean) => void;
	drag: TreeDragHandlers;
}) {
	const tag = node.tag!;
	const bg = tag.color;
	const fg = textColorFor(bg);

	return (
		<ContextMenu.Root modal={false}>
			<ContextMenu.Trigger asChild>
				<li
					className={`tag has-button${isSelected ? " is-selected" : ""}${node.isAlias ? " is-alias" : ""}${isDragging ? " is-dragging" : ""}`}
					style={{
						backgroundColor: bg,
						color: fg,
						cursor: "pointer",
					}}
					data-tag-id={tag.id}
					onClick={(e) => onRowClick(node, e.shiftKey, e.altKey)}
					onMouseDown={(e) => drag.onMouseDown(e, node)}
					onMouseMove={(e) => drag.onMouseMove(e, node, e.currentTarget, true)}
				>
					<button
						className="button tag__button tag__button--edit"
						onClick={(e) => {
							e.stopPropagation();
							onEditTag(node);
						}}
						type="button"
					>
						<Icon path={mdiPencil} />
					</button>
					<label className="tag__text">
						{node.segment}
						<small style={{ marginLeft: ".375rem", fontWeight: 600, verticalAlign: "middle" }}>
							{fmt.format(count)}
						</small>
					</label>
				</li>
			</ContextMenu.Trigger>
			<ContextMenu.Portal>
				<TagContextMenuContent
					tagId={tag.id}
					totalCount={count}
					onRename={() => onRenameTag({ id: tag.id, name: tag.name })}
					onAddAlias={node.isAlias ? undefined : () => onAddAlias({ id: tag.id, name: tag.name })}
					onRemoveAlias={node.isAlias ? () => onRemoveAlias(node.fullPath) : undefined}
				/>
			</ContextMenu.Portal>
		</ContextMenu.Root>
	);
});
