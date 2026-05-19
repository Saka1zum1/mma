import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
	useCurrentMap,
	useSelectedLocationIds,
	useSelections,
	removeLocations,
	removeSelection,
	resetSelections,
	selectIntersection,
	selectUnion,
	selectInverse,
	selectUntagged,
	selectUnpanned,
	selectPanoIds,
	selectNotPanoIds,
	setPolygonName,
	setSelectionColor,
	bulkAddTag,
	addTags,
	beginReview,
	selectDuplicates,
	selectFilter,
	useExtraFieldIndex,
	reorderSelection,
	composeSelections,
	decomposeChild,
	removeChildFromSelection,
} from "@/store/useMapStore";
import { cmd } from "@/lib/commands";

import { RgbColorPicker } from "react-colorful";
import type { Selection, FilterOp } from "@/store/selections";
import { selectionDisplayName } from "@/store/selections";
import { TagManager } from "@/components/editor/TagManager";
import { ToolBlock } from "@/components/primitives/ToolBlock";
import { Icon } from "@/components/primitives/Icon";
import { mdiClose, mdiChevronRight, mdiDotsVertical } from "@mdi/js";
import { PluginToolbar } from "@/plugins/PluginPanels";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { fmt } from "@/lib/util/format";
import { rgbCss } from "@/lib/util/color";
import { getGoogleMap as getGoogleMapInstance } from "@/lib/map/mapState";
import { loadGeoJSON } from "@/lib/util/loadGeoJSON.add";

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
	const { fetchLocationsByIds } = await import("@/store/useMapStore");
	const locs = await fetchLocationsByIds(ids);
	const bounds = new google.maps.LatLngBounds();
	for (const loc of locs) bounds.extend({ lat: loc.lat, lng: loc.lng });
	map.fitBounds(bounds, 100);
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
}: {
	selection: Selection;
	depth?: number;
	parentKey?: string | null;
	onRemove?: () => void;
}) {
	const map = useCurrentMap();
	const [view, setView] = useState<"contextmenu" | "color">("contextmenu");
	const [dropZone, setDropZone] = useState<"before" | "on" | "after" | null>(null);
	const rowRef = useRef<HTMLDivElement>(null);
	const drag = useDragState();
	const isDragging = drag?.key === selection.key;
	const isDropTarget = drag != null && drag.key !== selection.key;
	const handleColorChange = useCallback(
		(c: { r: number; g: number; b: number }) => {
			setSelectionColor(selection.key, [c.r, c.g, c.b]);
		},
		[selection.key],
	);

	if (!map) return null;
	const inner = selection.props.type === "Invert" ? selection.props.selections[0] : selection;
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
				drag.altKey ? "union" : "intersection",
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
				className={`selection-row${isDragging ? " is-dragging" : ""}`}
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
										<DropdownMenu.Item
											className="context-menu__item"
											disabled={(selection.count ?? 0) === 0}
											onSelect={async () => {
												const ids = await cmd.storeResolveSelection(selection.props);
												beginReview(ids);
											}}
										>
											Review selection
										</DropdownMenu.Item>
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
					{onRemove && (
						<button className="icon-button" type="button" onClick={onRemove} aria-label="Deselect">
							<Icon path={mdiClose} />
						</button>
					)}
				</span>
			</div>
			{showChildren &&
				(
					inner.props as Extract<Selection["props"], { type: "Intersection" | "Union" }>
				).selections.map((child) => (
					<SelectionRow
						key={child.key}
						selection={child}
						depth={depth + 1}
						parentKey={selection.key}
						onRemove={() => removeChildFromSelection(selection.key, child.key)}
					/>
				))}
		</>
	);
}

