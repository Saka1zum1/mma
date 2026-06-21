import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import {
	useCurrentMap,
	useSelectedLocationIds,
	useSelections,
	removeSelections,
	selectInverse,
	setPolygonName,
	setSelectionColors,
	addTagToLocations,
	createTags,
	fetchLocationsByIds,
	selectDuplicates,
	reorderSelection,
	composeSelections,
	decomposeChild,
	removeChildFromSelection,
	getVisibleTags,
	getTagCounts,
	toggleGhostSelection,
	isolateSelection,
	useGhostedSelections,
	updateFilterSelection,
	pruneDuplicates,
	selectFilter,
	selectRandomFromSelection,
} from "@/store/useMapStore";
import { toast } from "@/lib/util/toast";
import { sortTagsByMode } from "@/lib/util/util";
import { SuggestInput } from "@/components/primitives/SuggestInput";
import { stepFilterWindow } from "@/lib/data/fieldOps";
import { useSetting } from "@/store/settings";
import { cmd } from "@/lib/commands";
import { getCommand, movePinnedCommand, removePinnedAt, insertSeparator, reorderPinned } from "@/store/commands";

import { RgbColorPicker } from "react-colorful";
import type { Selection, Tag } from "@/bindings.gen";
import { selectionDisplayName } from "@/store/selections";
import { TagManager } from "@/components/editor/tags/TagManager";
import {
	saveCurrentSelections,
	applySavedSelection,
	deleteSavedSelection,
	selectionToSaved,
	describeRule,
	type SavedSelectionItem,
} from "@/store/savedSelections";
import { FilterForm, filterPropsToSeed, useExtraFieldKeys } from "@/components/editor/map/FilterBuilder";
import { ApplyFieldAsTagsDialog } from "@/components/editor/tags/ApplyFieldAsTagsDialog";
import { TagFindReplaceDialog } from "@/components/editor/tags/TagFindReplaceDialog";
import { MergeDuplicatesModal } from "@/components/dialogs/MergeDuplicatesModal";
import { ReviewSessionsModal } from "@/components/dialogs/ReviewSessions";
import { beginReview } from "@/lib/review/review";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { ToolBlock } from "@/components/primitives/ToolBlock";
import { Icon } from "@/components/primitives/Icon";
import {
	mdiClose,
	mdiChevronLeft,
	mdiChevronRight,
	mdiDotsVertical,
	mdiGhost,
	mdiGhostOutline,
	mdiBookOpenOutline,
} from "@mdi/js";
import { PluginToolbar } from "@/plugins/PluginPanels";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { fmt } from "@/lib/util/format";
import { rgbCss } from "@/lib/util/color";
import { getGoogleMap as getGoogleMapInstance } from "@/lib/map/mapState";

async function fitSelectionBounds(map: google.maps.Map, selection: Selection) {
	if (selection.props.type === "Polygon") {
		const coords = selection.props.polygon.coordinates.flat();
		if (coords.length === 0) return;
		const bounds = new google.maps.LatLngBounds();
		for (const [lng, lat] of coords) bounds.extend({ lat, lng });
		map.fitBounds(bounds, 100);
		return;
	}
	if ((selection.count ?? 0) === 0) return;
	const ids = await cmd.storeResolveSelection(selection.props);
	const locs = await fetchLocationsByIds(ids);
	const bounds = new google.maps.LatLngBounds();
	for (const loc of locs) bounds.extend({ lat: loc.lat, lng: loc.lng });
	map.fitBounds(bounds, 100);
}

function uniqueTagName(base: string, existing: Set<string>): string {
	if (!existing.has(base)) return base;
	for (let i = 1; ; i++) {
		const candidate = `${base} (${i})`;
		if (!existing.has(candidate)) return candidate;
	}
}

function pruneDistance(selection: Selection): number | null {
	if (selection.props.type === "Duplicates") return selection.props.distance;
	if (selection.props.type === "Intersection") {
		for (const child of selection.props.selections) {
			if (child.props.type === "Duplicates") return child.props.distance;
		}
	}
	return null;
}

// --- Pinned command toolbar ---

interface PanelDef {
	render: (onClose: () => void) => ReactNode;
}

