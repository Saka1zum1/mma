import { useState, useCallback, useEffect } from "react";
import type { GeneratorSettings, GeneratorRegion, GeneratorRegionMeta } from "../engine/types";
import { DEFAULT_SETTINGS, GENERATION_CAMERA_TYPE } from "../engine/types";
import { RegionSelector } from "./RegionSelector";
import { SettingsPanel } from "./SettingsPanel";
import { google } from "@/lib/sv/opensv";
import { getActiveSelections, useMapState } from "@/store/useMapStore";
import { usePluginEvent } from "@/plugins/pluginEvents";
import type { Selection } from "@/bindings.gen";
import { storage } from "@/plugins/pluginStorage";
import { Bar } from "@/components/primitives/Bar";
import { Sidebar, Section } from "@/components/primitives/Sidebar";
import { searchCoverage } from "../searchCoverage";
import {
	GENERATOR_CHANGED,
	getGeneratorStats,
	getGeneratorStatus,
	pauseGeneration,
	resumeGeneration,
	setGeneratorSidebarOpen,
	startGeneration,
	stopGeneration,
	updateGenerationSettings,
	updateGenerationTargets,
} from "../session";
import { Icon } from "@/components/primitives/Icon";
import { Tooltip } from "@/components/primitives/Tooltip";
import {
	mdiBullseyeArrow,
	mdiChartScatterPlot,
	mdiContentDuplicate,
	mdiFilterRemove,
	mdiMapMarkerCheck,
	mdiRadar,
	mdiSpeedometer,
} from "@mdi/js";
import { fmt } from "@/lib/util/format";
import { MONTHS, ymParse } from "@/lib/util/date";
import { formatDistance } from "@/lib/util/format";
import "./generator.css";
import { t } from "@/lib/i18n";
import { fieldValueLabel, getFieldDef } from "@/lib/data/fieldDefRegistry";
import { TextInput } from "@/components/primitives/TextInput";
import { Button } from "@/components/primitives/Button";
import { Hint } from "@/components/primitives/Hint";

const TRAVERSE_REGION_ID = "baidu-traverse";

function isTraverse(s: GeneratorSettings): boolean {
	return s.provider === "baidu" && s.samplingMode === "traverse";
}

function openTraverseRegion(meta: GeneratorRegionMeta): GeneratorRegion {
	return {
		id: TRAVERSE_REGION_ID,
		name: t("Traverse"),
		polygon: { coordinates: [] },
		found: meta.found,
		target: meta.target,
		checkedPanos: meta.checkedPanos,
		isProcessing: meta.isProcessing,
	};
}

const genStore = storage("map-generator");

function loadSettings(): GeneratorSettings {
	const saved = genStore.get<Partial<GeneratorSettings>>("settings");
	if (!saved) return DEFAULT_SETTINGS;
	const traverse = { ...DEFAULT_SETTINGS.traverse, ...saved.traverse };
	const concurrency = traverse.concurrency;
	if (concurrency < 50) traverse.concurrency = 50;
	if (concurrency > 500) traverse.concurrency = 500;
	return {
		...DEFAULT_SETTINGS,
		...saved,
		traverse,
		tags: { ...DEFAULT_SETTINGS.tags, ...saved.tags },
		notification: { ...DEFAULT_SETTINGS.notification, ...saved.notification },
		filterByAltitude: { ...DEFAULT_SETTINGS.filterByAltitude, ...saved.filterByAltitude },
		filterByMinutes: { ...DEFAULT_SETTINGS.filterByMinutes, ...saved.filterByMinutes },
		filterByProcdate: { ...DEFAULT_SETTINGS.filterByProcdate, ...saved.filterByProcdate },
		findByAuthor: { ...DEFAULT_SETTINGS.findByAuthor, ...saved.findByAuthor },
	};
}

function saveSettings(s: GeneratorSettings) {
	genStore.set("settings", s);
}

function selectionToRegion(sel: Selection, meta: GeneratorRegionMeta): GeneratorRegion | null {
	if (sel.selector.type !== "Polygon") return null;
	const polygon = sel.selector.polygon;
	const name = polygon.properties?.name || t("Unnamed polygon");
	return {
		id: sel.key,
		name,
		polygon,
		found: meta.found,
		target: meta.target,
		checkedPanos: meta.checkedPanos,
		isProcessing: meta.isProcessing,
	};
}

let sessionMeta: Map<string, GeneratorRegionMeta> = new Map();

function Stat({ icon, hint, value }: { icon: string; hint: string; value: string }) {
	return (
		<span className="generator-sidebar__stat">
			<Tooltip content={hint}>
				<span className="generator-sidebar__stat-icon" aria-label={hint}>
					<Icon path={icon} size={14} />
				</span>
			</Tooltip>
			{value}
		</span>
	);
}