const KNOWN_FIELD_LABELS: Record<string, string> = {
	countryCode: "Country code",
	cameraType: "Camera type",
	panoType: "Pano type",
	imageDate: "Image date",
	altitude: "Altitude",
	datetime: "Exact date",
	timezone: "Timezone",
	createdAt: "Created",
	modifiedAt: "Modified",
};
const ALL_OPS: FilterOp[] = [
	"eq",
	"neq",
	"gt",
	"lt",
	"gte",
	"lte",
	"between",
	"has",
	"nothas",
];
const EQUALITY_OPS: FilterOp[] = ["eq", "neq", "has", "nothas"];
const OP_LABELS: Record<FilterOp, string> = {
	eq: "=",
	neq: "!=",
	gt: ">",
	lt: "<",
	gte: ">=",
	lte: "<=",
	between: "between",
	has: "has",
	nothas: "does not have",
};
const filterBuilderState = new Map<
	string,
	{ field: string; op: FilterOp; value: string; value2: string }
>();

function opsForType(type: string | undefined): FilterOp[] {
	if (type === "enum") return EQUALITY_OPS;
	return ALL_OPS;
}

interface FieldEntry {
	key: string;
	label: string;
	fieldType: import("@/types").ExtraFieldDef["type"];
	fieldDef?: import("@/types").ExtraFieldDef;
}

const VIRTUAL_FIELDS: FieldEntry[] = [
	{ key: "createdAt", label: "Created", fieldType: "date" },
	{ key: "modifiedAt", label: "Modified", fieldType: "date" },
];

function useExtraFieldKeys(): FieldEntry[] {
	const index = useExtraFieldIndex();
	const map = useCurrentMap();
	const defs = map?.meta.extra?.fields;
	return useMemo(() => {
		const seen = new Set<string>();
		const entries: FieldEntry[] = [];
		for (const [key, stats] of index.entries()) {
			seen.add(key);
			const def = defs?.[key];
			const fallbackNumeric = stats.numericCount > stats.count / 2;
			entries.push({
				key,
				label: def?.label ?? KNOWN_FIELD_LABELS[key] ?? key,
				fieldType: def?.type ?? (fallbackNumeric ? "number" : "string"),
				fieldDef: def,
			});
		}
		if (defs) {
			for (const [key, def] of Object.entries(defs)) {
				if (seen.has(key)) continue;
				entries.push({
					key,
					label: def.label ?? KNOWN_FIELD_LABELS[key] ?? key,
					fieldType: def.type ?? "string",
					fieldDef: def,
				});
			}
		}
		for (const vf of VIRTUAL_FIELDS) {
			if (!seen.has(vf.key)) entries.push(vf);
		}
		return entries;
	}, [index, defs]);
}

function unixToDatetimeLocal(unix: string): string {
	const n = Number(unix);
	if (!unix || isNaN(n)) return "";
	return new Date(n * 1000).toISOString().slice(0, 16);
}

function datetimeLocalToUnix(dt: string): string {
	if (!dt) return "";
	return String(Math.floor(new Date(dt).getTime() / 1000));
}

const TIMEZONE_VALUES = Intl.supportedValuesOf("timeZone");

function useEnumValues(
	fieldKey: string | undefined,
	def: import("@/types").ExtraFieldDef | undefined,
): string[] {
	const [values, setValues] = useState<string[]>([]);
	useEffect(() => {
		if (def?.values) {
			setValues(def.values);
			return;
		}
		if (fieldKey === "timezone") {
			setValues(TIMEZONE_VALUES);
			return;
		}
		if (!fieldKey) {
			setValues([]);
			return;
		}
		cmd.storeExtraFieldValues(fieldKey).then(setValues);
	}, [fieldKey, def]);
	return values;
}

function FilterValueInput({
	fieldEntry,
	value,
	onChange,
	placeholder,
}: {
	fieldEntry: FieldEntry | undefined;
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
}) {
	const type = fieldEntry?.fieldType;
	const def = fieldEntry?.fieldDef;
	const enumValues = useEnumValues(fieldEntry?.key, def);

	if (type === "enum") {
		return (
			<select className="nselect" value={value} onChange={(e) => onChange(e.target.value)}>
				<option value="">--</option>
				{enumValues.map((v) => (
					<option key={v} value={v}>
						{def?.labels?.[v] ?? v}
					</option>
				))}
			</select>
		);
	}

	if (type === "date") {
		return (
			<input
				className="input"
				type="datetime-local"
				value={unixToDatetimeLocal(value)}
				onChange={(e) => onChange(datetimeLocalToUnix(e.target.value))}
			/>
		);
	}

	if (type === "month") {
		return (
			<input
				className="input"
				type="month"
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
		);
	}

	if (type === "number") {
		return (
			<input
				className="input"
				type="number"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder ?? "Value"}
			/>
		);
	}

	return (
		<input
			className="input"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder ?? "Value"}
		/>
	);
}