function PinnedToolbar({ right, panels }: { right?: ReactNode; panels: Record<string, PanelDef> }) {
	const pinned = useSetting("pinnedCommands");
	const [openPanels, setOpenPanels] = useState<Set<string>>(new Set());
	const [dragIdx, setDragIdx] = useState<number | null>(null);
	const [dropIdx, setDropIdx] = useState<number | null>(null);
	useSelections();
	useSelectedLocationIds();

	useEffect(() => {
		const handler = (e: Event) => {
			const id = (e as CustomEvent).detail as string;
			if (panels[id]) setOpenPanels((prev) => {
				const next = new Set(prev);
				if (next.has(id)) next.delete(id); else next.add(id);
				return next;
			});
		};
		document.addEventListener("open-inline-panel", handler);
		return () => document.removeEventListener("open-inline-panel", handler);
	}, [panels]);

	useEffect(() => {
		if (openPanels.size === 0) return;
		let changed = false;
		const next = new Set(openPanels);
		for (const id of next) {
			const cmd = getCommand(id);
			if (cmd?.enabled && !cmd.enabled()) { next.delete(id); changed = true; }
		}
		if (changed) setOpenPanels(next);
	});

	if (pinned.length === 0 && !right) return null;
	let itemIndex = 0;
	const togglePanel = (id: string) => setOpenPanels((prev) => {
		const next = new Set(prev);
		if (next.has(id)) next.delete(id); else next.add(id);
		return next;
	});

	const handleDragStart = (i: number, e: React.MouseEvent) => {
		if (e.button !== 0) return;
		e.preventDefault();
		const startX = e.clientX;
		let started = false;

		const onMove = (me: MouseEvent) => {
			if (!started && Math.abs(me.clientX - startX) > 4) {
				started = true;
				setDragIdx(i);
			}
		};
		const onUp = () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
			if (started) {
				setDragIdx((di) => {
					setDropIdx((dri) => {
						if (di !== null && dri !== null && di !== dri) reorderPinned(di, dri);
						return null;
					});
					return null;
				});
			}
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	};

	const handleDragOver = (i: number) => {
		if (dragIdx !== null && i !== dragIdx) setDropIdx(i);
	};

	return (
		<div className="selection-manager__toolbar">
			<div className="selection-manager__bar">
				{pinned.map((id, i) => {
					if (id === "---") {
						return (
							<ContextMenu.Root key={`sep-${i}`}>
								<ContextMenu.Trigger asChild>
									<span
										className={`selection-manager__bar-sep${dragIdx === i ? " is-dragging" : ""}`}
										data-drop={dropIdx === i ? "" : undefined}
										onMouseDown={(e) => handleDragStart(i, e)}
										onMouseMove={() => handleDragOver(i)}
									/>
								</ContextMenu.Trigger>
								<ContextMenu.Portal>
									<ContextMenu.Content className="context-menu">
										<ContextMenu.Item className="context-menu__item" onSelect={() => removePinnedAt(i)}>
											Remove separator
										</ContextMenu.Item>
									</ContextMenu.Content>
								</ContextMenu.Portal>
							</ContextMenu.Root>
						);
					}
					const command = getCommand(id);
					if (!command) return null;
					const disabled = command.enabled ? !command.enabled() : false;
					const hasPanel = id in panels;
					const isOpen = openPanels.has(id);
					const tipPos = itemIndex < 3 ? "bottom-right" : "bottom";
					itemIndex++;
					const handleClick = hasPanel ? () => togglePanel(id) : command.execute;
					const isFirst = i === 0;
					const isLast = i === pinned.length - 1;

					const btn = command.icon ? (
						<button
							className={`icon-button${isOpen ? " is-active" : ""}${disabled ? " is-disabled" : ""}${dragIdx === i ? " is-dragging" : ""}`}
							type="button"
							role="tooltip"
							data-microtip-position={tipPos}
							aria-label={command.label}
							data-qa={id}
							data-drop={dropIdx === i ? "" : undefined}
							onClick={disabled ? undefined : handleClick}
							onMouseDown={(e) => handleDragStart(i, e)}
							onMouseMove={() => handleDragOver(i)}
						>
							<Icon path={command.icon} />
						</button>
					) : (
						<button
							className={`button${isOpen ? " is-active" : ""}${disabled ? " is-disabled" : ""}${dragIdx === i ? " is-dragging" : ""}`}
							type="button"
							role="tooltip"
							data-microtip-position={tipPos}
							aria-label={command.label}
							data-drop={dropIdx === i ? "" : undefined}
							onClick={disabled ? undefined : handleClick}
							onMouseDown={(e) => handleDragStart(i, e)}
							onMouseMove={() => handleDragOver(i)}
						>
							{command.label}
						</button>
					);

					return (
						<ContextMenu.Root key={id}>
							<ContextMenu.Trigger asChild>
								{btn}
							</ContextMenu.Trigger>
							<ContextMenu.Portal>
								<ContextMenu.Content className="context-menu">
									{!isFirst && (
										<ContextMenu.Item className="context-menu__item" onSelect={() => movePinnedCommand(i, -1)}>
											Move left
										</ContextMenu.Item>
									)}
									{!isLast && (
										<ContextMenu.Item className="context-menu__item" onSelect={() => movePinnedCommand(i, 1)}>
											Move right
										</ContextMenu.Item>
									)}
									<ContextMenu.Separator style={{ height: 1, background: "#0000001a", margin: "4px 0" }} />
									<ContextMenu.Item className="context-menu__item" onSelect={() => insertSeparator(i, "before")}>
										Add separator before
									</ContextMenu.Item>
									<ContextMenu.Item className="context-menu__item" onSelect={() => insertSeparator(i, "after")}>
										Add separator after
									</ContextMenu.Item>
									<ContextMenu.Separator style={{ height: 1, background: "#0000001a", margin: "4px 0" }} />
									<ContextMenu.Item className="context-menu__item" onSelect={() => removePinnedAt(i)}>
										Remove from toolbar
									</ContextMenu.Item>
								</ContextMenu.Content>
							</ContextMenu.Portal>
						</ContextMenu.Root>
					);
				})}
				{right}
			</div>
			{Object.entries(panels).map(([id, panel]) => (
				<div key={id} className="selection-manager__panel" hidden={!openPanels.has(id)}>
					{panel.render(() => setOpenPanels((prev) => { const next = new Set(prev); next.delete(id); return next; }))}
				</div>
			))}
		</div>
	);
}

