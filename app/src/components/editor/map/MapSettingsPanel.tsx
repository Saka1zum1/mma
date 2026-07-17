import { useState, useEffect, useRef, useMemo, type RefObject } from "react";
import { NSelect } from "@/components/primitives/NSelect";
import { SwitchRow } from "@/components/primitives/SwitchRow";
import { Button } from "@/components/primitives/Button";
import { buildTileUrl, createRoadmapTileConfig, type MapStyle } from "@/lib/geo/tiles";
import {
	BUILTIN_STYLE_KEYS,
	BUILTIN_STYLE_LABELS,
	VECTOR_STYLE_KEYS,
	VECTOR_STYLE_LABELS,
} from "@/lib/geo/mapStyles";
import type { MapEmbedPrefs } from "@/store/mapEmbedPrefs";
import { Icon } from "@/components/primitives/Icon";
import { mdiCogOutline } from "@mdi/js";
import type { MapTypeKey, SvCoverageType, MarkerStyle } from "@/types";
import { ColorPicker } from "@/components/primitives/ColorPicker";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { Slider } from "@/components/primitives/Slider";
import { hexToRgbObj, rgbToHex, resolveSvColorHex } from "@/lib/util/color";
import { useMapSetting } from "@/store/useMapSetting";
import { ScoreBoundsEditor } from "./ScoreBoundsEditor";

const MAP_TYPE_LABELS: Record<MapTypeKey, string> = {
	map: "Map",
	satellite: "Satellite",
	osm: "OSM",
	vector: "Vector",
};

export interface LayerConfig {
	prefs: MapEmbedPrefs;
	setPref: <K extends keyof MapEmbedPrefs>(k: K) => (v: MapEmbedPrefs[K]) => void;
	supportsLabels: boolean;
	supportsTerrain: boolean;
	// Google styler options (borders, hide POI, styles); off for vector basemaps.
	supportsStyling: boolean;
	customStyles: { name: string; style: MapStyle[] }[];
	onManageStyles: () => void;
}

/** App-level (localStorage) prefs the panel renders. Per-map settings are read
 *  directly via `useMapSetting`, not passed in. */
export interface MapSettingsDropdownProps {
	markerStyle: MarkerStyle;
	setMarkerStyle: (v: MarkerStyle) => void;
	markerSize: number;
	setMarkerSize: (v: number) => void;
	showPerfectScoreCircle: boolean;
	setShowPerfectScoreCircle: (v: boolean) => void;
	showSearchRadiusCursor: boolean;
	setShowSearchRadiusCursor: (v: boolean) => void;
	showPreviews: boolean;
	setShowPreviews: (v: boolean) => void;
	selectOnly: boolean;
	setSelectOnly: (v: boolean) => void;
}

function SearchRadiusSlider({
	value,
	onChange,
}: {
	value: number | null;
	onChange: (v: number | null) => void;
}) {
	const [dragging, setDragging] = useState<number | null>(null);
	const display = dragging ?? value ?? 50;
	return (
		<label className="settings-popup__item settings-popup__select">
			Min search radius:{" "}
			<Slider
				min={10}
				max={500}
				step={10}
				value={display}
				onInput={(e) => setDragging(Number((e.target as HTMLInputElement).value))}
				onChange={() => {}}
				onPointerUp={() => {
					if (dragging != null) {
						onChange(dragging === 50 ? null : dragging);
						setDragging(null);
					}
				}}
				style={{ width: 80, verticalAlign: "middle" }}
			/>{" "}
			<span className="mono">{display}m</span>
		</label>
	);
}

