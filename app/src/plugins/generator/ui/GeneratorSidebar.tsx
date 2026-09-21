import { useState, useRef, useCallback, useEffect } from "react";
import { createLocation, LocationFlag } from "@/types";
import type {
	GeneratorSettings,
	GeneratorRegion,
	GeneratorRegionMeta,
	GeneratedLocation,
	GeneratorStats,
} from "../engine/types";
import { DEFAULT_SETTINGS } from "../engine/types";
import { GenerationEngine } from "../engine/GenerationEngine";
import { RegionSelector } from "./RegionSelector";
import { SettingsPanel } from "./SettingsPanel";
import { tickProgress } from "./progressSignal";
import { google } from "@/lib/sv/opensv";
import { getActiveSelections, useMapState, createTags, setPluginMode } from "@/store/useMapStore";
import { registerJob, type JobHandle } from "@/lib/jobs";
import { subscribe } from "@/lib/events";
import { fmt } from "@/lib/util/format";
import type { Selection } from "@/bindings.gen";
import { createPluginStorage } from "@/plugins/registry";
import { Sidebar, Section } from "@/components/primitives/Sidebar";
import { searchCoverage } from "../searchCoverage";
import { MONTHS, ymParse } from "@/lib/util/date";
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
import "./generator.css";
import { t } from "@/lib/i18n";

const genStore = createPluginStorage("map-generator");

function loadSettings(): GeneratorSettings {
	const saved = genStore.get<Partial<GeneratorSettings>>("settings");
	return { ...DEFAULT_SETTINGS, ...saved };
}

function saveSettings(s: GeneratorSettings) {
	genStore.set("settings", s);
}

function generatedToLocation(loc: GeneratedLocation, tagId: number | null) {
	return createLocation({
		lat: loc.lat,
		lng: loc.lng,
		heading: loc.heading,
		pitch: loc.pitch,
		zoom: loc.zoom,
		panoId: loc.panoId,
		flags: LocationFlag.LoadAsPanoId,
		...(tagId != null ? { tags: [tagId] } : {}),
		...(loc.imageDate ? { extra: { imageDate: loc.imageDate } } : {}),
	});
}

async function resolveTagByName(name: string): Promise<number | null> {
	if (!name) return null;
	const [tag] = await createTags([name]);
	return tag.id;
}

function selectionToRegion(sel: Selection, meta: GeneratorRegionMeta): GeneratorRegion | null {
	if (sel.selector.type !== "Polygon") return null;
	const poly = sel.selector.polygon;
	const name = poly.properties?.name || t("Unnamed polygon");
	const geometry = poly.extraPolygons
		? { type: "MultiPolygon" as const, coordinates: [poly.coordinates, ...poly.extraPolygons] }
		: { type: "Polygon" as const, coordinates: poly.coordinates };
	return {
		id: sel.key,
		name,
		feature: { type: "Feature", properties: { name }, geometry },
		found: meta.found,
		target: meta.target,
		checkedPanos: meta.checkedPanos,
		isProcessing: meta.isProcessing,
	};
}

let sessionMeta: Map<string, GeneratorRegionMeta> = new Map();
let sessionEngine: GenerationEngine | null = null;
let sessionRunning = false;
let sessionPaused = false;
let sessionTagId: number | null = null;
let sessionJob: JobHandle | null = null;
let sessionSidebarOpen = false;
let lastStats: GeneratorStats | null = null;

let jobUpdateQueued = false;
// Coalesced to a frame like tickProgress: onProgress fires per found pano, and an
// eager jobs:changed per pano re-renders the tray that often.
function updateSessionJob(): void {
	if (!sessionJob || jobUpdateQueued) return;
	jobUpdateQueued = true;
	requestAnimationFrame(() => {
		jobUpdateQueued = false;
		if (!sessionJob) return;
		let found = 0;
		let target = 0;
		for (const m of sessionMeta.values()) {
			found += m.found.length;
			target += m.target;
		}
		sessionJob.update(
			target > 0 ? Math.min(found / target, 1) : 0,
			`${fmt.format(found)} / ${fmt.format(target)}`,
		);
	});
}

function endSessionJob(message?: string): void {
	sessionJob?.finish(sessionSidebarOpen ? undefined : message);
	sessionJob = null;
}

/** Stop the engine from outside the sidebar (job tray cancel, map close). */
function stopSessionEngine(): void {
	if (sessionEngine) lastStats = sessionEngine.stats();
	sessionEngine?.stop();
	sessionEngine = null;
	sessionRunning = false;
	sessionPaused = false;
	endSessionJob();
}

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

