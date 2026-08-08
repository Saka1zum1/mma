import {
	memo,
	useState,
	useMemo,
	useCallback,
	useLayoutEffect,
	useRef,
	useImperativeHandle,
	createContext,
	useContext,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { ContextMenu } from "@base-ui-components/react/context-menu";
import { TagPill, TagPillButton } from "@/components/primitives/TagPill";
import { Icon } from "@/components/primitives/Icon";
import { mdiChevronDown, mdiChevronRight, mdiPencil, mdiFolder } from "@mdi/js";
import { textColorFor, rgbToHex } from "@/lib/util/color";
import { fmt } from "@/lib/util/format";
import { toggleTagSelections } from "@/store/useMapStore";
import { useStableHandler } from "@/lib/hooks/useStableHandler";
import { useSetting } from "@/store/settings";
import { useT } from "@/lib/i18n";
import { TagContextMenuContent } from "./TagManager";
import {
	rangeToggleTagIds,
	reorderSiblingsFlatOrder,
	collectDragBlock,
	canDropInto,
	moveIntoFolder,
	removeLeavesFromFolder,
	buildTagTree,
	sumCounts,
	isLeafTag,
	buildTreePathLabels,
	treeNodeDisplayLabel,
	aliasedTagIds,
	type TagTreeNode,
	type TagMoveResult,
} from "./tagTreeRange";
import type { TagSortMode } from "@/types";
import type { Tag, VirtualTag } from "@/bindings.gen";

/** `out` = drop a leaf (alias, or a real tag renamed into a folder) onto a non-folder
 *  area to remove it from the folder -- aliases are dropped, real leaves lose their prefix. */
type DropTarget = { path: string; position: "before" | "after" | "into" | "out" };

/** Identity-stable gesture handlers -- volatile drag state travels as separate
 *  dragPaths/dropTarget props so memoized rows aren't invalidated by this object. */
interface TreeDragHandlers {
	onMouseDown: (e: React.MouseEvent, node: TagTreeNode) => void;
	onMouseMove: (
		e: React.MouseEvent,
		node: TagTreeNode,
		el: HTMLElement,
		horizontal?: boolean,
	) => void;
}

interface TagTreeCallbacks {
	onEditTag: (node: TagTreeNode) => void;
	onEditVirtual: (fullPath: string) => void;
	onRenameTag: (tag: { id: number; name: string }) => void;
	onAddAlias?: (tag: { id: number; name: string }) => void;
	onRemoveAlias: (aliasPath: string) => void;
	onRemoveLeaves: (move: TagMoveResult) => void;
	onNewFolder?: (parentPath: string) => void;
	onDeleteFolder: (path: string) => void;
	onRowClick: (node: TagTreeNode, shiftKey: boolean, altKey: boolean) => void;
	onToggleExpanded: (path: string) => void;
	nodeLabel: (node: TagTreeNode) => string;
	drag: TreeDragHandlers;
}

const TagTreeCtx = createContext<TagTreeCallbacks>(null!);

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
	onAddAlias?: (tag: { id: number; name: string }) => void;
	onRemoveAlias: (aliasPath: string) => void;
	/** Commit a drag reorder (full DFS tag-id order). Must render the new order
	 *  optimistically -- the drop handler clears its drag state synchronously. */
	onReorder: (orderedIds: number[]) => void;
	/** Commit a drag-into-folder move (leaf → alias, or folder cascade rename).
	 *  Same optimistic contract as onReorder. */
	onMoveInto: (move: TagMoveResult) => void;
	/** Commit removing real leaves from their folder by stripping the prefix after a
	 *  drag-out drop. Same optimistic contract as onMoveInto. */
	onRemoveLeaves: (move: TagMoveResult) => void;
	/** Commit removing alias keys after dragging aliases onto a non-folder area. */
	onRemoveAliases: (aliasPaths: string[]) => void;
	/** Open the new-folder dialog under `parentPath` ("" = root). */
	onNewFolder?: (parentPath: string) => void;
	/** Delete a folder subtree, stripping the folder prefix from any tags inside it. */
	onDeleteFolder: (path: string) => void;
	filterText: string;
}