function SettingsPopup({ layerConfig: e }: { layerConfig: LayerConfig }) {
	const { prefs: p, setPref } = e;
	return (
		<div className="layer-config">
			{/* Layers */}
			<fieldset className="layer-config__group">
				<legend className="layer-config__header">
					Layers <span className="layer-config__divider" />
				</legend>
				<SwitchRow
					className="layer-config__item"
					checked={p.showTerrain}
					disabled={!e.supportsTerrain}
					onChange={(v) => setPref("showTerrain")(v)}
					label="Terrain"
				/>
				<SwitchRow
					className="layer-config__item"
					checked
					disabled
					onChange={() => {}}
					label="Street View"
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.showLabels}
					disabled={!e.supportsLabels}
					onChange={(v) => setPref("showLabels")(v)}
					label="Labels"
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.svPanoramas}
					onChange={(v) => setPref("svPanoramas")(v)}
					label="Panoramas (requires close zoom)"
				/>
			</fieldset>
			{/* Street View */}
			<fieldset className="layer-config__group">
				<legend className="layer-config__header">
					Street&nbsp;View <span className="layer-config__divider" />
				</legend>
				<div
					className="layer-config__item"
					style={{ display: "flex", justifyContent: "space-between" }}
				>
					<span>Show lines:</span>
					<div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
						<div className="button-group">
							{[
								{ value: "official" as SvCoverageType, name: "Official" },
								{ value: "unofficial" as SvCoverageType, name: "Unofficial" },
								{ value: "default" as SvCoverageType, name: "All" },
							].map((opt) => (
								<Button
									key={opt.value}
									className="button-group__button"
									aria-checked={p.svCoverageType === opt.value}
									onClick={() => setPref("svCoverageType")(opt.value)}
								>
									{opt.name}
								</Button>
							))}
						</div>
						<ColorPicker
							color={hexToRgbObj(resolveSvColorHex(p.svColor))}
							onChange={(c) => setPref("svColor")(rgbToHex(c))}
							ariaLabel="Coverage line color"
						/>
					</div>
				</div>
				<SwitchRow
					className="layer-config__item"
					checked={p.svThickness === "high"}
					onChange={(v) => setPref("svThickness")(v ? "high" : "default")}
					label="Make the lines thinner"
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.svBlobby}
					onChange={(v) => setPref("svBlobby")(v)}
					label="Use blobby layer while zoomed out"
				/>
			</fieldset>
			{/* Settings */}
			<fieldset className="layer-config__group">
				<legend className="layer-config__header">
					Settings <span className="layer-config__divider" />
				</legend>
				<SwitchRow
					className="layer-config__item"
					checked={p.boldCountryBorders}
					disabled={!e.supportsStyling}
					onChange={(v) => setPref("boldCountryBorders")(v)}
					label="Emphasise country borders"
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.boldSubdivisionBorders}
					disabled={!e.supportsStyling}
					onChange={(v) => setPref("boldSubdivisionBorders")(v)}
					label="Emphasise subdivision borders"
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.hideRoadLabels}
					disabled={!e.supportsStyling}
					onChange={(v) => setPref("hideRoadLabels")(v)}
					label="Hide road labels"
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.hidePoi}
					disabled={!e.supportsStyling}
					onChange={(v) => setPref("hidePoi")(v)}
					label="Hide points of interest"
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.hideTransit}
					disabled={!e.supportsStyling}
					onChange={(v) => setPref("hideTransit")(v)}
					label="Hide transit"
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.hideHighways}
					disabled={!e.supportsStyling}
					onChange={(v) => setPref("hideHighways")(v)}
					label="Hide highways"
				/>
			</fieldset>
			{/* Map style */}
			<fieldset className="layer-config__group">
				<legend className="layer-config__header">
					Map&nbsp;style <span className="layer-config__divider" />
				</legend>
				{p.mapType === "vector" ? (
					<div
						className="layer-config__item settings-popup__select"
						style={{ display: "flex", alignItems: "center", gap: 4 }}
					>
						Style:{" "}
						<NSelect
							className="nselect--limited"
							value={p.vectorStyleName}
							onChange={(ev) => setPref("vectorStyleName")(ev.target.value)}
							style={{ flex: 1 }}
						>
							{VECTOR_STYLE_KEYS.map((key) => (
								<option key={key} value={key}>
									{VECTOR_STYLE_LABELS[key]}
								</option>
							))}
						</NSelect>
					</div>
				) : (
					<div
						className="layer-config__item settings-popup__select"
						style={{ display: "flex", alignItems: "center", gap: 4 }}
					>
						Style:{" "}
						<NSelect
							className="nselect--limited"
							value={p.mapStyleName}
							disabled={!e.supportsStyling}
							onChange={(ev) => setPref("mapStyleName")(ev.target.value)}
							style={{ flex: 1 }}
						>
							{BUILTIN_STYLE_KEYS.map((key) => (
								<option key={key} value={key}>
									{BUILTIN_STYLE_LABELS[key]}
								</option>
							))}
							{e.customStyles.map((s) => (
								<option key={s.name} value={s.name}>
									{s.name}
								</option>
							))}
						</NSelect>
						<button
							className="icon-button icon-button--inline"
							title="Manage map styles"
							onClick={(ev) => {
								ev.preventDefault();
								e.onManageStyles();
							}}
						>
							<Icon path={mdiCogOutline} size={18} />
						</button>
					</div>
				)}
			</fieldset>
		</div>
	);
}