function StatsRow({ engine }: { engine: GenerationEngine | null }) {
	const [stats, setStats] = useState<GeneratorStats | null>(
		() => engine?.stats() ?? lastStats,
	);
	useEffect(() => {
		const poll = setInterval(() => setStats(engine?.stats() ?? lastStats), 1000);
		return () => clearInterval(poll);
	}, [engine]);
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

	// Coverage type
	let coverage = "any";
	if (s.rejectUnofficial && !s.rejectOfficial) coverage = "official";
	else if (s.rejectOfficial && !s.rejectUnofficial) coverage = "unofficial";
	if (s.rejectGen1) coverage += " (no Gen 1)";
	if (s.findGeneration) {
		const gen = s.generation === 23 ? "Gen 2/3" : `Gen ${s.generation}`;
		coverage += ` ${gen}`;
	}
	if (s.rejectDescription) coverage += " trekker";
	parts.push(`${coverage} coverage`);

	// Date range
	if (s.selectMonths) {
		const fm = MONTHS.short[parseInt(s.fromMonth, 10) - 1];
		const tm = MONTHS.short[parseInt(s.toMonth, 10) - 1];
		parts.push(`in ${fm}–${tm}, ${s.fromYear}–${s.toYear}`);
	} else {
		parts.push(`between ${formatYearMonth(s.fromDate)} and ${formatYearMonth(s.toDate)}`);
	}

	// Heading / pitch / zoom
	if (s.adjustHeading) {
		const ref = s.headingReference === "link" ? "along road" : s.headingReference;
		const dev = s.headingDeviation > 0 ? ` ±${s.headingDeviation}°` : "";
		parts.push(`facing ${ref}${dev}`);
	}
	if (s.adjustPitch) parts.push(`pitch ±${s.pitchDeviation}°`);
	if (s.adjustZoom) parts.push(`zoom ${s.zoomLevel}`);

	// Radius
	parts.push(s.radius >= 1000 ? `${s.radius / 1000}km radius` : `${s.radius}m radius`);
	if (s.samplingMode !== "random") parts.push(`${s.samplingMode} sampling`);
	if (s.samplingMode === "blueline" && s.distribution !== "density") {
		parts.push(`${s.distribution} distribution`);
	}

	// Date behavior
	if (s.checkAllDates) parts.push("checking all dates");
	if (s.randomInTimeline) parts.push("random date in timeline");

	// Acceptance toggles (only show non-default)
	if (!s.rejectDateless) parts.push("allowing dateless");
	if (!s.rejectNoDescription) parts.push("allowing no-description");
	if (s.onlyOneInTimeframe) parts.push("unique in timeframe");

	// Search strategy
	if (s.skipExisting) parts.push(`skipping existing (${s.skipExistingRadius}m)`);
	if (s.getIntersection) parts.push("intersections");
	if (s.pinpointSearch) parts.push(`curves >${s.pinpointAngle}°`);
	if (s.findCurves) parts.push(t("bend >{angle}°", { angle: s.minCurveAngle }));
	if (s.checkLinks) parts.push(`checking ${s.linksDepth} link hops`);
	if (s.findRegions) parts.push(`${s.regionRadius}km from existing`);
	if (s.filterByLinks) parts.push(`${s.minLinks}–${s.maxLinks} links`);
	if (s.searchInDescription && s.searchTerms) {
		const verb = s.searchFilterType === "include" ? "matching" : "excluding";
		parts.push(`${verb} "${s.searchTerms}"`);
	}

	if (s.oneCountryAtATime) parts.push("one region at a time");

	return parts.join(", ");
}

