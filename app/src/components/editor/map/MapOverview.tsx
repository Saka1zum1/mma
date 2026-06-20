import { useState, useEffect, useCallback, useRef } from "react";
import {
	useCurrentMap,
	useSelectedLocationIds,
	useSelections,
	removeLocations,
	removeSelections,
	resetSelections,
	selectIntersection,
	selectUnion,
	selectInverse,
	selectUntagged,
	selectUnpanned,
	selectPanoIds,
	selectNotPanoIds,
	selectUncommitted,
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
} from "@/store/useMapStore";
import { toast } from "@/lib/util/toast";
import { sortTagsByMode } from "@/lib/util/util";
import { SuggestInput } from "@/components/primitives/SuggestInput";
import { stepFilterWindow } from "@/lib/data/fieldOps";
import { useSetting } from "@/store/settings";
import { cmd } from "@/lib/commands";

import { RgbColorPicker } from "react-colorful";
import type { Selection, Tag } from "@/bindings.gen";
import { selectionDisplayName } from "@/store/selections";
import { TagManager } from "@/components/editor/tags/TagManager";
import { FilterBuilder, FilterForm, filterPropsToSeed, useExtraFieldKeys } from "@/components/editor/map/FilterBuilder";
import { ApplyFieldAsTagsDialog } from "@/components/editor/tags/ApplyFieldAsTagsDialog";
import { TagFindReplaceDialog } from "@/components/editor/tags/TagFindReplaceDialog";
import { MergeDuplicatesModal } from "@/components/dialogs/MergeDuplicatesModal";
import { ReviewSessionsModal } from "@/components/dialogs/ReviewSessions";
import { beginReview } from "@/lib/review/review";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { ToolBlock } from "@/components/primitives/ToolBlock";
import { Icon } from "@/components/primitives/Icon";
import { mdiClose, mdiChevronLeft, mdiChevronRight, mdiDotsVertical, mdiGhost, mdiGhostOutline } from "@mdi/js";
import { PluginToolbar } from "@/plugins/PluginPanels";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { fmt } from "@/lib/util/format";
import { rgbCss } from "@/lib/util/color";
import { getGoogleMap as getGoogleMapInstance } from "@/lib/map/mapState";
import { loadGeoJSON } from "@/lib/util/loadGeoJSON";

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