const MAP_TYPE_PREVIEW_STATIC: Partial<Record<MapTypeKey, string>> = {
	satellite: "https://mts1.googleapis.com/vt?hl=en-US&lyrs=s&x=0&y=0&z=0",
	osm: "https://tile.openstreetmap.org/0/0/0.png",
	// No raster endpoint for OpenFreeMap styles; Carto's voyager raster is a close stand-in.
	vector: "https://basemaps.cartocdn.com/rastertiles/voyager/0/0/0.png",
};

const MAP_TYPES: MapTypeKey[] = ["map", "satellite", "osm", "vector"];

function BasemapSelector({
	previewUrls,
	selected,
	onSelect,
	onMouseEnter,
}: {
	previewUrls: Record<MapTypeKey, string>;
	selected: MapTypeKey;
	onSelect: (type: MapTypeKey) => void;
	onMouseEnter?: () => void;
}) {
	return (
		<div className="map-type-control__basemap">
			{MAP_TYPES.map((t) => (
				<button
					key={t}
					type="button"
					className="map-type-control__button"
					data-state={selected === t ? "on" : "off"}
					onClick={() => onSelect(t)}
					onMouseEnter={onMouseEnter}
				>
					<div className="map-type-control__background">
						<img src={previewUrls[t]} alt="" draggable={false} />
					</div>
					<span>{MAP_TYPE_LABELS[t]}</span>
				</button>
			))}
		</div>
	);
}

/** Collapse to a single menu button when the expanded basemap would overlap top-right controls. */
function useMapTypeCompact(
	containerRef: RefObject<HTMLDivElement | null>,
	basemapMeasureRef: RefObject<HTMLDivElement | null>,
) {
	const [compact, setCompact] = useState(false);

	useEffect(() => {
		const el = containerRef.current;
		const measure = basemapMeasureRef.current;
		if (!el) return;
		const root = el.closest(".embed-controls");
		const leftGroup = el.closest(".embed-controls__control");
		if (!root || !leftGroup) return;

		const check = () => {
			const basemapWidth = measure?.scrollWidth ?? 0;
			if (basemapWidth === 0) return;

			const rootRect = root.getBoundingClientRect();
			const leftEdge = rootRect.left + 8;
			const topBandBottom = rootRect.top + 52;
			let conflictLeft = rootRect.right - 8;

			for (const control of Array.from(root.querySelectorAll(".embed-controls__control"))) {
				if (control === leftGroup) continue;
				const rect = control.getBoundingClientRect();
				if (rect.top >= topBandBottom || rect.bottom <= rootRect.top) continue;
				if (rect.left > leftEdge + 80) {
					conflictLeft = Math.min(conflictLeft, rect.left);
				}
			}

			const marginX = (n: HTMLElement) => {
				const s = getComputedStyle(n);
				return (parseFloat(s.marginLeft) || 0) + (parseFloat(s.marginRight) || 0);
			};
			let siblingsWidth = 0;
			for (const child of Array.from(leftGroup.children)) {
				if (child !== el && child instanceof HTMLElement) {
					siblingsWidth += child.getBoundingClientRect().width + marginX(child);
				}
			}

			const available = conflictLeft - leftEdge - 8;
			const needed = basemapWidth + marginX(el) + siblingsWidth;
			setCompact((prev) => {
				// Hysteresis avoids flip-flopping at the breakpoint.
				if (prev) return needed > available;
				return needed > available + 8;
			});
		};

		const obs = new ResizeObserver(check);
		obs.observe(root);
		if (measure) obs.observe(measure);
		for (const child of Array.from(leftGroup.children)) {
			if (child !== el && child instanceof HTMLElement) obs.observe(child);
		}
		check();
		return () => obs.disconnect();
	}, [containerRef, basemapMeasureRef]);

	return compact;
}

