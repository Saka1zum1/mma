import { useCallback, useState } from "react";
import { useSyncStore } from "@/lib/events";
import { ProviderIcon } from "@/components/editor/providers/ProviderIcon";
import { SwitchRow } from "@/components/primitives/SwitchRow";
import { NSelect } from "@/components/primitives/NSelect";
import { Sidebar, Section } from "@/components/primitives/Sidebar";
import { rebuildStyledLayers } from "@/lib/sv/lookaround/coverage";
import { rebuildBaiduStyledLayers } from "@/lib/sv/baidu/coverage";
import { rebuildTencentStyledLayers } from "@/lib/sv/tencent/coverage";
import { rebuildYandexStyledLayers } from "@/lib/sv/yandex/coverage";
import {
	areAllProvidersEnabled,
	getAltBasemapSettings,
	getHeaderProviderId,
	getProviderLabel,
	getProviderSettings,
	PROVIDER_CATALOG,
	resetProviderSettings,
	setAllProvidersEnabled,
	subscribeProvidersSettings,
	updateAltBasemapSettings,
	updateProviderSettings,
	type ResolvedAltProviderSettings,
} from "@/lib/sv/providers/settings";
import {
	normalizeYandexBasemapLanguage,
	YANDEX_BASEMAP_LANGUAGES,
} from "@/lib/sv/yandex/endpoints";
import type { AltSvProviderId } from "@/lib/sv/providers/types";
import { setWorkArea } from "@/store/useMapStore";

const STYLE_KEYS: (keyof ResolvedAltProviderSettings)[] = [
	"lineColor",
	"trekkerLineColor",
	"pointFill",
	"pointStroke",
	"trekkerPointFill",
	"trekkerPointStroke",
	"lineWidthScale",
	"pointSizeScale",
];

