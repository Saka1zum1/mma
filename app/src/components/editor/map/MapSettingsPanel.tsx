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
import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/locales/en";

const MAP_TYPE_KEYS: Record<MapTypeKey, MessageKey> = {
	map: "editor.mapTypeMap",
	satellite: "editor.mapTypeSatellite",
	osm: "editor.mapTypeOsm",
	vector: "editor.mapTypeVector",
};

function mapTypeLabel(t: (key: MessageKey) => string, type: MapTypeKey): string {
	return t(MAP_TYPE_KEYS[type]);
}

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

function SearchRadiusSlider({
	value,
	onChange,
}: {
	value: number | null;
	onChange: (v: number | null) => void;
}) {
	const { t } = useT();
	const [dragging, setDragging] = useState<number | null>(null);
	const display = dragging ?? value ?? 50;
	return (
		<label className="settings-popup__item settings-popup__select">
			{t("editor.minSearchRadius")}{" "}
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
	const { t } = useT();
	const { prefs: p, setPref } = e;
	return (
		<div className="layer-config">
			{/* Layers */}
			<fieldset className="layer-config__group">
				<legend className="layer-config__header">
					{t("editor.layers")} <span className="layer-config__divider" />
				</legend>
				<SwitchRow
					className="layer-config__item"
					checked={p.showTerrain}
					disabled={!e.supportsTerrain}
					onChange={(v) => setPref("showTerrain")(v)}
					label={t("editor.terrain")}
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.showSvCoverage}
					onChange={(v) => setPref("showSvCoverage")(v)}
					label={t("editor.streetViewLayer")}
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.showLabels}
					disabled={!e.supportsLabels}
					onChange={(v) => setPref("showLabels")(v)}
					label={t("editor.labels")}
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.svPanoramas}
					onChange={(v) => setPref("svPanoramas")(v)}
					label={t("editor.panoramasCloseZoom")}
				/>
			</fieldset>
			{/* Street View */}
			<fieldset className="layer-config__group">
				<legend className="layer-config__header">
					{t("editor.streetViewLayer")} <span className="layer-config__divider" />
				</legend>
				<div
					className="layer-config__item"
					style={{ display: "flex", justifyContent: "space-between" }}
				>
					<span>{t("editor.showLines")}</span>
					<div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
						<div className="button-group">
							{(
								[
									{ value: "official" as SvCoverageType, labelKey: "editor.svOfficial" as const },
									{ value: "unofficial" as SvCoverageType, labelKey: "editor.svUnofficial" as const },
									{ value: "default" as SvCoverageType, labelKey: "editor.svAll" as const },
								] as const
							).map((opt) => (
								<Button
									key={opt.value}
									className="button-group__button"
									aria-checked={p.svCoverageType === opt.value}
									onClick={() => setPref("svCoverageType")(opt.value)}
								>
									{t(opt.labelKey)}
								</Button>
							))}
						</div>
						<ColorPicker
							color={hexToRgbObj(resolveSvColorHex(p.svColor))}
							onChange={(c) => setPref("svColor")(rgbToHex(c))}
							ariaLabel={t("editor.coverageLineColor")}
						/>
					</div>
				</div>
				<SwitchRow
					className="layer-config__item"
					checked={p.svThickness === "high"}
					onChange={(v) => setPref("svThickness")(v ? "high" : "default")}
					label={t("editor.thinnerLines")}
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.svBlobby}
					onChange={(v) => setPref("svBlobby")(v)}
					label={t("editor.blobbyLayer")}
				/>
			</fieldset>
			{/* Settings */}
			<fieldset className="layer-config__group">
				<legend className="layer-config__header">
					{t("dialog.settings")} <span className="layer-config__divider" />
				</legend>
				<SwitchRow
					className="layer-config__item"
					checked={p.boldCountryBorders}
					disabled={!e.supportsStyling}
					onChange={(v) => setPref("boldCountryBorders")(v)}
					label={t("editor.emphasiseCountryBorders")}
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.boldSubdivisionBorders}
					disabled={!e.supportsStyling}
					onChange={(v) => setPref("boldSubdivisionBorders")(v)}
					label={t("editor.emphasiseSubdivisionBorders")}
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.hideRoadLabels}
					disabled={!e.supportsStyling}
					onChange={(v) => setPref("hideRoadLabels")(v)}
					label={t("editor.hideRoadLabels")}
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.hidePoi}
					disabled={!e.supportsStyling}
					onChange={(v) => setPref("hidePoi")(v)}
					label={t("editor.hidePoi")}
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.hideTransit}
					disabled={!e.supportsStyling}
					onChange={(v) => setPref("hideTransit")(v)}
					label={t("editor.hideTransit")}
				/>
				<SwitchRow
					className="layer-config__item"
					checked={p.hideHighways}
					disabled={!e.supportsStyling}
					onChange={(v) => setPref("hideHighways")(v)}
					label={t("editor.hideHighways")}
				/>
			</fieldset>
			{/* Map style */}
			<fieldset className="layer-config__group">
				<legend className="layer-config__header">
					{t("editor.mapStyleSection")} <span className="layer-config__divider" />
				</legend>
				{p.mapType === "vector" ? (
					<div
						className="layer-config__item settings-popup__select"
						style={{ display: "flex", alignItems: "center", gap: 4 }}
					>
						{t("editor.styleLabel")}{" "}
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
						{t("editor.styleLabel")}{" "}
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
							title={t("dialog.manageMapStyles")}
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
	const { t } = useT();
	return (
		<div className="map-type-control__basemap">
			{MAP_TYPES.map((mt) => (
				<button
					key={mt}
					type="button"
					className="map-type-control__button"
					data-state={selected === mt ? "on" : "off"}
					onClick={() => onSelect(mt)}
					onMouseEnter={onMouseEnter}
				>
					<div className="map-type-control__background">
						<img src={previewUrls[mt]} alt="" draggable={false} />
					</div>
					<span>{mapTypeLabel(t, mt)}</span>
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
	const { t } = useT();
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
						{mapTypeLabel(t, layerConfig.prefs.mapType)}
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

export function MapSettingsDropdown({
	prefs: p,
	setPref,
}: {
	prefs: MapEmbedPrefs;
	setPref: <K extends keyof MapEmbedPrefs>(k: K) => (v: MapEmbedPrefs[K]) => void;
}) {
	const { t } = useT();
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
				{t("dialog.mapSettings")}
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
							{t("editor.selectingNewLocations")} <span className="fieldset__divider" />
						</legend>
						<SwitchRow
							checked={pointAlongRoad}
							onChange={setPointAlongRoad}
							label={t("editor.pointAlongRoad")}
						/>
						{pointAlongRoad && (
							<label className="settings-popup__item settings-popup__select">
								{t("editor.direction")}{" "}
								<NSelect
									className="nselect--compact"
									value={preferDirection ?? ""}
									onChange={(e) => setPreferDirection(e.target.value || null)}
								>
									<option value="">{t("editor.directionNone")}</option>
									<option value="forwards">{t("editor.directionForwards")}</option>
									<option value="backwards">{t("editor.directionBackwards")}</option>
									<option value="north">{t("editor.directionNorth")}</option>
									<option value="east">{t("editor.directionEast")}</option>
									<option value="south">{t("editor.directionSouth")}</option>
									<option value="west">{t("editor.directionWest")}</option>
									<option value="random">{t("editor.directionRandom")}</option>
								</NSelect>
							</label>
						)}
						<SwitchRow
							checked={preferOfficial}
							onChange={setPreferOfficial}
							label={t("editor.preferOfficial")}
						/>
						<SwitchRow
							checked={preferHigherQuality}
							onChange={setPreferHigherQuality}
							label={t("editor.preferHigherQuality")}
						/>
						<SwitchRow
							checked={onlyOfficial}
							onChange={setOnlyOfficial}
							label={t("editor.disallowUnofficial")}
						/>
						<SwitchRow
							checked={defaultPanoId}
							onChange={setDefaultPanoId}
							label={t("editor.usePanoIdDefault")}
						/>
						<SearchRadiusSlider value={searchRadius} onChange={setSearchRadius} />
					</fieldset>
					<fieldset className="fieldset">
						<legend className="fieldset__header">
							{t("editor.mapBehaviour")} <span className="fieldset__divider" />
						</legend>
						<SwitchRow
							checked={p.showPreviews}
							onChange={setPref("showPreviews")}
							label={t("editor.showLocationPreviews")}
						/>
						<SwitchRow
							checked={p.selectOnly}
							onChange={setPref("selectOnly")}
							label={t("editor.selectOnlyMode")}
						/>
					</fieldset>
					<ScoreBoundsEditor />
					<fieldset className="fieldset">
						<legend className="fieldset__header">
							{t("editor.display")} <span className="fieldset__divider" />
						</legend>
						<label className="settings-popup__item settings-popup__select">
							{t("editor.markerStyle")}{" "}
							<NSelect
								className="nselect--compact"
								value={p.markerStyle}
								onChange={(e) => setPref("markerStyle")(e.target.value as MarkerStyle)}
							>
								<option value="pin">{t("editor.markerPin")}</option>
								<option value="circle">{t("editor.markerCircle")}</option>
								<option value="arrow">{t("editor.markerArrow")}</option>
							</NSelect>
						</label>
						<label className="settings-popup__item settings-popup__slider">
							{t("editor.markerSize")}{" "}
							<Slider
								min={0.5}
								max={3}
								step={0.25}
								value={p.markerSize}
								onChange={(e) => setPref("markerSize")(Number(e.target.value))}
							/>
						</label>
						<SwitchRow
							checked={p.showPerfectScoreCircle}
							onChange={setPref("showPerfectScoreCircle")}
							label={t("editor.display5kRadius")}
						/>
						<SwitchRow
							checked={p.showSearchRadiusCursor}
							onChange={setPref("showSearchRadiusCursor")}
							label={t("editor.showSearchRadiusCursor")}
						/>
					</fieldset>
				</div>
			)}
		</div>
	);
}