function RandomPickPanel() {
	const [value, setValue] = useState("");
	const total = useSelectedLocationIds().size;
	const parsed = Math.floor(Number(value));
	const valid = value.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
	const count = valid ? Math.min(parsed, total) : 0;
	return (
		<form
			className="selection-manager__inline-form"
			onSubmit={(e) => {
				e.preventDefault();
				if (!valid) return;
				const picked = selectRandomFromSelection(count);
				if (picked > 0) toast(`Selected ${fmt.format(picked)} random location${picked !== 1 ? "s" : ""}`);
			}}
		>
			<input
				className="input"
				type="number"
				min={1}
				style={{ width: "7rem" }}
				placeholder="Count"
				value={value}
				onChange={(e) => setValue(e.target.value)}
			/>
			<span style={{ opacity: 0.6 }}>of {fmt.format(total)}</span>
			<button className="button" type="submit" disabled={!valid}>
				Pick
			</button>
		</form>
	);
}

// --- Mouse-based drag system (HTML5 DnD is broken in Tauri webview) ---
interface DragState {
	key: string;
	parentKey: string | null;
	startY: number;
	altKey: boolean;
}

let activeDrag: DragState | null = null;
let dragListeners: (() => void)[] = [];
function notifyDragListeners() {
	dragListeners.forEach((fn) => fn());
}

function useDragState() {
	const [, setTick] = useState(0);
	useEffect(() => {
		const fn = () => setTick((t) => t + 1);
		dragListeners.push(fn);
		return () => {
			dragListeners = dragListeners.filter((l) => l !== fn);
		};
	}, []);
	return activeDrag;
}