function FilterBuilder({ mapId }: { mapId: string }) {
	const fields = useExtraFieldKeys();
	const saved = filterBuilderState.get(mapId);
	const [field, setField] = useState(saved?.field ?? "");
	const [op, setOp] = useState<FilterOp>(saved?.op ?? "eq");
	const [value, setValue] = useState(saved?.value ?? "");
	const [value2, setValue2] = useState(saved?.value2 ?? "");
	useEffect(() => {
		if (!field && fields.length > 0) setField(fields[0].key);
	}, [field, fields]);

	useEffect(() => {
		filterBuilderState.set(mapId, { field, op, value, value2 });
	}, [mapId, field, op, value, value2]);

	const fieldEntry = fields.find((f) => f.key === field);
	const isNumeric = fieldEntry?.fieldType === "number" || fieldEntry?.fieldType === "date";
	const availableOps = opsForType(fieldEntry?.fieldType);

	const handleFieldChange = (key: string) => {
		setField(key);
		const entry = fields.find((f) => f.key === key);
		const ops = opsForType(entry?.fieldType);
		if (!ops.includes(op)) setOp(ops[0]);
		setValue("");
		setValue2("");
	};

	const needsValue = op !== "has" && op !== "nothas";
	const handleAdd = () => {
		if (!field) return;
		if (needsValue && !value) return;
		const parsed = needsValue ? (isNumeric ? Number(value) : value) : null;
		const parsed2 = op === "between" ? (isNumeric ? Number(value2) : value2) : undefined;
		selectFilter(field, op, parsed, parsed2);
	};

	return (
		<div className="extra-filter-builder">
			<label>Filter by metadata:</label>
			<select className="nselect" value={field} onChange={(e) => handleFieldChange(e.target.value)}>
				{fields.length === 0 && <option value="">No metadata yet</option>}
				{fields.map((f) => (
					<option key={f.key} value={f.key}>
						{f.label}
					</option>
				))}
			</select>
			<select
				className="nselect"
				value={op}
				onChange={(e) => setOp(e.target.value as FilterOp)}
			>
				{availableOps.map((o) => (
					<option key={o} value={o}>
						{OP_LABELS[o]}
					</option>
				))}
			</select>
			{needsValue && <FilterValueInput fieldEntry={fieldEntry} value={value} onChange={setValue} />}
			{op === "between" && (
				<FilterValueInput
					fieldEntry={fieldEntry}
					value={value2}
					onChange={setValue2}
					placeholder="Max"
				/>
			)}
			<button className="button" type="button" onClick={handleAdd}>
				Add filter
			</button>
		</div>
	);
}

export function MapOverview() {
	const map = useCurrentMap();
	const selected = useSelectedLocationIds();
	const selections = useSelections();
	const [bulkTagInput, setBulkTagInput] = useState("");
	const [selectionsCollapsed, setSelectionsCollapsed] = useState(false);
	const [dupDistance, setDupDistance] = useState(1);

	if (!map) return null;

	const handleBulkAddTag = async (e: React.FormEvent) => {
		e.preventDefault();
		const name = bulkTagInput.trim();
		if (!name || selected.size === 0) return;
		const [resolved] = await cmd.storeResolveTagNames([name]);
		addTags([resolved]);
		bulkAddTag(resolved.id);
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
								onRemove={() => removeSelection(sel.key)}
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
							<input
								className="tag-input__value"
								type="text"
								placeholder="Bulk-add a tag..."
								disabled={selected.size === 0}
								value={bulkTagInput}
								onChange={(e) => setBulkTagInput(e.target.value)}
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
					</button>
				</p>
				<FilterBuilder key={map.meta.id} mapId={map.meta.id} />
			</ToolBlock>
		</section>
	);
}