function formatTraverseSpeed(idsPerSec: number): string {
	if (!Number.isFinite(idsPerSec) || idsPerSec <= 0) return t("{rate}/s", { rate: "—" });
	if (idsPerSec >= 1000) return t("{rate}k/s", { rate: (idsPerSec / 1000).toFixed(1) });
	return t("{rate}/s", { rate: Math.round(idsPerSec) });
}

/** Ring plus a bar for the pano-id range. Traverse often has no polygon row to hang this on. */
function TraverseProgress({ settings }: { settings: GeneratorSettings }) {
	const [stats, setStats] = useState(getGeneratorStats);
	useEffect(() => {
		const poll = setInterval(() => setStats(getGeneratorStats()), 400);
		return () => clearInterval(poll);
	}, []);
	const scan = isTraverse(settings) ? stats?.traverse : null;
	if (!scan || scan.total <= 0) return null;
	const pct = Math.max(0, Math.min(100, (scan.finished / scan.total) * 100));
	const size = 28;
	const stroke = 3;
	const radius = (size - stroke) / 2;
	const circumference = 2 * Math.PI * radius;
	const title = t("Scanned {done} of {total} pano ids", {
		done: fmt.format(scan.finished),
		total: fmt.format(scan.total),
	});
	return (
		<div className="traverse-progress" title={title}>
			<div className="traverse-progress__head">
				<div
					className="traverse-ring"
					role="progressbar"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(pct)}
					aria-label={t("Traverse")}
				>
					<svg width={size} height={size} aria-hidden="true">
						<circle
							className="traverse-ring__track"
							cx={size / 2}
							cy={size / 2}
							r={radius}
							strokeWidth={stroke}
						/>
						{pct > 0 && (
							<circle
								className="traverse-ring__bar"
								cx={size / 2}
								cy={size / 2}
								r={radius}
								strokeWidth={stroke}
								strokeDasharray={circumference}
								strokeDashoffset={circumference * (1 - pct / 100)}
							/>
						)}
					</svg>
					<span className="traverse-ring__label">{Math.round(pct)}%</span>
				</div>
				<span
					className="traverse-progress__speed mono"
					title={t("Average pano ids per second since the scan started")}
				>
					{formatTraverseSpeed(scan.perSec)}
				</span>
				<span className="traverse-progress__count mono">
					{t("{done} / {total}", { done: fmt.format(scan.finished), total: fmt.format(scan.total) })}
				</span>
			</div>
			<Bar value={scan.finished / scan.total} size="md" />
		</div>
	);
}

function StatsRow() {
	const [stats, setStats] = useState(getGeneratorStats);
	useEffect(() => {
		const poll = setInterval(() => setStats(getGeneratorStats()), 1000);
		return () => clearInterval(poll);
	}, []);
	if (!stats) return null;
	return (
		<div className="generator-sidebar__stats mono">
			<div className="generator-sidebar__stat-group">
				<Stat
					icon={mdiBullseyeArrow}
					hint={t("Hit rate: the share of answered probes that became a location, last 10 seconds")}
					value={stats.hitRate == null ? "--" : `${Math.round(stats.hitRate * 100)}%`}
				/>
				<Stat
					icon={mdiSpeedometer}
					hint={t("Locations added per second, last 10 seconds")}
					value={t("{rate}/s", { rate: Math.round(stats.locsPerSec) })}
				/>
				<Stat
					icon={mdiRadar}
					hint={t("Probes answered per second, last 10 seconds")}
					value={t("{rate}/s", { rate: Math.round(stats.probesPerSec) })}
				/>
			</div>
			<div className="generator-sidebar__stat-group">
				<Stat
					icon={mdiChartScatterPlot}
					hint={t(
						"Spread: how evenly locations cover the probed area, from clustered (low) to even (100%)",
					)}
					value={stats.spread == null ? "--" : `${Math.round(stats.spread * 100)}%`}
				/>
				<Stat
					icon={mdiMapMarkerCheck}
					hint={t("Locations found this run")}
					value={fmt.format(stats.found)}
				/>
				<Stat
					icon={mdiFilterRemove}
					hint={t("Panos rejected by the filters")}
					value={fmt.format(stats.rejected)}
				/>
				<Stat
					icon={mdiContentDuplicate}
					hint={t("Duplicate panos skipped")}
					value={fmt.format(stats.duplicates)}
				/>
			</div>
		</div>
	);
}

function formatYearMonth(ym: string) {
	const p = ymParse(ym);
	return p ? `${MONTHS.short[p.m - 1]} ${p.y}` : ym;
}