export function GeneratorSidebar({ onClose }: { onClose: () => void }) {
	const [settings, setSettings] = useState<GeneratorSettings>(loadSettings);
	const [meta, setMeta] = useState<Map<string, GeneratorRegionMeta>>(sessionMeta);
	const [running, setRunning] = useState(sessionRunning);
	const [paused, setPaused] = useState(sessionPaused);
	const [tagName, setTagName] = useState(() => genStore.get<string>("tagName", ""));
	const [, rerender] = useState(0);
	const engineRef = useRef<GenerationEngine | null>(sessionEngine);
	const selections = useMapState(getActiveSelections);

	useEffect(() => {
		sessionMeta = meta;
	}, [meta]);
	useEffect(() => {
		sessionRunning = running;
	}, [running]);
	useEffect(() => {
		sessionPaused = paused;
	}, [paused]);

	// If engine is still running from before remount, wire up callbacks
	useEffect(() => {
		const engine = engineRef.current;
		if (!engine || !running) return;
		const tagId = sessionTagId;
		engine.replaceCallbacks({
			onLocationsFound: (locs: GeneratedLocation[]) => {
				MMA.addLocations(locs.map((l) => generatedToLocation(l, tagId)));
				updateSessionJob();
				rerender((n) => n + 1);
			},
			onProgress: () => {
				tickProgress();
				updateSessionJob();
			},
			onRegionComplete: () => {
				rerender((n) => n + 1);
			},
			onDone: () => {
				lastStats = engineRef.current?.stats() ?? lastStats;
				setRunning(false);
				setPaused(false);
				engineRef.current = null;
				sessionEngine = null;
				endSessionJob(t("Generation complete"));
			},
		});
	}, [running]);

	useEffect(
		() =>
			subscribe("jobs:changed", () => {
				if (sessionEngine || !engineRef.current) return;
				engineRef.current = null;
				setRunning(false);
				setPaused(false);
			}),
		[],
	);

	// Drive the search-coverage overlay's visibility live from the toggle.
	useEffect(() => {
		searchCoverage.setEnabled(settings.showSearchOverlay);
	}, [settings.showSearchOverlay]);

	// Clear the overlay when leaving the generator, unless it's still running in the background.
	useEffect(() => {
		sessionSidebarOpen = true;
		sessionJob?.setHidden(true);
		return () => {
			sessionSidebarOpen = false;
			sessionJob?.setHidden(false);
			if (!sessionRunning) searchCoverage.endSession();
		};
	}, []);

	const updateSettings = useCallback((patch: Partial<GeneratorSettings>) => {
		setSettings((prev) => {
			const next = { ...prev, ...patch };
			saveSettings(next);
			engineRef.current?.updateSettings(next); // apply live to a running job
			return next;
		});
	}, []);

	const handleMetaChange = useCallback((next: Map<string, GeneratorRegionMeta>) => {
		setMeta(next);
		engineRef.current?.updateRegionTargets(new Map([...next].map(([k, m]) => [k, m.target])));
	}, []);

	const handleStart = useCallback(async () => {
		const sels = getActiveSelections().filter((s) => s.selector.type === "Polygon");
		if (sels.length === 0) return;
		if (!google) return;

		const tagId = await resolveTagByName(tagName);
		sessionTagId = tagId;

		// Reset metadata for selected regions
		const nextMeta = new Map(sessionMeta);
		const regions: GeneratorRegion[] = [];
		for (const sel of sels) {
			const m = nextMeta.get(sel.key) ?? {
				target: settings.defaultTarget,
				found: [],
				checkedPanos: new Set(),
				isProcessing: false,
			};
			m.found = [];
			m.checkedPanos = new Set();
			m.isProcessing = false;
			nextMeta.set(sel.key, m);
			const region = selectionToRegion(sel, m);
			if (region) regions.push(region);
		}
		setMeta(nextMeta);

		const engine = new GenerationEngine(google, settings, regions, {
			onLocationsFound: (locs: GeneratedLocation[]) => {
				MMA.addLocations(locs.map((l) => generatedToLocation(l, tagId)));
				updateSessionJob();
				rerender((n) => n + 1);
			},
			onProgress: () => {
				tickProgress();
				updateSessionJob();
			},
			onRegionComplete: () => {
				rerender((n) => n + 1);
			},
			onDone: () => {
				lastStats = engineRef.current?.stats() ?? lastStats;
				setRunning(false);
				setPaused(false);
				engineRef.current = null;
				sessionEngine = null;
				endSessionJob(t("Generation complete"));
			},
		});

		engineRef.current = engine;
		sessionEngine = engine;
		sessionJob?.finish();
		sessionJob = registerJob(t("Map generator"), {
			scope: "map",
			cancel: stopSessionEngine,
			reveal: () => setPluginMode("map-generator"),
		});
		sessionJob.setHidden(true);
		setRunning(true);
		setPaused(false);
		engine.start();
	}, [settings, tagName]);

	const handlePause = useCallback(() => {
		const engine = engineRef.current;
		if (!engine) return;
		if (engine.isPaused()) {
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
			setMeta(nextMeta);
			engine.reconcileRegions(desired);
			engine.resume();
			setPaused(false);
		} else {
			engine.pause();
			setPaused(true);
		}
	}, [settings.defaultTarget]);

	const handleStop = useCallback(() => {
		stopSessionEngine();
		setRunning(false);
		setPaused(false);
		engineRef.current = null;
	}, []);

	const handleClose = useCallback(() => {
		onClose();
	}, [onClose]);

	const polygonSelections = selections.filter((s) => s.selector.type === "Polygon");

	return (
		<Sidebar title={t("Map Generator")} onBack={handleClose} className="generator-sidebar">
			<Section title={t("Regions ({n})", { n: polygonSelections.length })}>
				<RegionSelector
					defaultTarget={settings.defaultTarget}
					onDefaultTargetChange={(v) => updateSettings({ defaultTarget: v })}
					meta={meta}
					onMetaChange={handleMetaChange}
				/>
			</Section>

			<SettingsPanel settings={settings} onChange={updateSettings} />

			<Section title={t("Output")}>
				<label className="settings-popup__item settings-popup__select">
					{t("Tag as:")}
					<input
						className="text-input"
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

			<div className="generator-sidebar__footer">
				<p className="generator-sidebar__summary">{summarizeSettings(settings)}</p>
				<div className="generator-sidebar__actions">
					<StatsRow engine={engineRef.current} />
					{!running ? (
						<button
							className="button button--primary"
							onClick={handleStart}
							disabled={polygonSelections.length === 0}
						>
							{t("Start")}
						</button>
					) : (
						<>
							<button className="button" onClick={handlePause}>
								{paused ? t("Resume") : t("Pause")}
							</button>
							<button className="button" onClick={handleStop}>
								{t("Stop")}
							</button>
						</>
					)}
				</div>
			</div>
		</Sidebar>
	);
}