function SelectionRow({
	selection,
	depth = 0,
	parentKey,
	onRemove,
	inheritedGhost = false,
}: {
	selection: Selection;
	depth?: number;
	parentKey?: string | null;
	onRemove?: () => void;
	inheritedGhost?: boolean;
}) {
	const map = useCurrentMap();
	const ghostedKeys = useGhostedSelections();
	const isTopLevel = depth === 0;
	const ghosted = inheritedGhost || (isTopLevel && ghostedKeys.has(selection.key));
	const [view, setView] = useState<"contextmenu" | "color">("contextmenu");
	const [dropZone, setDropZone] = useState<"before" | "on" | "after" | null>(null);
	const [editingFilter, setEditingFilter] = useState(false);
	const [savingTag, setSavingTag] = useState(false);
	const [tagName, setTagName] = useState("");
	const rowRef = useRef<HTMLDivElement>(null);
	const drag = useDragState();
	const isDragging = drag?.key === selection.key;
	const isDropTarget = drag != null && drag.key !== selection.key;
	const handleColorChange = useCallback(
		(c: { r: number; g: number; b: number }) => {
			setSelectionColors([{ key: selection.key, color: [c.r, c.g, c.b] }]);
		},
		[selection.key],
	);

	const fieldEntries = useExtraFieldKeys();

	if (!map) return null;
	const inner = selection.props.type === "Invert" ? selection.props.selections[0] : selection;
	const stepFilter = (() => {
		const p = selection.props;
		if (p.type !== "Filter") return null;
		const ft = fieldEntries.find((f) => f.key === p.field)?.fieldType;
		const wallClock = p.tzLocal ?? false;
		if (stepFilterWindow(ft, p.op, p.value, p.value2, 1, wallClock) == null) return null;
		return (dir: 1 | -1) => {
			const next = stepFilterWindow(ft, p.op, p.value, p.value2, dir, wallClock);
			if (next) {
				updateFilterSelection(selection.key, {
					type: "Filter",
					field: p.field,
					op: p.op,
					tzLocal: p.tzLocal,
					value: next.value,
					value2: next.value2,
				});
			}
		};
	})();
	const showChildren = inner.props.type === "Intersection" || inner.props.type === "Union";
	const isPoly = selection.props.type === "Polygon";
	const colorBlockCss =
		inner.props.type === "Tag"
			? (map.meta.tags[inner.props.tagId]?.color ?? rgbCss(selection.color))
			: rgbCss(selection.color);

	const handleRename = () => {
		if (selection.props.type !== "Polygon") return;
		const current = selection.props.polygon.properties?.name ?? "";
		const next = window.prompt("Polygon name", current);
		if (next != null) setPolygonName(selection.key, next);
	};

	const handleSaveAsTag = async () => {
		const name = tagName.trim();
		if (!name) return;
		const ids = await cmd.storeResolveSelection(selection.props);
		if (ids.length === 0) return;
		const [tag] = await createTags([name]);
		await addTagToLocations(tag.id, ids);
		setSavingTag(false);
		setTagName("");
	};

	const handleDownloadGeoJSON = () => {
		if (selection.props.type !== "Polygon") return;
		const poly = selection.props.polygon;
		const name = poly.properties?.name ?? "polygon";
		const fc = {
			type: "Feature",
			properties: poly.properties ?? {},
			geometry: { type: "Polygon", coordinates: poly.coordinates },
		};
		const blob = new Blob([JSON.stringify(fc)], { type: "application/geo+json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${name}.geojson`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const handleMouseDown = (e: React.MouseEvent) => {
		if (e.button !== 0) return;
		if ((e.target as HTMLElement).closest("button, [role='menu']")) return;
		e.preventDefault();
		const startY = e.clientY;
		const key = selection.key;
		const pk = parentKey ?? null;
		let started = false;

		const onMove = (me: MouseEvent) => {
			if (!started && Math.abs(me.clientY - startY) > 4) {
				started = true;
				activeDrag = { key, parentKey: pk, startY, altKey: me.altKey };
				notifyDragListeners();
			}
			if (started && activeDrag) {
				activeDrag = { ...activeDrag, altKey: me.altKey };
				notifyDragListeners();
			}
		};

		const onUp = () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("keyup", onKeyUp);
			if (started) {
				activeDrag = null;
				notifyDragListeners();
			}
		};

		const onKey = (ke: KeyboardEvent) => {
			if (ke.key === "Escape") {
				activeDrag = null;
				notifyDragListeners();
				onUp();
				return;
			}
			if (activeDrag) {
				activeDrag = { ...activeDrag, altKey: ke.altKey };
				notifyDragListeners();
			}
		};
		const onKeyUp = (ke: KeyboardEvent) => {
			if (activeDrag) {
				activeDrag = { ...activeDrag, altKey: ke.altKey };
				notifyDragListeners();
			}
		};

		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
		window.addEventListener("keydown", onKey);
		window.addEventListener("keyup", onKeyUp);
	};

	const handleMouseMove = (e: React.MouseEvent) => {
		if (!isDropTarget || !rowRef.current) return;
		const rect = rowRef.current.getBoundingClientRect();
		const y = (e.clientY - rect.top) / rect.height;
		const zone = y < 0.25 ? ("before" as const) : y > 0.75 ? ("after" as const) : ("on" as const);
		setDropZone(zone);
	};

	const handleMouseLeave = () => {
		if (isDropTarget) setDropZone(null);
	};

	const handleMouseUp = () => {
		if (!isDropTarget || !drag || !dropZone) return;
		if (dropZone === "on") {
			composeSelections(
				drag.key,
				selection.key,
				drag.altKey ? "Union" : "Intersection",
				drag.parentKey,
				parentKey ?? null,
			);
		} else {
			if (drag.parentKey) decomposeChild(drag.parentKey, drag.key);
			reorderSelection(drag.key, selection.key, dropZone);
		}
		setDropZone(null);
	};

	return (
		<>
			<div
				ref={rowRef}
				className={`selection-row${isDragging ? " is-dragging" : ""}${ghosted ? " is-ghosted" : ""}`}
				data-drop={isDropTarget ? (dropZone ?? undefined) : undefined}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
				onMouseUp={handleMouseUp}
			>
				<span
					className="selection-row__label"
					style={{ paddingLeft: `${depth * 2}rem` }}
					onClick={() => {
						if (drag) return;
						const gMap = getGoogleMapInstance();
						if (gMap && map) fitSelectionBounds(gMap, selection);
					}}
				>
					<span className="color-block" style={{ backgroundColor: colorBlockCss }} />{" "}
					{selectionDisplayName(map, selection)}
				</span>
				{isDropTarget && dropZone === "on" && (
					<span className="selection-row__drop-hint">{drag?.altKey ? "OR" : "AND"}</span>
				)}
				<span className="selection-row__size">{fmt.format(selection.count ?? 0)}</span>
				<span className="selection-row__actions">
					{stepFilter && (
						<>
							<button
								className="icon-button"
								type="button"
								aria-label="Previous period"
								onClick={() => stepFilter(-1)}
							>
								<Icon path={mdiChevronLeft} size={18} />
							</button>
							<button
								className="icon-button"
								type="button"
								aria-label="Next period"
								onClick={() => stepFilter(1)}
							>
								<Icon path={mdiChevronRight} size={18} />
							</button>
						</>
					)}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger asChild>
							<button className="icon-button" type="button" aria-label="Selection options">
								<Icon path={mdiDotsVertical} />
							</button>
						</DropdownMenu.Trigger>
						<DropdownMenu.Portal>
							<DropdownMenu.Content
								className="context-menu"
								align="end"
								onCloseAutoFocus={() => setView("contextmenu")}
							>
								{view === "color" ? (
									<div style={{ padding: "0.5rem", width: "14rem" }}>
										<RgbColorPicker
											color={{
												r: selection.color[0],
												g: selection.color[1],
												b: selection.color[2],
											}}
											onChange={handleColorChange}
										/>
									</div>
								) : (
									<>
										<DropdownMenu.Item
											className="context-menu__item"
											onSelect={() => selectInverse([selection.key])}
										>
											Invert selection
										</DropdownMenu.Item>
										{selection.props.type === "Filter" && (
											<DropdownMenu.Item
												className="context-menu__item"
												onSelect={() => setEditingFilter(true)}
											>
												Edit filter
											</DropdownMenu.Item>
										)}
										<DropdownMenu.Item
											className="context-menu__item"
											disabled={(selection.count ?? 0) === 0}
											onSelect={async () => {
												const ids = await cmd.storeResolveSelection(selection.props);
												beginReview(ids, selection);
											}}
										>
											Review selection
										</DropdownMenu.Item>
										{selection.props.type !== "Tag" && (
											<DropdownMenu.Item
												className="context-menu__item"
												disabled={(selection.count ?? 0) === 0}
												onSelect={() => {
													const names = new Set(Object.values(map.meta.tags).map((t) => t.name));
													setTagName(uniqueTagName(selectionDisplayName(map, selection), names));
													setSavingTag(true);
												}}
											>
												Save as tag
											</DropdownMenu.Item>
										)}
										{pruneDistance(selection) != null && (
											<DropdownMenu.Item
												className="context-menu__item"
												disabled={(selection.count ?? 0) === 0}
												onSelect={async () => {
													const n = await pruneDuplicates(selection.props, pruneDistance(selection)!);
													toast(`Pruned ${fmt.format(n)} duplicate${n === 1 ? "" : "s"}`);
												}}
											>
												Prune duplicates
											</DropdownMenu.Item>
										)}
										{selection.props.type !== "Tag" && (
											<DropdownMenu.Item
												className="context-menu__item"
												onSelect={(e) => {
													e.preventDefault();
													setView("color");
												}}
											>
												Change color
											</DropdownMenu.Item>
										)}
										{isPoly && (
											<>
												<DropdownMenu.Separator
													style={{ height: 1, background: "#0000001a", margin: "4px 0" }}
												/>
												<DropdownMenu.Item
													className="context-menu__item"
													onSelect={handleDownloadGeoJSON}
												>
													Download GeoJSON
												</DropdownMenu.Item>
												<DropdownMenu.Item className="context-menu__item" onSelect={handleRename}>
													Rename
												</DropdownMenu.Item>
											</>
										)}
										{onRemove && (
											<>
												<DropdownMenu.Separator
													style={{ height: 1, background: "#0000001a", margin: "4px 0" }}
												/>
												<DropdownMenu.Item className="context-menu__item" onSelect={onRemove}>
													Deselect
												</DropdownMenu.Item>
											</>
										)}
									</>
								)}
							</DropdownMenu.Content>
						</DropdownMenu.Portal>
					</DropdownMenu.Root>
					{isTopLevel && (
						<button
							className="icon-button"
							type="button"
							aria-label={ghosted ? "Un-ghost selection" : "Ghost selection"}
							title="Ghost selection (Alt-click to isolate)"
							onClick={(e) =>
								e.altKey ? isolateSelection(selection.key) : toggleGhostSelection(selection.key)
							}
						>
							<Icon path={ghosted ? mdiGhost : mdiGhostOutline} />
						</button>
					)}
					{onRemove && (
						<button className="icon-button" type="button" onClick={onRemove} aria-label="Deselect">
							<Icon path={mdiClose} />
						</button>
					)}
				</span>
			</div>
			{editingFilter && selection.props.type === "Filter" && (
				<FilterForm
					initial={filterPropsToSeed(selection.props)}
					submitLabel="Update filter"
					onSubmit={(field, op, value, value2, tzLocal) =>
						updateFilterSelection(selection.key, { type: "Filter", field, op, value, value2, tzLocal })
					}
					onClose={() => setEditingFilter(false)}
				/>
			)}
			<Dialog
				open={savingTag}
				onOpenChange={(v) => {
					setSavingTag(v);
					if (!v) setTagName("");
				}}
			>
				<DialogContent title="Save selection as tag">
					<form
						onSubmit={(e) => {
							e.preventDefault();
							handleSaveAsTag();
						}}
						style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: 4 }}
					>
						<input
							className="input"
							value={tagName}
							onChange={(e) => setTagName(e.target.value)}
							onFocus={(e) => e.currentTarget.select()}
							placeholder="Tag name..."
							autoFocus
						/>
						<div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
							<button
								className="button"
								type="button"
								onClick={() => {
									setSavingTag(false);
									setTagName("");
								}}
							>
								Cancel
							</button>
							<button className="button button--primary" type="submit" disabled={!tagName.trim()}>
								Create tag
							</button>
						</div>
					</form>
				</DialogContent>
			</Dialog>
			{showChildren &&
				(
					inner.props as Extract<Selection["props"], { type: "Intersection" | "Union" }>
				).selections.map((child) => (
					<SelectionRow
						key={child.key}
						selection={child}
						depth={depth + 1}
						parentKey={selection.key}
						inheritedGhost={ghosted}
						onRemove={() => removeChildFromSelection(selection.key, child.key)}
					/>
				))}
		</>
	);
}