// Distance for "Prune duplicates": on a Duplicates selection directly, or an
// Intersection containing one (prune then runs on the intersection's resolved
// locations).
function pruneDistance(selection: Selection): number | null {
	if (selection.props.type === "Duplicates") return selection.props.distance;
	if (selection.props.type === "Intersection") {
		for (const child of selection.props.selections) {
			if (child.props.type === "Duplicates") return child.props.distance;
		}
	}
	return null;
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
	// Window filters (between on date/month/number) step inline by their own span.
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
										{isTopLevel && (
											<DropdownMenu.Item
												className="context-menu__item"
												onSelect={() => toggleGhostSelection(selection.key)}
											>
												{ghosted ? "Un-ghost selection" : "Ghost selection"}
											</DropdownMenu.Item>
										)}
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

export function MapOverview() {
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

	const handleDeleteSelected = () => {
		if (selected.size === 0) return;
		removeLocations(selected);
	};

	const hasPolygon = selections.some((s) => s.props.type === "Polygon");

	const handleDownloadGeoJSON = () => {
		const features: unknown[] = [];
		for (const sel of selections) {
			if (sel.props.type !== "Polygon") continue;
			features.push({
				type: "Feature",
				properties: sel.props.polygon.properties ?? {},
				geometry: { type: "Polygon", coordinates: sel.props.polygon.coordinates },
			});
		}
		const fc = { type: "FeatureCollection", features };
		const blob = new Blob([JSON.stringify(fc)], { type: "application/geo+json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "selections.geojson";
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<section className="map-overview">
			<TagManager />

			<ToolBlock
				className="selection-manager"
				title="Selections"
				isCollapsed={selectionsCollapsed}
				onCollapse={setSelectionsCollapsed}
				collapsedAddons={<span>({fmt.format(selected.size)} locations selected)</span>}
				addons={
					<>
						<span>({fmt.format(selected.size)} locations selected)</span>
						<span className="selection-manager__space" />
						<button className="button" disabled={selections.length === 0} onClick={resetSelections}>
							Deselect all
						</button>
						<DropdownMenu.Root>
							<DropdownMenu.Trigger asChild>
								<button className="button">More</button>
							</DropdownMenu.Trigger>
							<DropdownMenu.Portal>
								<DropdownMenu.Content className="context-menu" align="end">
									<DropdownMenu.Item className="context-menu__item" onSelect={loadGeoJSON}>
										Load polygon selections from GeoJSON
									</DropdownMenu.Item>
									<DropdownMenu.Item
										className="context-menu__item"
										disabled={!hasPolygon}
										onSelect={handleDownloadGeoJSON}
									>
										Download polygon selections as GeoJSON
									</DropdownMenu.Item>
									<DropdownMenu.Item
										className="context-menu__item"
										disabled={selections.length < 2}
										onSelect={() => selectIntersection()}
									>
										AND all selections
									</DropdownMenu.Item>
									<DropdownMenu.Item
										className="context-menu__item"
										disabled={selections.length < 2}
										onSelect={() => selectUnion()}
									>
										OR all selections
									</DropdownMenu.Item>
									<DropdownMenu.Item
										className="context-menu__item"
										disabled={selections.length === 0}
										onSelect={() => selectInverse()}
									>
										Invert all selections
									</DropdownMenu.Item>
									<DropdownMenu.Sub>
										<DropdownMenu.SubTrigger className="context-menu__item">
											Select locations
											<span style={{ float: "right" }}>
												<Icon path={mdiChevronRight} />
											</span>
										</DropdownMenu.SubTrigger>
										<DropdownMenu.Portal>
											<DropdownMenu.SubContent
												className="context-menu"
												sideOffset={2}
												alignOffset={-6}
											>
												<DropdownMenu.Item
													className="context-menu__item"
													onSelect={() => selectUntagged()}
												>
													No tags
												</DropdownMenu.Item>
												<DropdownMenu.Item
													className="context-menu__item"
													onSelect={() => selectUnpanned()}
												>
													Panned north
												</DropdownMenu.Item>
												<DropdownMenu.Item
													className="context-menu__item"
													onSelect={() => selectPanoIds()}
												>
													Pano IDs
												</DropdownMenu.Item>
												<DropdownMenu.Item
													className="context-menu__item"
													onSelect={() => selectNotPanoIds()}
												>
													Not Pano IDs
												</DropdownMenu.Item>
												<DropdownMenu.Item
													className="context-menu__item"
													onSelect={() => selectUncommitted()}
												>
													Uncommitted
												</DropdownMenu.Item>
											</DropdownMenu.SubContent>
										</DropdownMenu.Portal>
									</DropdownMenu.Sub>
								</DropdownMenu.Content>
							</DropdownMenu.Portal>
						</DropdownMenu.Root>
					</>
				}
			>
				{selections.length > 0 && (
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
				<div style={{ marginTop: ".5rem" }}>
					<button
						className="button button--destructive"
						type="button"
						disabled={selected.size === 0}
						onClick={handleDeleteSelected}
					>
						Delete selected locations
					</button>
					<button
						className="button"
						disabled={selected.size === 0}
						style={{ marginInlineStart: "1rem" }}
						onClick={() => beginReview(Array.from(selected))}
						data-qa="selection-review"
					>
						Review selected locations
					</button>
					<button
						className="button"
						style={{ marginInlineStart: "1rem" }}
						onClick={() => setShowReviews(true)}
						data-qa="open-reviews"
					>
						Reviews...
					</button>
					<form
						style={{ display: "inline-block", marginInline: "1rem" }}
						onSubmit={handleBulkAddTag}
					>
						<span className={`tag-input ${selected.size === 0 ? "is-disabled" : ""} has-button`}>
							<button
								type="submit"
								className="button tag-input__button"
								disabled={selected.size === 0}
							>
								+
							</button>
							<SuggestInput
								containerClassName="tag-input__suggest"
								inputClassName="tag-input__value"
								placeholder="Bulk-add a tag..."
								disabled={selected.size === 0}
								value={bulkTagInput}
								onChange={setBulkTagInput}
								suggestions={bulkSuggestions}
								getKey={(t) => t.id}
								onPick={handleBulkPick}
								renderItem={(t) => t.name}
								pickOnEnter={false}
								listStyle={{ top: "100%", left: 0, zIndex: 10 }}
							/>
						</span>
					</form>
				</div>
			</ToolBlock>

			<ToolBlock
				title="Tools"
				addons={
					<>
						<PluginToolbar />
						<span style={{ flexGrow: 1 }} />
						<button
							className="button"
							onClick={() => document.dispatchEvent(new CustomEvent("open-command-palette"))}
						>
							Commands...
						</button>
					</>
				}
			>
				<p>
					<label>
						Duplicate distance (metres):{" "}
						<input
							type="number"
							className="input"
							min="0"
							style={{ width: "6rem", marginRight: "1rem" }}
							value={dupDistance}
							onChange={(e) => setDupDistance(Number(e.target.value))}
						/>
					</label>
					<button className="button" type="button" onClick={() => selectDuplicates(dupDistance)}>
						Find duplicates
					</button>{" "}
					<button className="button" type="button" onClick={() => setShowMergeDuplicates(true)}>
						Merge duplicates
					</button>
				</p>
				<FilterBuilder key={map.meta.id} mapId={map.meta.id} />
			</ToolBlock>
			<TagFindReplaceDialog open={showTagFindReplace} onOpenChange={setShowTagFindReplace} />
			<ApplyFieldAsTagsDialog open={showApplyFieldAsTags} onOpenChange={setShowApplyFieldAsTags} />
			<MergeDuplicatesModal
				open={showMergeDuplicates}
				onOpenChange={setShowMergeDuplicates}
				distance={dupDistance}
			/>
			<ReviewSessionsModal open={showReviews} onOpenChange={setShowReviews} />
		</section>
	);
}
