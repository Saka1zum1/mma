import { useState, useEffect, useCallback } from "react";
import {
	getSettings,
	updateSettings,
	setScope,
	getLocationCount,
	setOnSettingsChange,
	DEFAULT_SETTINGS,
	GRADIENTS,
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
.heatmap-sidebar__gradients { display: flex; flex-direction: column; gap: 4px; }
.heatmap-sidebar__gradient {
  background: none; border: 2px solid transparent; border-radius: 4px;
  padding: 2px; cursor: pointer; width: 100%;
}
.heatmap-sidebar__gradient--active { border-color: var(--accent-color, #4a9eff); }
.heatmap-sidebar__gradient-bar { height: 14px; border-radius: 2px; }
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
	const scopeCtl = MMA.useScope();

	useEffect(() => {
		injectCSS();
		setOnSettingsChange(() => rerender((n) => n + 1));
		return () => {
			setOnSettingsChange(null);
			removeCSS();
		};
	}, []);

	// Mirror the picker's choice into the renderer (module state drives rebuild()).
	useEffect(() => {
		setScope(scopeCtl.scope);
	}, [scopeCtl.scope]);

	const setSlider = useCallback(
		(key: keyof HeatmapSettings, value: number) => updateSettings({ [key]: value }),
		[],
	);

	const reset = useCallback(() => {
		updateSettings({ ...DEFAULT_SETTINGS });
	}, []);

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
				<div className="heatmap-sidebar__control">
					<label htmlFor="heatmap-visible">Show heatmap</label>
					<input
						id="heatmap-visible"
						type="checkbox"
						checked={s.visible}
						onChange={(e) => updateSettings({ visible: e.target.checked })}
					/>
				</div>

				<div className="heatmap-sidebar__section">
					<p className="heatmap-sidebar__section-title">Apply to</p>
					<MMA.ui.ScopeSelector ctl={scopeCtl} />
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

				<div className="heatmap-sidebar__section">
					<p className="heatmap-sidebar__section-title">Gradient</p>
					<div className="heatmap-sidebar__gradients">
						{GRADIENTS.map((g, i) => (
							<button
								key={g.name}
								className={`heatmap-sidebar__gradient ${i === s.gradientIndex ? "heatmap-sidebar__gradient--active" : ""}`}
								onClick={() => updateSettings({ gradientIndex: i })}
								title={g.name}
							>
								<div
									className="heatmap-sidebar__gradient-bar"
									style={{
										background: `linear-gradient(to right, ${g.stops
											.map(
												(c, si) =>
													`rgb(${c[0]},${c[1]},${c[2]}) ${(si / (g.stops.length - 1)) * 100}%`,
											)
											.join(", ")})`,
									}}
								/>
							</button>
						))}
					</div>
				</div>
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