function summarizeSettings(s: GeneratorSettings): string {
	const parts: string[] = [];
	const camera = getFieldDef("cameraType");
	const traverse = isTraverse(s);
	const google = s.provider === "google" || s.provider === "googleZoom";

	if (traverse) {
		parts.push(t("Baidu traverse"));
	} else if (google) {
	// Coverage type
	let coverage =
		s.rejectUnofficial && !s.rejectOfficial
			? t("official")
			: s.rejectOfficial && !s.rejectUnofficial
				? t("unofficial")
				: t("any");
	if (s.rejectGen1) coverage += ` ${t("(no {gen})", { gen: fieldValueLabel(camera, "gen1") })}`;
	if (s.findGeneration) {
		coverage += ` ${fieldValueLabel(camera, GENERATION_CAMERA_TYPE[s.generation])}`;
	}
	if (s.rejectDescription) coverage += ` ${t("trekker")}`;
	parts.push(t("{coverage} coverage", { coverage }));
	}

	// Date range
	if (s.selectMonths) {
		parts.push(
			t("in {fromMonth}–{toMonth}, {fromYear}–{toYear}", {
				fromMonth: MONTHS.short[parseInt(s.fromMonth, 10) - 1],
				toMonth: MONTHS.short[parseInt(s.toMonth, 10) - 1],
				fromYear: s.fromYear,
				toYear: s.toYear,
			}),
		);
	} else {
		parts.push(
			t("between {from} and {to}", {
				from: formatYearMonth(s.fromDate),
				to: formatYearMonth(s.toDate),
			}),
		);
	}

	// Heading / pitch / zoom
	if (s.adjustHeading) {
		const ref =
			s.headingReference === "link"
				? t("along road")
				: s.headingReference === "forward"
					? t("forward")
					: t("backward");
		const facing = t("facing {ref}", { ref });
		parts.push(s.headingDeviation > 0 ? `${facing} ±${s.headingDeviation}°` : facing);
	}
	if (s.adjustPitch) parts.push(t("pitch ±{deviation}°", { deviation: s.pitchDeviation }));
	if (s.adjustZoom) parts.push(t("zoom {level}", { level: s.zoomLevel }));

	if (!traverse) parts.push(t("{radius} radius", { radius: formatDistance(s.radius) }));
	if (s.samplingMode !== "random") parts.push(t("{mode} sampling", { mode: s.samplingMode }));

	// Date behavior
	if (s.checkAllDates) parts.push(t("checking all dates"));
	if (s.randomInTimeline) parts.push(t("random date in timeline"));

	// Acceptance toggles (only show non-default)
	if (!s.rejectDateless) parts.push(t("allowing dateless"));
	if (!s.rejectNoDescription) parts.push(t("allowing no-description"));
	if (s.onlyOneInTimeframe) parts.push(t("unique in timeframe"));

	// Search strategy
	if (s.skipExisting) {
		parts.push(t("skipping existing ({radius})", { radius: formatDistance(s.skipExistingRadius) }));
	}
	if (s.getIntersection) parts.push(t("intersections"));
	if (s.pinpointSearch) parts.push(t("curves >{angle}°", { angle: s.pinpointAngle }));
	if (s.checkLinks) {
		parts.push(
			t({ one: "checking {n} link hop", other: "checking {n} link hops" }, { n: s.linksDepth }),
		);
	}
	if (s.findRegions) {
		parts.push(t("{distance} from existing", { distance: formatDistance(s.regionRadius * 1000) }));
	}
	if (s.filterByLinks) parts.push(t("{min}–{max} links", { min: s.minLinks, max: s.maxLinks }));
	if (s.findCurves) parts.push(t("bend >{angle}°", { angle: s.minCurveAngle }));
	if (s.searchInDescription && s.searchTerms) {
		parts.push(
			s.searchFilterType === "include"
				? t('matching "{terms}"', { terms: s.searchTerms })
				: t('excluding "{terms}"', { terms: s.searchTerms }),
		);
	}

	if (s.oneCountryAtATime) parts.push(t("one region at a time"));

	return parts.join(", ");
}