function rgbaToHex(color: string): string {
	const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
	if (!m) return "#1a9fb0";
	const hex = (n: string) => Number(n).toString(16).padStart(2, "0");
	return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

function hexToRgba(hex: string, alpha: number): string {
	const h = hex.replace("#", "");
	const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
	const n = parseInt(full, 16);
	const r = (n >> 16) & 255;
	const g = (n >> 8) & 255;
	const b = n & 255;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function alphaOf(color: string, fallback: number): number {
	const m = color.match(/rgba?\([^)]*?,\s*([0-9.]+)\s*\)/i);
	if (!m) return fallback;
	const a = Number(m[1]);
	return Number.isFinite(a) ? a : fallback;
}

const DEFAULT_TAB: AltSvProviderId = "apple";

function initialProviderTab(): AltSvProviderId {
	return getHeaderProviderId() ?? DEFAULT_TAB;
}

function providerHint(id: AltSvProviderId): { prefer: string; fallback: string; lines: string } {
	if (id === "baidu") {
		return {
			prefer:
				"When preferred, blank clicks try Baidu/Tencent before other alts (e.g. Apple). If both Baidu and Tencent are enabled they are fetched in parallel — first response becomes the default pano, the other appears in the date picker. Existing pins always open by their own provider field.",
			fallback:
				"When enabled, clicking a spot without Baidu/Tencent coverage opens Google Street View instead.",
			lines: "Lines (raster)",
		};
	}
	if (id === "tencent") {
		return {
			prefer:
				"When preferred, blank clicks try Baidu/Tencent before other alts (e.g. Apple). If both Baidu and Tencent are enabled they are fetched in parallel — first response becomes the default pano, the other appears in the date picker. Existing pins always open by their own provider field.",
			fallback:
				"When enabled, clicking a spot without Baidu/Tencent coverage opens Google Street View instead.",
			lines: "Lines (PMTiles)",
		};
	}
	if (id === "yandex") {
		return {
			prefer:
				"When preferred, blank clicks try enabled inject providers (Baidu / Tencent / Yandex) in parallel — first response becomes the default pano, siblings appear in the date picker. Existing pins always open by their own provider field.",
			fallback:
				"When enabled, clicking a spot without Yandex coverage opens Google Street View instead.",
			lines: "Lines (raster)",
		};
	}
	return {
		prefer:
			"When preferred and enabled, blank map clicks create Look Around locations first (Google is the fallback). Only one provider can be preferred at a time. Existing pins always open by their own provider field.",
		fallback:
			"When enabled, clicking a spot without Look Around coverage opens Google Street View instead.",
		lines: "Lines (raster + MVT)",
	};
}

export function ProvidersSidebar() {
	const [activeProvider, setActiveProvider] = useState<AltSvProviderId>(initialProviderTab);

	const getCfg = useCallback(() => getProviderSettings(activeProvider), [activeProvider]);
	const cfg = useSyncStore(subscribeProvidersSettings, getCfg);
	const getAllEnabled = useCallback(() => areAllProvidersEnabled(), []);
	const allProvidersEnabled = useSyncStore(subscribeProvidersSettings, getAllEnabled);
	const altBasemap = useSyncStore(subscribeProvidersSettings, getAltBasemapSettings);
	const enabled = cfg.enabled;
	const label = getProviderLabel(activeProvider);
	const hints = providerHint(activeProvider);
	const showPoints = activeProvider === "apple";

	const setCfg = useCallback(
		(patch: Partial<ResolvedAltProviderSettings>) => {
			updateProviderSettings(activeProvider, patch);
			const keys = Object.keys(patch) as (keyof ResolvedAltProviderSettings)[];
			if (keys.some((k) => STYLE_KEYS.includes(k))) {
				if (activeProvider === "apple") rebuildStyledLayers();
				else if (activeProvider === "baidu") rebuildBaiduStyledLayers();
				else if (activeProvider === "tencent") rebuildTencentStyledLayers();
				else if (activeProvider === "yandex") rebuildYandexStyledLayers();
			}
		},
		[activeProvider],
	);

	const reset = useCallback(() => {
		resetProviderSettings(activeProvider);
		if (activeProvider === "apple") rebuildStyledLayers();
		else if (activeProvider === "baidu") rebuildBaiduStyledLayers();
		else if (activeProvider === "tencent") rebuildTencentStyledLayers();
		else if (activeProvider === "yandex") rebuildYandexStyledLayers();
	}, [activeProvider]);

	return (
		<Sidebar
			title="Street View providers"
			onBack={() => setWorkArea("overview")}
			actions={
				<button className="providers-sidebar__reset" type="button" onClick={reset}>
					Reset
				</button>
			}
			className="providers-sidebar"
		>
			<div className="providers-sidebar__global">
				<SwitchRow
					className="providers-sidebar__control"
					checked={allProvidersEnabled}
					onChange={setAllProvidersEnabled}
					label="Enable all providers"
				/>
			</div>

			<div className="providers-sidebar__tabs" role="tablist" aria-label="Providers">
				{PROVIDER_CATALOG.map((p) => {
					const active = p.id === activeProvider;
					const on = p.available && getProviderSettings(p.id).enabled;
					return (
						<button
							key={p.id}
							type="button"
							role="tab"
							aria-selected={active}
							aria-disabled={!p.available}
							disabled={!p.available}
							className={`providers-sidebar__tab${active ? " is-active" : ""}${on ? " is-on" : ""}`}
							title={p.available ? p.label : `${p.label} (coming soon)`}
							onClick={() => {
								if (p.available) setActiveProvider(p.id);
							}}
						>
							<ProviderIcon id={p.id} size={18} />
							<span>{p.label}</span>
						</button>
					);
				})}
			</div>

			<Section title={label} defaultOpen>
				<SwitchRow
					className="providers-sidebar__control"
					checked={cfg.enabled}
					onChange={(v) => setCfg({ enabled: v })}
					label="Enable"
				/>
				<SwitchRow
					className="providers-sidebar__control"
					checked={cfg.preferred}
					disabled={!enabled}
					onChange={(v) => setCfg({ preferred: v })}
					label="Prefer on map click"
				/>
				<p className="providers-sidebar__hint">{hints.prefer}</p>
			</Section>

			<Section title="Coverage layers" defaultOpen>
				<SwitchRow
					className="providers-sidebar__control"
					checked={cfg.showLines}
					disabled={!enabled}
					onChange={(v) => setCfg({ showLines: v })}
					label={hints.lines}
				/>
				{showPoints && (
					<SwitchRow
						className="providers-sidebar__control"
						checked={cfg.showPoints}
						disabled={!enabled}
						onChange={(v) => setCfg({ showPoints: v })}
						label="Panorama points (z≥16)"
					/>
				)}
				<Slider
					label="Lines opacity"
					value={cfg.lineOpacity}
					min={0}
					max={1}
					step={0.05}
					disabled={!enabled}
					onChange={(v) => setCfg({ lineOpacity: v })}
				/>
				{showPoints && (
					<>
						<Slider
							label="Points opacity"
							value={cfg.pointsOpacity}
							min={0}
							max={1}
							step={0.05}
							disabled={!enabled}
							onChange={(v) => setCfg({ pointsOpacity: v })}
						/>
						<Slider
							label="Line width"
							value={cfg.lineWidthScale}
							min={0.5}
							max={3}
							step={0.1}
							disabled={!enabled}
							onChange={(v) => setCfg({ lineWidthScale: v })}
							format={(v) => `${v.toFixed(1)}×`}
						/>
						<Slider
							label="Point size"
							value={cfg.pointSizeScale}
							min={0.5}
							max={3}
							step={0.1}
							disabled={!enabled}
							onChange={(v) => setCfg({ pointSizeScale: v })}
							format={(v) => `${v.toFixed(1)}×`}
						/>
					</>
				)}
			</Section>

			<Section title="Colors" defaultOpen>
				{activeProvider != "apple" ? (
					<ColorRow
						label= {activeProvider=="baidu" || activeProvider=="yandex" ? "Coverage line filter color": "Coverage line color"}
						value={cfg.lineColor}
						disabled={!enabled}
						onChange={(c) => setCfg({ lineColor: c })}
					/>
				) : (
					<ColorRow
						label="Car line"
						value={cfg.lineColor}
						disabled={!enabled}
						onChange={(c) => setCfg({ lineColor: c })}
					/>
				)}
				{showPoints && (
					<>
						<ColorRow
							label="Trekker line"
							value={cfg.trekkerLineColor}
							disabled={!enabled}
							onChange={(c) => setCfg({ trekkerLineColor: c })}
						/>
						<ColorRow
							label="Car point"
							value={cfg.pointStroke}
							disabled={!enabled}
							onChange={(stroke) =>
								setCfg({
									pointStroke: stroke,
									pointFill: hexToRgba(rgbaToHex(stroke), 0.25),
								})
							}
						/>
						<ColorRow
							label="Trekker point"
							value={cfg.trekkerPointStroke}
							disabled={!enabled}
							onChange={(stroke) =>
								setCfg({
									trekkerPointStroke: stroke,
									trekkerPointFill: hexToRgba(rgbaToHex(stroke), 0.25),
								})
							}
						/>
					</>
				)}
			</Section>

			{activeProvider === "baidu" || activeProvider === "tencent" ? (
				<Section title="Basemap" defaultOpen>
					<>
						<SwitchRow
							className="providers-sidebar__control"
							checked={altBasemap.petal.enabled}
							disabled={!enabled}
							onChange={(v) => updateAltBasemapSettings("petal", { enabled: v })}
							label="Petal Maps"
						/>
						<div className="providers-sidebar__control">
							<label htmlFor={`sv-${activeProvider}-petal-lang`}>Language</label>
							<NSelect
								id={`sv-${activeProvider}-petal-lang`}
								value={altBasemap.petal.language === "zh" ? "zh" : "en"}
								disabled={!enabled || !altBasemap.petal.enabled}
								onChange={(e) =>
									updateAltBasemapSettings("petal", {
										language: e.target.value === "zh" ? "zh" : "en",
									})
								}
							>
								<option value="en">English</option>
								<option value="zh">中文</option>
							</NSelect>
						</div>
					</>
				</Section>
			) : activeProvider === "yandex" ? (
				<Section title="Basemap" defaultOpen>
					<>
						<SwitchRow
							className="providers-sidebar__control"
							checked={altBasemap.yandex.enabled}
							disabled={!enabled}
							onChange={(v) => updateAltBasemapSettings("yandex", { enabled: v })}
							label="Yandex Maps"
						/>
						<div className="providers-sidebar__control">
							<label htmlFor="sv-yandex-basemap-lang">Language</label>
							<NSelect
								id="sv-yandex-basemap-lang"
								value={normalizeYandexBasemapLanguage(altBasemap.yandex.language)}
								disabled={!enabled || !altBasemap.yandex.enabled}
								onChange={(e) =>
									updateAltBasemapSettings("yandex", {
										language: normalizeYandexBasemapLanguage(e.target.value),
									})
								}
							>
								{YANDEX_BASEMAP_LANGUAGES.map((lang) => (
									<option key={lang} value={lang}>
										{lang}
									</option>
								))}
							</NSelect>
						</div>
					</>
				</Section>
			) : null}

			<Section title="Behavior" defaultOpen>
				<SwitchRow
					className="providers-sidebar__control"
					checked={cfg.fallbackToGoogle}
					onChange={(v) => setCfg({ fallbackToGoogle: v })}
					label="Fallback to Google Street View"
				/>
				<p className="providers-sidebar__hint">{hints.fallback}</p>
			</Section>
		</Sidebar>
	);
}

function Slider({
	label,
	value,
	min,
	max,
	step,
	onChange,
	format,
	disabled,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (v: number) => void;
	format?: (v: number) => string;
	disabled?: boolean;
}) {
	const display = format ? format(value) : String(Math.round(value * 100) / 100);
	return (
		<div className="providers-sidebar__control">
			<label>{label}</label>
			<input
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				disabled={disabled}
				onChange={(e) => onChange(Number(e.target.value))}
			/>
			<span className="providers-sidebar__value">{display}</span>
		</div>
	);
}

function ColorRow({
	label,
	value,
	onChange,
	disabled,
}: {
	label: string;
	value: string;
	onChange: (css: string) => void;
	disabled?: boolean;
}) {
	const a = alphaOf(value, 1);
	return (
		<div className="providers-sidebar__control">
			<label>{label}</label>
			<input
				type="color"
				value={rgbaToHex(value)}
				disabled={disabled}
				onChange={(e) => onChange(hexToRgba(e.target.value, a))}
			/>
		</div>
	);
}