export function MapTypeDropdown({ layerConfig }: { layerConfig: LayerConfig }) {
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const basemapMeasureRef = useRef<HTMLDivElement>(null);
	const basemapRef = useRef<HTMLDivElement>(null);
	const compact = useMapTypeCompact(containerRef, basemapMeasureRef);
	const mapPreviewUrl = useMemo(() => buildTileUrl(createRoadmapTileConfig(), 0, 0, 0), []);

	useEffect(() => {
		const measure = basemapMeasureRef.current;
		const visible = basemapRef.current;
		if (!measure || !visible) return;
		const sync = () => {
			visible.style.width = `${measure.scrollWidth}px`;
		};
		const obs = new ResizeObserver(sync);
		obs.observe(measure);
		sync();
		return () => obs.disconnect();
	}, [compact]);

	useClickOutside(containerRef, () => setIsOpen(false), isOpen);

	const previewUrls: Record<MapTypeKey, string> = {
		map: mapPreviewUrl,
		satellite: MAP_TYPE_PREVIEW_STATIC.satellite!,
		osm: MAP_TYPE_PREVIEW_STATIC.osm!,
		vector: MAP_TYPE_PREVIEW_STATIC.vector!,
	};

	const settingsPopup = isOpen && (
		<div
			className="settings-popup"
			style={{
				position: "absolute",
				top: "100%",
				left: 0,
				zIndex: 3,
				width: compact ? undefined : "100%",
				boxSizing: "border-box",
				maxHeight: "calc(100vh - 80px)",
				overflowY: "auto",
			}}
		>
			{compact && (
				<BasemapSelector
					previewUrls={previewUrls}
					selected={layerConfig.prefs.mapType}
					onSelect={(t) => layerConfig.setPref("mapType")(t)}
				/>
			)}
			<SettingsPopup layerConfig={layerConfig} />
		</div>
	);

	return (
		<div
			className="map-control map-type-control"
			ref={containerRef}
			style={{ position: "relative" }}
		>
			<div
				ref={basemapMeasureRef}
				className="map-type-control__basemap map-type-control__basemap--measure"
				aria-hidden
			>
				<BasemapSelector
					previewUrls={previewUrls}
					selected={layerConfig.prefs.mapType}
					onSelect={() => {}}
				/>
			</div>
			{compact ? (
				<>
					<button
						type="button"
						className="map-control__menu-button"
						onClick={() => setIsOpen(!isOpen)}
					>
						{MAP_TYPE_LABELS[layerConfig.prefs.mapType]}
					</button>
					{settingsPopup}
				</>
			) : (
				<>
					<div ref={basemapRef}>
						<BasemapSelector
							previewUrls={previewUrls}
							selected={layerConfig.prefs.mapType}
							onSelect={(t) => {
								if (layerConfig.prefs.mapType === t) {
									setIsOpen((v) => !v);
								} else {
									layerConfig.setPref("mapType")(t);
									setIsOpen(false);
								}
							}}
							onMouseEnter={() => {
								setIsOpen(true);
							}}
						/>
					</div>
					{settingsPopup}
				</>
			)}
		</div>
	);
}