function SaveSelectionsDialog({
	open,
	onOpenChange,
	name,
	onNameChange,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	name: string;
	onNameChange: (v: string) => void;
}) {
	const map = useCurrentMap();
	const selections = useSelections();
	const saveableItems: SavedSelectionItem[] = (() => {
		if (!map) return [];
		return selections
			.map((s) => {
				const saved = selectionToSaved(s, map);
				if (!saved) return null;
				return { props: saved, color: s.color } as SavedSelectionItem;
			})
			.filter((item): item is SavedSelectionItem => item !== null);
	})();

	const handleSave = () => {
		if (!name.trim() || !map) return;
		const ok = saveCurrentSelections(name.trim(), selections, map);
		if (ok) {
			onNameChange("");
			onOpenChange(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent title="Save current selections">
				{saveableItems.length === 0 ? (
					<p>No saveable selections active.</p>
				) : (
					<form
						onSubmit={(e) => { e.preventDefault(); handleSave(); }}
						style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: 4 }}
					>
						<input
							className="input"
							value={name}
							onChange={(e) => onNameChange(e.target.value)}
							placeholder="Name this selection..."
							autoFocus
						/>
						<div className="saved-selection-row__rules">
							{saveableItems.map((item, i) => (
								<span key={i} className="saved-selection-row__chip">
									<span
										className="saved-selection-row__dot"
										style={{ background: `rgb(${item.color[0]},${item.color[1]},${item.color[2]})` }}
									/>
									{describeRule(item.props)}
								</span>
							))}
						</div>
						<div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
							<button className="button" type="button" onClick={() => onOpenChange(false)}>Cancel</button>
							<button className="button button--primary" type="submit" disabled={!name.trim()}>Save</button>
						</div>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}

function ApplySavedSelectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
	const map = useCurrentMap();
	const saved = useSetting("savedSelections");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent title="Apply saved selection">
				{saved.length === 0 ? (
					<p>No saved selections.</p>
				) : (
					<div className="saved-selection-list">
						{saved.map((s) => (
							<div
								key={s.id}
								className="saved-selection-row"
								onClick={() => {
									if (map) {
										applySavedSelection(s, map);
										onOpenChange(false);
									}
								}}
							>
								<div className="saved-selection-row__header">
									<span className="saved-selection-row__name">{s.name}</span>
									<button
										className="saved-selection-row__delete"
										onClick={(e) => { e.stopPropagation(); deleteSavedSelection(s.id); }}
										title="Delete"
									>
										<Icon path={mdiClose} size={14} />
									</button>
								</div>
								<div className="saved-selection-row__rules">
									{s.items.map((item, i) => (
										<span key={i} className="saved-selection-row__chip">
											<span
												className="saved-selection-row__dot"
												style={{ background: `rgb(${item.color[0]},${item.color[1]},${item.color[2]})` }}
											/>
											{describeRule(item.props)}
										</span>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

export function MapOverview({ hidden }: { hidden?: boolean }) {
	const map = useCurrentMap();
	const selected = useSelectedLocationIds();
	const selections = useSelections();
	const [bulkTagInput, setBulkTagInput] = useState("");
	const tagSortMode = useSetting("tagSortMode");
	const [selectionsCollapsed, setSelectionsCollapsed] = useState(false);
	const [dupDistance, setDupDistance] = useState(1);
	const [showTagFindReplace, setShowTagFindReplace] = useState(false);
	const [showMergeDuplicates, setShowMergeDuplicates] = useState(false);
	const [showReviews, setShowReviews] = useState(false);
	const [showApplyFieldAsTags, setShowApplyFieldAsTags] = useState(false);
	const [showSaveSelections, setShowSaveSelections] = useState(false);
	const [showApplySaved, setShowApplySaved] = useState(false);
	const [saveSelName, setSaveSelName] = useState("");

	useEffect(() => {
		const handler = () => setShowTagFindReplace(true);
		document.addEventListener("open-tag-find-replace", handler);
		return () => document.removeEventListener("open-tag-find-replace", handler);
	}, []);

	useEffect(() => {
		const handler = () => setShowApplyFieldAsTags(true);
		document.addEventListener("open-apply-field-as-tags", handler);
		return () => document.removeEventListener("open-apply-field-as-tags", handler);
	}, []);

	useEffect(() => {
		const handler = () => setShowMergeDuplicates(true);
		document.addEventListener("open-merge-duplicates", handler);
		return () => document.removeEventListener("open-merge-duplicates", handler);
	}, []);

	useEffect(() => {
		const handler = () => {
			if (selected.size > 0) beginReview(Array.from(selected));
		};
		document.addEventListener("open-review-selected", handler);
		return () => document.removeEventListener("open-review-selected", handler);
	}, [selected]);

	useEffect(() => {
		const handler = () => setShowSaveSelections(true);
		document.addEventListener("open-save-selections", handler);
		return () => document.removeEventListener("open-save-selections", handler);
	}, []);

	useEffect(() => {
		const handler = () => setShowApplySaved(true);
		document.addEventListener("open-apply-saved-selection", handler);
		return () => document.removeEventListener("open-apply-saved-selection", handler);
	}, []);

	if (!map) return null;

	const handleBulkAddTag = async (e: React.FormEvent) => {
		e.preventDefault();
		const name = bulkTagInput.trim();
		if (!name || selected.size === 0) return;
		const [resolved] = await createTags([name]);
		addTagToLocations(resolved.id, [...selected]);
		setBulkTagInput("");
	};

	const bulkSuggestions = (() => {
		const all = sortTagsByMode(getVisibleTags(), tagSortMode, getTagCounts());
		const q = bulkTagInput.trim().toLowerCase();
		return (q ? all.filter((t) => t.name.toLowerCase().includes(q)) : all).slice(0, 15);
	})();

	const handleBulkPick = (t: Tag) => {
		if (selected.size === 0) return;
		addTagToLocations(t.id, [...selected]);
		setBulkTagInput("");
	};

	const hasSelection = selected.size > 0;
	const hasSelections = selections.length > 0;

	return (
		<section className="map-overview" hidden={hidden}>
			<TagManager />

			<ToolBlock
				className="selection-manager"
				title="Selections"
				isCollapsed={selectionsCollapsed}
				onCollapse={setSelectionsCollapsed}
				collapsedAddons={<span>{fmt.format(selected.size)} selected</span>}
				addons={
					<>
						<span className="selection-manager__count">
							{fmt.format(selected.size)} selected
						</span>
						<span className="selection-manager__space" />
						<PluginToolbar />
						<button
							className="icon-button"
							type="button"
							role="tooltip"
							data-microtip-position="bottom"
							aria-label="Review sessions"
							data-qa="open-reviews"
							onClick={() => setShowReviews(true)}
						>
							<Icon path={mdiBookOpenOutline} />
						</button>
						<button
							className="button"
							onClick={() => document.dispatchEvent(new CustomEvent("open-command-palette"))}
						>
							Commands...
						</button>
					</>
				}
			>
				{hasSelections && (
					<div className="selection-manager__selections">
						{selections.map((sel) => (
							<SelectionRow
								key={sel.key}
								selection={sel}
								onRemove={() => removeSelections([sel.key])}
							/>
						))}
					</div>
				)}

				<PinnedToolbar
					right={
						<form className="selection-manager__bulk-tag" onSubmit={handleBulkAddTag}>
							<span className={`tag-input has-button${!hasSelection ? " is-disabled" : ""}`}>
								<button type="submit" className="button tag-input__button" disabled={!hasSelection}>+</button>
								<SuggestInput
									containerClassName="tag-input__suggest"
									inputClassName="tag-input__value"
									placeholder="Bulk-add tag..."
									disabled={!hasSelection}
									value={bulkTagInput}
									onChange={setBulkTagInput}
									suggestions={bulkSuggestions}
									getKey={(t) => t.id}
									onPick={handleBulkPick}
									renderItem={(t) => t.name}
									pickOnEnter={false}
									listStyle={{ top: "100%", right: 0, zIndex: 10 }}
								/>
							</span>
						</form>
					}
					panels={{
						"select-random": {
							render: () => <RandomPickPanel />,
						},
						"find-duplicates": {
							render: () => (
								<form
									className="selection-manager__inline-form"
									onSubmit={(e) => {
										e.preventDefault();
										selectDuplicates(dupDistance);
									}}
								>
									<label>
										Distance (m):{" "}
										<input
											type="number"
											className="input"
											min="0"
											style={{ width: "5rem" }}
											value={dupDistance}
											onChange={(e) => setDupDistance(Number(e.target.value))}
										/>
									</label>
									<button className="button" type="submit">Find</button>
									<button className="button" type="button" onClick={() => setShowMergeDuplicates(true)}>
										Merge
									</button>
								</form>
							),
						},
						"filter-by-metadata": {
							render: () => (
								<FilterForm
									persistKey={map.meta.id}
									submitLabel="Add filter"
									onSubmit={(field, op, value, value2, tzLocal) => {
										selectFilter(field, op, value, value2, tzLocal);
									}}
								/>
							),
						},
					}}
				/>
			</ToolBlock>

			<TagFindReplaceDialog open={showTagFindReplace} onOpenChange={setShowTagFindReplace} />
			<ApplyFieldAsTagsDialog open={showApplyFieldAsTags} onOpenChange={setShowApplyFieldAsTags} />
			<MergeDuplicatesModal
				open={showMergeDuplicates}
				onOpenChange={setShowMergeDuplicates}
				distance={dupDistance}
			/>
			<ReviewSessionsModal open={showReviews} onOpenChange={setShowReviews} />

			<SaveSelectionsDialog
				open={showSaveSelections}
				onOpenChange={setShowSaveSelections}
				name={saveSelName}
				onNameChange={setSaveSelName}
			/>
			<ApplySavedSelectionDialog
				open={showApplySaved}
				onOpenChange={setShowApplySaved}
			/>
		</section>
	);
}
