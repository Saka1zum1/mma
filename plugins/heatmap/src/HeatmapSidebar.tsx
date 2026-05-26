import { useState, useEffect, useCallback } from "react";
import {
	getSettings,
	updateSettings,
	getLocationCount,
	setOnSettingsChange,
	DEFAULT_SETTINGS,
	type HeatmapSettings,
} from "./heatmap";

const CSS = `
.heatmap-sidebar { overflow: auto; }
.heatmap-sidebar__header {
  display: flex; align-items: center; gap: 8px;
  padding: 8px; border-bottom: 1px solid var(--color-divider, #333);
}
.heatmap-sidebar__title { margin: 0; font-size: 14px; font-weight: 600; }
.heatmap-sidebar__body {
  padding: 12px; display: flex; flex-direction: column; gap: 12px;
}
.heatmap-sidebar__section {
  border-bottom: 1px solid var(--color-divider, #333);
  padding-bottom: 10px;
}
.heatmap-sidebar__section:last-child { border-bottom: none; padding-bottom: 0; }
.heatmap-sidebar__section-title {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  color: var(--text-secondary, #999); margin: 0 0 6px;
}
.heatmap-sidebar__control {
  display: flex; align-items: center; gap: 8px; padding: 2px 0;
}
.heatmap-sidebar__control label {
  flex: 1; font-size: 13px;
}
.heatmap-sidebar__control input[type="range"] {
  width: 100px;
}
.heatmap-sidebar__control .heatmap-sidebar__value {
  min-width: 36px; text-align: right; font-size: 12px;
  color: var(--text-secondary, #999); font-variant-numeric: tabular-nums;
}
.heatmap-sidebar__tags {
  display: flex; flex-direction: column; gap: 2px;
  max-height: 200px; overflow-y: auto;
}
.heatmap-sidebar__tag {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 0; font-size: 13px; cursor: pointer;
}
.heatmap-sidebar__tag-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.heatmap-sidebar__count {
  font-size: 12px; color: var(--text-secondary, #999);
  padding: 4px 0;
}
.heatmap-sidebar__reset {
  font-size: 12px; color: var(--text-secondary, #999);
  background: none; border: none; cursor: pointer; padding: 0;
  text-decoration: underline;
}
.heatmap-sidebar__reset:hover { color: var(--text-primary, #fff); }
`;

let styleEl: HTMLStyleElement | null = null;

function injectCSS() {
	if (styleEl) return;
	styleEl = document.createElement("style");
	styleEl.textContent = CSS;
	document.head.appendChild(styleEl);
}

function removeCSS() {
	if (styleEl) {
		styleEl.remove();
		styleEl = null;
	}
}

const ARROW_LEFT = "M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z";

function Icon({ path, size = 20 }: { path: string; size?: number }) {
	return (
		<svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
			<path d={path} />
		</svg>
	);
}

export function HeatmapSidebar({ onClose }: { onClose: () => void }) {
	const [, rerender] = useState(0);
	const s = getSettings();
	const tags = MMA.getCurrentMap()?.meta.tags ?? {};

	useEffect(() => {
		injectCSS();
		setOnSettingsChange(() => rerender((n) => n + 1));
		return () => {
			setOnSettingsChange(null);
			removeCSS();
		};
	}, []);

	const setSlider = useCallback(
		(key: keyof HeatmapSettings, value: number) => updateSettings({ [key]: value }),
		[],
	);

	const toggleTag = useCallback(
		(tagId: number) => {
			const current = s.filterTags;
			const next = new Set(current ?? []);
			if (next.has(tagId)) next.delete(tagId);
			else next.add(tagId);
			updateSettings({ filterTags: next.size > 0 ? next : null });
		},
		[s.filterTags],
	);

	const clearFilters = useCallback(() => {
		updateSettings({ filterTags: null });
	}, []);

	const reset = useCallback(() => {
		updateSettings({ ...DEFAULT_SETTINGS });
	}, []);

	const tagEntries = Object.entries(tags).map(([id, tag]) => ({
		id: Number(id),
		name: tag.name,
		color: tag.color,
	}));

	const count = getLocationCount();

	return (
		<section className="map-sidebar heatmap-sidebar">
			<header className="heatmap-sidebar__header">
				<button className="icon-button" onClick={onClose}>
					<Icon path={ARROW_LEFT} />
				</button>
				<h2 className="heatmap-sidebar__title">Heatmap</h2>
				<span style={{ flex: 1 }} />
				<button className="heatmap-sidebar__reset" onClick={reset}>
					Reset
				</button>
			</header>

			<div className="heatmap-sidebar__body">
				<div className="heatmap-sidebar__count">
					{count.toLocaleString()} location{count !== 1 ? "s" : ""}
				</div>

				<div className="heatmap-sidebar__section">
					<p className="heatmap-sidebar__section-title">Settings</p>
					<Slider label="Intensity" value={s.intensity} min={0.1} max={10} step={0.1}
						onChange={(v) => setSlider("intensity", v)} />
					<Slider label="Radius" value={s.radiusPixels} min={1} max={100} step={1}
						onChange={(v) => setSlider("radiusPixels", v)} format={(v) => `${v}px`} />
					<Slider label="Opacity" value={s.opacity} min={0} max={1} step={0.05}
						onChange={(v) => setSlider("opacity", v)} />
					<Slider label="Threshold" value={s.threshold} min={0} max={1} step={0.01}
						onChange={(v) => setSlider("threshold", v)} />
				</div>

				{tagEntries.length > 0 && (
					<div className="heatmap-sidebar__section">
						<p className="heatmap-sidebar__section-title">
							Filter by tag
							{s.filterTags && (
								<>
									{" "}
									<button className="heatmap-sidebar__reset" onClick={clearFilters}>
										clear
									</button>
								</>
							)}
						</p>
						<div className="heatmap-sidebar__tags">
							{tagEntries.map((tag) => (
								<label key={tag.id} className="heatmap-sidebar__tag">
									<input
										type="checkbox"
										checked={s.filterTags?.has(tag.id) ?? false}
										onChange={() => toggleTag(tag.id)}
									/>
									<span
										className="heatmap-sidebar__tag-dot"
										style={{ background: tag.color }}
									/>
									{tag.name}
								</label>
							))}
						</div>
					</div>
				)}
			</div>
		</section>
	);
}

function Slider({
	label, value, min, max, step, onChange, format,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (v: number) => void;
	format?: (v: number) => string;
}) {
	const display = format ? format(value) : String(Math.round(value * 100) / 100);
	return (
		<div className="heatmap-sidebar__control">
			<label>{label}</label>
			<input
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
			/>
			<span className="heatmap-sidebar__value">{display}</span>
		</div>
	);
}