export function MapSettingsDropdown({ settings: s }: { settings: MapSettingsDropdownProps }) {
	const [pointAlongRoad, setPointAlongRoad] = useMapSetting("pointAlongRoad");
	const [preferDirection, setPreferDirection] = useMapSetting("preferDirection");
	const [preferOfficial, setPreferOfficial] = useMapSetting("preferOfficial");
	const [preferHigherQuality, setPreferHigherQuality] = useMapSetting("preferHigherQuality");
	const [onlyOfficial, setOnlyOfficial] = useMapSetting("onlyOfficial");
	const [defaultPanoId, setDefaultPanoId] = useMapSetting("defaultPanoId");
	const [searchRadius, setSearchRadius] = useMapSetting("searchRadius");
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useClickOutside(containerRef, () => setIsOpen(false), isOpen);

	return (
		<div
			className="map-control map-control--menu"
			ref={containerRef}
			style={{ position: "relative" }}
		>
			<button className="map-control__menu-button" onClick={() => setIsOpen(!isOpen)}>
				Map settings
			</button>
			{isOpen && (
				<div
					className="settings-popup"
					style={{
						position: "absolute",
						top: "100%",
						right: 0,
						zIndex: 3,
						maxHeight: "calc(100vh - 80px)",
						overflowY: "auto",
					}}
				>
					<fieldset className="fieldset">
						<legend className="fieldset__header">
							Selecting new locations <span className="fieldset__divider" />
						</legend>
						<SwitchRow
							checked={pointAlongRoad}
							onChange={setPointAlongRoad}
							label="Point view along the road by default"
						/>
						{pointAlongRoad && (
							<label className="settings-popup__item settings-popup__select">
								Direction:{" "}
								<NSelect
									className="nselect--compact"
									value={preferDirection ?? ""}
									onChange={(e) => setPreferDirection(e.target.value || null)}
								>
									<option value="">None</option>
									<option value="forwards">Forwards</option>
									<option value="backwards">Backwards</option>
									<option value="north">Most Northern</option>
									<option value="east">Most Eastern</option>
									<option value="south">Most Southern</option>
									<option value="west">Most Western</option>
									<option value="random">Random</option>
								</NSelect>
							</label>
						)}
						<SwitchRow
							checked={preferOfficial}
							onChange={setPreferOfficial}
							label="Prefer official coverage over unofficial"
						/>
						<SwitchRow
							checked={preferHigherQuality}
							onChange={setPreferHigherQuality}
							label="Prefer higher quality over newer images"
						/>
						<SwitchRow
							checked={onlyOfficial}
							onChange={setOnlyOfficial}
							label="Disallow unofficial coverage"
						/>
						<SwitchRow
							checked={defaultPanoId}
							onChange={setDefaultPanoId}
							label="Use Pano ID locations by default"
						/>
						<SearchRadiusSlider value={searchRadius} onChange={setSearchRadius} />
					</fieldset>
					<fieldset className="fieldset">
						<legend className="fieldset__header">
							Map behaviour <span className="fieldset__divider" />
						</legend>
						<SwitchRow
							checked={s.showPreviews}
							onChange={s.setShowPreviews}
							label="Show location previews when hovering the map"
						/>
						<SwitchRow checked={s.selectOnly} onChange={s.setSelectOnly} label="Select-only mode" />
					</fieldset>
					<ScoreBoundsEditor />
					<fieldset className="fieldset">
						<legend className="fieldset__header">
							Display <span className="fieldset__divider" />
						</legend>
						<label className="settings-popup__item settings-popup__select">
							Marker style:{" "}
							<NSelect
								className="nselect--compact"
								value={s.markerStyle}
								onChange={(e) => s.setMarkerStyle(e.target.value as MarkerStyle)}
							>
								<option value="pin">Pin</option>
								<option value="circle">Circle</option>
								<option value="arrow">Camera direction arrow</option>
							</NSelect>
						</label>
						<label className="settings-popup__item settings-popup__slider">
							Marker size:{" "}
							<Slider
								min={0.5}
								max={3}
								step={0.25}
								value={s.markerSize}
								onChange={(e) => s.setMarkerSize(Number(e.target.value))}
							/>
						</label>
						<SwitchRow
							checked={s.showPerfectScoreCircle}
							onChange={s.setShowPerfectScoreCircle}
							label="Display 5K radius"
						/>
						<SwitchRow
							checked={s.showSearchRadiusCursor}
							onChange={s.setShowSearchRadiusCursor}
							label="Show click search radius at cursor"
						/>
					</fieldset>
				</div>
			)}
		</div>
	);
}