// Plain function component on purpose: in React 19.2 `useEffectEvent` closures never
// update inside memo()/forwardRef()-wrapped components (frozen at mount values).
export function TagTreeView({
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
	onReorder,
	onMoveInto,
	onRemoveLeaves,
	onRemoveAliases,
	onNewFolder,
	onDeleteFolder,
	filterText,
	ref,
}: TagTreeViewProps & { ref?: React.Ref<TagTreeHandle> }) {
	const folderColorMode = useSetting("tagFolderColorMode");
	const folderColorRgb = useSetting("tagFolderColor");
	const truncateTagPaths = useSetting("truncateTagPaths");
	const pathLabels = useMemo(
		() =>
			buildTreePathLabels(
				tags.map((t) => t.name),
				Object.keys(virtualTags),
				truncateTagPaths,
			),
		[tags, virtualTags, truncateTagPaths],
	);
	const nodeLabel = useCallback(
		(node: TagTreeNode) => treeNodeDisplayLabel(node, pathLabels),
		[pathLabels],
	);
	const tree = useMemo(
		() =>
			buildTagTree(tags, sortMode, tagCounts, virtualTags, aliases, split, {
				mode: folderColorMode,
				color: rgbToHex(folderColorRgb),
			}),
		[tags, sortMode, tagCounts, virtualTags, aliases, split, folderColorMode, folderColorRgb],
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

	// --- Drag to reorder or to move into a folder (disabled only while filtering) ---
	const [dragPaths, setDragPaths] = useState<ReadonlySet<string> | null>(null);
	const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
	const dragEnabled = !filterText;
	const draggedRef = useRef(false);
	const dragNodeRef = useRef<TagTreeNode | null>(null);
	const dragBlockRef = useRef<Set<string> | null>(null);
	const previewRef = useRef<HTMLUListElement>(null);
	const dragPosRef = useRef({ x: 0, y: 0 });
	// Mirror dropTarget into a ref + always-current tree so the window mouseup can commit
	// the reorder wherever the release lands (live-insertion can leave the cursor over the
	// hidden gap, where a per-element onMouseUp would never fire).
	const dropTargetRef = useRef<DropTarget | null>(null);
	const treeRef = useRef(tree);
	treeRef.current = tree;
	// Set while dragging a leaf pill — drives the floating "picked up" preview.
	const [dragLeaf, setDragLeaf] = useState<{
		color: string;
		label: string;
		count: number;
		extra: number;
	} | null>(null);

	const applyDropTarget = (v: DropTarget | null) => {
		dropTargetRef.current = v;
		setDropTarget(v);
	};

	const handleDragMouseDown = useStableHandler((e: React.MouseEvent, node: TagTreeNode) => {
		draggedRef.current = false; // fresh interaction; a drag that ends off-row won't fire a click to clear it
		if (!dragEnabled || e.button !== 0) return;
		if ((e.target as HTMLElement).closest("button")) return;
		e.preventDefault(); // don't start a text selection
		const startX = e.clientX;
		const startY = e.clientY;
		// Grab offset within the pill, so the pickup point stays under the cursor (not the top-left corner).
		const rect = e.currentTarget.getBoundingClientRect();
		const grabX = e.clientX - rect.left;
		const grabY = e.clientY - rect.top;
		let started = false;
		let block = new Set([node.fullPath]);
		let multi: boolean | null = null;
		// Ctrl is read live during the drag, so pressing/releasing it mid-gesture
		// grows/shrinks the carried block. Alias leaves travel alone (they don't own order).
		const syncBlock = (me: MouseEvent) => {
			if (node.isAlias) {
				block = new Set([node.fullPath]);
				dragBlockRef.current = block;
				setDragPaths(block);
				return;
			}
			const m = me.ctrlKey || me.metaKey;
			if (m === multi) return;
			multi = m;
			block = new Set(
				m ? collectDragBlock(treeRef.current, node, selectedTagIds) : [node.fullPath],
			);
			dragBlockRef.current = block;
			setDragPaths(block);
			setDragLeaf((prev) => (prev ? { ...prev, extra: block.size - 1 } : prev));
		};
		const onMove = (me: MouseEvent) => {
			if (!started && (Math.abs(me.clientX - startX) > 4 || Math.abs(me.clientY - startY) > 4)) {
				started = true;
				draggedRef.current = true;
				dragNodeRef.current = node;
				document.body.style.userSelect = "none";
				document.body.classList.add("mm-tag-dragging");
				dragPosRef.current = { x: me.clientX - grabX, y: me.clientY - grabY };
				if (isLeafTag(node)) {
					setDragLeaf({
						color: node.tag!.color,
						label: nodeLabel(node),
						count: tagCounts[node.tag!.id] ?? 0,
						extra: 0,
					});
				}
			}
			if (started) {
				syncBlock(me);
				dragPosRef.current = { x: me.clientX - grabX, y: me.clientY - grabY };
				const el = previewRef.current;
				if (el) {
					el.style.left = `${dragPosRef.current.x - 4}px`;
					el.style.top = `${dragPosRef.current.y - 4}px`;
				}
				// A leaf dragged over empty chrome (not a row/pill): mark remove-from-folder.
				// Aliases are dropped; real leaves renamed into a folder (parentPath != "") are
				// pulled out by stripping their prefix. Root leaves have no prefix to strip.
				if (isLeafTag(node) && node.parentPath !== "") {
					const under = document.elementFromPoint(me.clientX, me.clientY) as HTMLElement | null;
					const overFolder = under?.closest?.(".tag-tree__row");
					const overPill = under?.closest?.(".tag-list li, .tag-pill");
					if (!overFolder && !overPill) {
						applyDropTarget({ path: "", position: "out" });
					}
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
				dragBlockRef.current = null;
				dropTargetRef.current = null;
				setDragPaths(null);
				setDropTarget(null);
				setDragLeaf(null);
			};
			// onReorder/onMoveInto render optimistically, so clearing in the same
			// batch settles the drop instantly with no flash back to the old slot.
			if (started && dropT) {
				if (dropT.position === "out") {
					// Dropping a leaf outside its folder removes it from the folder.
					// Alias leaves are single-path blocks and just drop their alias key; real
					// leaves renamed into the folder strip the prefix (rename to the leaf name).
					if (node.isAlias) {
						onRemoveAliases([...block]);
					} else if (isLeafTag(node) && node.parentPath !== "") {
						const move = removeLeavesFromFolder(
							treeRef.current,
							[...block],
							virtualTags,
							aliases,
						);
						if (move) onRemoveLeaves(move);
					}
				} else if (dropT.position === "into") {
					const move = moveIntoFolder(
						treeRef.current,
						[...block],
						dropT.path,
						tags,
						virtualTags,
						aliases,
					);
					if (move) onMoveInto(move);
				} else if (!node.isAlias) {
					const order = reorderSiblingsFlatOrder(
						treeRef.current,
						[...block],
						dropT.path,
						dropT.position,
						node.parentPath,
						aliasedTagIds(aliases),
					);
					if (order) onReorder(order);
				}
			}
			clear();
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	});

	const handleDragMouseMove = useStableHandler(
		(e: React.MouseEvent, node: TagTreeNode, el: HTMLElement, horizontal = false) => {
			const src = dragNodeRef.current;
			if (!src || node.isAlias) return; // don't drop onto an alias
			const block = dragBlockRef.current;
			if (block?.has(node.fullPath)) return; // block members travel with the drag

			// Dragging an alias: folder → move alias; anything else → remove from folder.
			if (src.isAlias) {
				if (!isLeafTag(node) && block && canDropInto(treeRef.current, [...block], node.fullPath)) {
					if (
						dropTargetRef.current?.path !== node.fullPath ||
						dropTargetRef.current.position !== "into"
					) {
						applyDropTarget({ path: node.fullPath, position: "into" });
					}
				} else {
					applyDropTarget({ path: "", position: "out" });
				}
				return;
			}

			if (
				sortMode === "default" &&
				src.parentPath === node.parentPath &&
				isLeafTag(src) === isLeafTag(node) &&
				src.descendantTagIds.length > 0 &&
				node.descendantTagIds.length > 0
			) {
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
				return;
			}
			if (isLeafTag(node) || !block) {
				if (dropTargetRef.current) applyDropTarget(null);
				return;
			}
			if (!canDropInto(treeRef.current, [...block], node.fullPath)) {
				if (dropTargetRef.current) applyDropTarget(null);
				return;
			}
			if (
				dropTargetRef.current?.path !== node.fullPath ||
				dropTargetRef.current.position !== "into"
			) {
				applyDropTarget({ path: node.fullPath, position: "into" });
			}
		},
	);

	const drag: TreeDragHandlers = useMemo(
		() => ({ onMouseDown: handleDragMouseDown, onMouseMove: handleDragMouseMove }),
		[handleDragMouseDown, handleDragMouseMove],
	);

	const handleRowClick = useStableHandler(
		(node: TagTreeNode, shiftKey: boolean, altKey: boolean) => {
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
		},
	);

	const treeCallbacks = useMemo<TagTreeCallbacks>(
		() => ({
			onEditTag,
			onEditVirtual,
			onRenameTag,
			onAddAlias,
			onRemoveAlias,
			onRemoveLeaves,
			onNewFolder,
			onDeleteFolder,
			onRowClick: handleRowClick,
			onToggleExpanded: toggleExpanded,
			nodeLabel,
			drag,
		}),
		[
			onEditTag,
			onEditVirtual,
			onRenameTag,
			onAddAlias,
			onRemoveAlias,
			onRemoveLeaves,
			onNewFolder,
			onDeleteFolder,
			handleRowClick,
			toggleExpanded,
			nodeLabel,
			drag,
		],
	);

	const rootPills = filteredTree.filter(isLeafTag);
	const rootRows = filteredTree.filter((n) => !isLeafTag(n));
	const displayRootRows = spliceDisplayOrder(rootRows, dragPaths, dropTarget);
	const rootRowsRef = useRef<HTMLUListElement>(null);
	useSwapAnimation(rootRowsRef, displayRootRows, dragPaths);

	return (
		<TagTreeCtx.Provider value={treeCallbacks}>
			<div
				className={clsx(
					"tag-tree-view",
					dropTarget?.position === "out" && "tag-tree-view--drop-out",
				)}
			>
			<TagLeafGroup
				nodes={rootPills}
				depth={0}
				selectedTagIds={selectedTagIds}
				tagCounts={tagCounts}
				dragPaths={dragPaths}
				dropTarget={dropTarget}
			/>
			{rootRows.length > 0 && (
				<ul className="tag-tree" ref={rootRowsRef}>
					{displayRootRows.map((node) => (
						<TagTreeNodeRow
							key={node.fullPath}
							node={node}
							depth={0}
							selectedTagIds={selectedTagIds}
							tagCounts={tagCounts}
							forceExpanded={forceExpanded}
							expandedPaths={expandedPaths}
							dragPaths={dragPaths}
							dropTarget={dropTarget}
						/>
					))}
				</ul>
			)}
			</div>
			{dragLeaf &&
				createPortal(
					<ul
						className="tag-list tag-drag-preview"
						ref={previewRef}
						style={{ left: dragPosRef.current.x - 4, top: dragPosRef.current.y - 4 }}
					>
						<TagPill
							as="li"
							color={dragLeaf.color}
							label={dragLeaf.label}
							count={dragLeaf.count}
							button={<TagPillButton variant="edit" tabIndex={-1} />}
						>
							{dragLeaf.extra > 0 && (
								<span className="tag-drag-preview__count">+{dragLeaf.extra}</span>
							)}
						</TagPill>
					</ul>,
					document.body,
				)}
		</TagTreeCtx.Provider>
	);
}

const TagTreeNodeRow = memo(function TagTreeNodeRow({
	node,
	depth,
	selectedTagIds,
	tagCounts,
	forceExpanded,
	expandedPaths,
	dragPaths,
	dropTarget,
}: {
	node: TagTreeNode;
	depth: number;
	selectedTagIds: ReadonlySet<number>;
	tagCounts: Record<number, number>;
	forceExpanded: boolean;
	expandedPaths: Set<string>;
	dragPaths: ReadonlySet<string> | null;
	dropTarget: DropTarget | null;
}) {
	const {
		onEditTag,
		onEditVirtual,
		onRenameTag,
		onAddAlias,
		onNewFolder,
		onDeleteFolder,
		onRowClick,
		onToggleExpanded,
		nodeLabel,
		drag,
	} = useContext(TagTreeCtx);
	const { t } = useT();
	const hasChildren = node.children.length > 0;
	const isOpen = forceExpanded || expandedPaths.has(node.fullPath);
	const childPills = hasChildren ? node.children.filter(isLeafTag) : [];
	const childRows = hasChildren ? node.children.filter((n) => !isLeafTag(n)) : [];
	const displayChildRows = spliceDisplayOrder(childRows, dragPaths, dropTarget);
	const childRowsRef = useRef<HTMLUListElement>(null);
	useSwapAnimation(childRowsRef, displayChildRows, dragPaths);

	const isSelected = node.tag ? selectedTagIds.has(node.tag.id) : false;
	const allChildrenSelected =
		hasChildren && node.descendantTagIds.every((id) => selectedTagIds.has(id));
	const someChildrenSelected =
		hasChildren &&
		!allChildrenSelected &&
		node.descendantTagIds.some((id) => selectedTagIds.has(id));

	const effectiveSelected = isSelected || allChildrenSelected;

	const fg = textColorFor(node.inheritedColor);
	const count = sumCounts(node, tagCounts);

	const handleChevronClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onToggleExpanded(node.fullPath);
	};

	return (
		<li className="tag-tree__node">
			<ContextMenu.Root>
				<ContextMenu.Trigger
					render={
						<div
							className={`tag-tree__row${effectiveSelected ? " is-selected" : ""}${someChildrenSelected ? " is-partial" : ""}${dragPaths?.has(node.fullPath) ? " is-dragging" : ""}${dropTarget?.position === "into" && dropTarget.path === node.fullPath ? " is-drop-into" : ""}`}
							style={{
								background: node.rowBackground.startsWith("linear-gradient")
									? node.rowBackground
									: undefined,
								backgroundColor: node.rowBackground.startsWith("linear-gradient")
									? undefined
									: node.rowBackground,
								color: fg,
								marginLeft: `${depth * 1.25}rem`,
								cursor: "pointer",
							}}
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
							<span className="tag-tree__label">{nodeLabel(node)}</span>
							{!node.tag && (
								<Icon
									path={mdiFolder}
									size={13}
									style={{ color: fg, opacity: 0.5, flexShrink: 0 }}
								/>
							)}
							<small className="tag-tree__count mono">{fmt.format(count)}</small>
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
					}
				/>
				{node.tag ? (
					<ContextMenu.Portal>
						<TagContextMenuContent
							tagId={node.tag!.id}
							totalCount={sumCounts(node, tagCounts)}
							onRename={() => onRenameTag({ id: node.tag!.id, name: node.tag!.name })}
							onAddAlias={
								onAddAlias
									? () => onAddAlias({ id: node.tag!.id, name: node.tag!.name })
									: undefined
							}
							onNewSubfolder={onNewFolder ? () => onNewFolder(node.fullPath) : undefined}
						/>
					</ContextMenu.Portal>
				) : (
					<ContextMenu.Portal>
						<ContextMenu.Positioner>
							<ContextMenu.Popup className="context-menu">
								{onNewFolder && (
									<ContextMenu.Item
										className="context-menu__item"
										onClick={() => onNewFolder(node.fullPath)}
									>
										{t("editor.newSubfolder")}
									</ContextMenu.Item>
								)}
								<ContextMenu.Item
									className="context-menu__item"
									onClick={() => onDeleteFolder(node.fullPath)}
								>
									{t("editor.deleteFolder")}
								</ContextMenu.Item>
							</ContextMenu.Popup>
						</ContextMenu.Positioner>
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
						dragPaths={dragPaths}
						dropTarget={dropTarget}
					/>
					{childRows.length > 0 && (
						<ul className="tag-tree__children" ref={childRowsRef}>
							{displayChildRows.map((child) => (
								<TagTreeNodeRow
									key={child.fullPath}
									node={child}
									depth={depth + 1}
									selectedTagIds={selectedTagIds}
									tagCounts={tagCounts}
									forceExpanded={forceExpanded}
									expandedPaths={expandedPaths}
									dragPaths={dragPaths}
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

function spliceDisplayOrder(
	nodes: TagTreeNode[],
	dragPaths: ReadonlySet<string> | null,
	dropTarget: DropTarget | null,
): TagTreeNode[] {
	if (!dragPaths || !dropTarget || dropTarget.position === "into" || dropTarget.position === "out")
		return nodes;
	const block: TagTreeNode[] = [];
	const without: TagTreeNode[] = [];
	for (const n of nodes) (dragPaths.has(n.fullPath) ? block : without).push(n);
	if (block.length === 0) return nodes;
	let insertAt = without.findIndex((n) => n.fullPath === dropTarget.path);
	if (insertAt === -1) return nodes;
	if (dropTarget.position === "after") insertAt++;
	without.splice(insertAt, 0, ...block);
	return without;
}

function useSwapAnimation(
	ulRef: React.RefObject<HTMLUListElement | null>,
	display: TagTreeNode[],
	dragPaths: ReadonlySet<string> | null,
) {
	const animate = useSetting("animateTagReorder");
	const prevRects = useRef(new Map<string, DOMRect>());
	useLayoutEffect(() => {
		const ul = ulRef.current;
		const rects = new Map<string, DOMRect>();
		if (ul && animate) {
			display.forEach((node, i) => {
				const el = ul.children[i] as HTMLElement | undefined;
				if (!el) return;
				el.getAnimations().forEach((a) => a.cancel());
				rects.set(node.fullPath, el.getBoundingClientRect());
			});
			if (dragPaths) {
				display.forEach((node, i) => {
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
	dragPaths,
	dropTarget,
}: {
	nodes: TagTreeNode[];
	depth: number;
	selectedTagIds: ReadonlySet<number>;
	tagCounts: Record<number, number>;
	dragPaths: ReadonlySet<string> | null;
	dropTarget: DropTarget | null;
}) {
	const display = spliceDisplayOrder(nodes, dragPaths, dropTarget);
	const ulRef = useRef<HTMLUListElement>(null);
	useSwapAnimation(ulRef, display, dragPaths);
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
					isDragging={dragPaths?.has(node.fullPath) ?? false}
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
}: {
	node: TagTreeNode;
	count: number;
	isSelected: boolean;
	isDragging: boolean;
}) {
	const { onEditTag, onRenameTag, onAddAlias, onRemoveAlias, onRowClick, drag, nodeLabel } =
		useContext(TagTreeCtx);
	const tag = node.tag!;

	return (
		<ContextMenu.Root>
			<ContextMenu.Trigger
				render={
					<TagPill
						as="li"
						color={tag.color}
						label={nodeLabel(node)}
						count={count}
						className={clsx(
							isSelected && "is-selected",
							node.isAlias && "is-alias",
							isDragging && "is-dragging",
						)}
						style={{ cursor: "pointer" }}
						data-tag-id={tag.id}
						onClick={(e: React.MouseEvent) => onRowClick(node, e.shiftKey, e.altKey)}
						onMouseDown={(e: React.MouseEvent) => drag.onMouseDown(e, node)}
						onMouseMove={(e: React.MouseEvent<HTMLElement>) =>
							drag.onMouseMove(e, node, e.currentTarget, true)
						}
						button={
							<TagPillButton
								variant="edit"
								onClick={(e) => {
									e.stopPropagation();
									onEditTag(node);
								}}
							/>
						}
					/>
				}
			/>
			<ContextMenu.Portal>
				<TagContextMenuContent
					tagId={tag.id}
					totalCount={count}
					onRename={() => onRenameTag({ id: tag.id, name: tag.name })}
					onAddAlias={
						node.isAlias || !onAddAlias
							? undefined
							: () => onAddAlias({ id: tag.id, name: tag.name })
					}
					onRemoveAlias={node.isAlias ? () => onRemoveAlias(node.fullPath) : undefined}
				/>
			</ContextMenu.Portal>
		</ContextMenu.Root>
	);
});