export function GeneratorSidebar({ onClose }: { onClose: () => void }) {
	const [settings, setSettings] = useState<GeneratorSettings>(loadSettings);
	const [meta, setMeta] = useState<Map<string, GeneratorRegionMeta>>(sessionMeta);
	const [tagName, setTagName] = useState(() => genStore.get<string>("tagName", ""));
	const status = usePluginEvent(GENERATOR_CHANGED, getGeneratorStatus);
	const running = status !== "idle";
	const paused = status === "paused";
	const selections = useMapState(getActiveSelections);

	useEffect(() => {
		sessionMeta = meta;
	}, [meta]);

	// Drive the search-coverage overlay's visibility live from the toggle.
	useEffect(() => {
		searchCoverage.setEnabled(settings.showSearchOverlay);
	}, [settings.showSearchOverlay]);

	useEffect(() => {
		setGeneratorSidebarOpen(true);
		return () => setGeneratorSidebarOpen(false);
	}, []);

	const updateSettings = useCallback((patch: Partial<GeneratorSettings>) => {
		setSettings((prev) => {
			const next = { ...prev, ...patch };
			saveSettings(next);
			updateGenerationSettings(next);
			return next;
		});
	}, []);

	const handleMetaChange = useCallback((next: Map<string, GeneratorRegionMeta>) => {
		setMeta(next);
		updateGenerationTargets(new Map([...next].map(([k, m]) => [k, m.target])));
	}, []);

	const handleStart = useCallback(() => {
		const traverse = isTraverse(settings);
		const sels = getActiveSelections().filter((s) => s.selector.type === "Polygon");
		if (!traverse && (sels.length === 0 || !google)) return;

		// Fresh metadata for the selected regions, kept only if the run starts
		const nextMeta = new Map(sessionMeta);
		const regions: GeneratorRegion[] = [];
		for (const sel of sels) {
			const m: GeneratorRegionMeta = {
				target: nextMeta.get(sel.key)?.target ?? settings.defaultTarget,
				found: [],
				checkedPanos: new Set(),
				isProcessing: false,
			};
			nextMeta.set(sel.key, m);
			const region = selectionToRegion(sel, m);
			if (region) regions.push(region);
		}
		if (traverse && regions.length === 0) {
			const m: GeneratorRegionMeta = {
				target: settings.defaultTarget,
				found: [],
				checkedPanos: new Set(),
				isProcessing: false,
			};
			nextMeta.set(TRAVERSE_REGION_ID, m);
			regions.push(openTraverseRegion(m));
		}
		if (startGeneration(settings, regions, tagName)) setMeta(nextMeta);
	}, [settings, tagName]);

	const handlePause = useCallback(() => {
		if (!paused) {
			pauseGeneration();
			return;
		}
		const sels = getActiveSelections().filter((s) => s.selector.type === "Polygon");
		const nextMeta = new Map(sessionMeta);
		const desired: GeneratorRegion[] = [];
		for (const sel of sels) {
			const m = nextMeta.get(sel.key) ?? {
				target: settings.defaultTarget,
				found: [],
				checkedPanos: new Set(),
				isProcessing: false,
			};
			nextMeta.set(sel.key, m);
			const region = selectionToRegion(sel, m);
			if (region) desired.push(region);
		}
		if (isTraverse(settings) && desired.length === 0) {
			const m = nextMeta.get(TRAVERSE_REGION_ID) ?? {
				target: settings.defaultTarget,
				found: [],
				checkedPanos: new Set(),
				isProcessing: false,
			};
			nextMeta.set(TRAVERSE_REGION_ID, m);
			desired.push(openTraverseRegion(m));
		}
		setMeta(nextMeta);
		resumeGeneration(desired);
	}, [paused, settings]);

	const handleClose = useCallback(() => {
		onClose();
	}, [onClose]);

	const polygonSelections = selections.filter((s) => s.selector.type === "Polygon");

	return (
		<Sidebar
			title={t("Map Generator")}
			onBack={handleClose}
			className="generator-sidebar"
			footer={
				<>
					<p className="generator-sidebar__summary">{summarizeSettings(settings)}</p>
					<TraverseProgress settings={settings} />
					<div className="generator-sidebar__actions">
						{!running ? (
							<Button
								variant="primary"
								onClick={handleStart}
								disabled={polygonSelections.length === 0 && !isTraverse(settings)}
							>
								{t("Start")}
							</Button>
						) : (
							<>
								<Button onClick={handlePause}>{paused ? t("Resume") : t("Pause")}</Button>
								<Button onClick={stopGeneration}>{t("Stop")}</Button>
							</>
						)}
						<StatsRow />
					</div>
				</>
			}
		>
			<Section title={t("Regions ({n})", { n: polygonSelections.length })}>
				{isTraverse(settings) && polygonSelections.length === 0 && (
					<Hint>
						{t("Traverse scans pano ids and does not need a polygon. The default target is how many locations to keep.")}
					</Hint>
				)}
				<RegionSelector
					defaultTarget={settings.defaultTarget}
					onDefaultTargetChange={(v) => updateSettings({ defaultTarget: v })}
					meta={meta}
					onMetaChange={handleMetaChange}
					running={running}
				/>
			</Section>

			<SettingsPanel settings={settings} onChange={updateSettings} />

			<Section title={t("Output")}>
				<label className="settings-popup__item settings-popup__select">
					{t("Tag as:")}
					<TextInput
						type="text"
						value={tagName}
						onChange={(e) => {
							setTagName(e.target.value);
							genStore.set("tagName", e.target.value);
						}}
						placeholder={t("None")}
						disabled={running}
					/>
				</label>
			</Section>
		</Sidebar>
	);
}
