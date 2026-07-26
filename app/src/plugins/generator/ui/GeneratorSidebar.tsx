import { useState, useRef, useCallback, useEffect } from "react";
import { createLocation, LocationFlag } from "@/types";
import type {
	GeneratorSettings,
	GeneratorRegion,
	GeneratorRegionMeta,
	GeneratedLocation,
} from "../engine/types";
import { DEFAULT_SETTINGS } from "../engine/types";
import { GenerationEngine } from "../engine/GenerationEngine";
import { RegionSelector } from "./RegionSelector";
import { SettingsPanel } from "./SettingsPanel";
import { ProgressDisplay } from "./ProgressDisplay";
import { tickProgress } from "./progressSignal";
import { google } from "@/lib/sv/opensv";
import { getActiveSelections, useMapState, createTags } from "@/store/useMapStore";
import type { Selection } from "@/bindings.gen";
import { createPluginStorage } from "@/plugins/registry";
import { Sidebar, Section } from "@/components/primitives/Sidebar";
import { searchCoverage } from "../searchCoverage";
import { MONTHS } from "@/lib/util/date";
import { useT, type MessageKey } from "@/lib/i18n";
import "./generator.css";

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

function selectionToRegion(
	sel: Selection,
	meta: GeneratorRegionMeta,
	unnamed: string,
): GeneratorRegion | null {
	if (sel.props.type !== "Polygon") return null;
	const poly = sel.props.polygon;
	const name = poly.properties?.name || unnamed;
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

function formatYearMonth(ym: string) {
	const [y, m] = ym.split("-");
	return `${MONTHS.short[parseInt(m, 10) - 1]} ${y}`;
}

function summarizeSettings(
	s: GeneratorSettings,
	t: (key: MessageKey, params?: Record<string, string | number | boolean>) => string,
): string {
	const parts: string[] = [];

	let coverage: string;
	if (s.rejectUnofficial && !s.rejectOfficial) coverage = t("plugin.generator.summary.unofficialCoverage");
	else if (s.rejectOfficial && !s.rejectUnofficial) coverage = t("plugin.generator.summary.officialCoverage");
	else coverage = t("plugin.generator.summary.anyCoverage");
	if (s.rejectGen1) coverage += t("plugin.generator.summary.noGen1");
	if (s.findGeneration) {
		const gen =
			s.generation === 23
				? t("plugin.generator.gen23")
				: s.generation === 4
					? t("plugin.generator.gen4")
					: t("plugin.generator.gen1");
		coverage += ` ${gen}`;
	}
	if (s.rejectDescription) coverage += t("plugin.generator.summary.trekker");
	parts.push(coverage + t("plugin.generator.summary.coverageSuffix"));

	if (s.selectMonths) {
		const fm = MONTHS.short[parseInt(s.fromMonth, 10) - 1];
		const tm = MONTHS.short[parseInt(s.toMonth, 10) - 1];
		parts.push(
			t("plugin.generator.summary.inMonthRange", {
				fromMonth: fm,
				toMonth: tm,
				fromYear: s.fromYear,
				toYear: s.toYear,
			}),
		);
	} else {
		parts.push(
			t("plugin.generator.summary.betweenDates", {
				from: formatYearMonth(s.fromDate),
				to: formatYearMonth(s.toDate),
			}),
		);
	}

	if (s.adjustHeading) {
		const refKey =
			s.headingReference === "link"
				? "plugin.generator.summary.ref.alongRoad"
				: s.headingReference === "forward"
					? "plugin.generator.summary.ref.forward"
					: "plugin.generator.summary.ref.backward";
		const dev = s.headingDeviation > 0 ? ` ±${s.headingDeviation}°` : "";
		parts.push(t("plugin.generator.summary.facingHeading", { ref: t(refKey), dev }));
	}
	if (s.adjustPitch) parts.push(t("plugin.generator.summary.pitchDev", { dev: s.pitchDeviation }));
	if (s.adjustZoom) parts.push(t("plugin.generator.summary.zoomLevel", { level: s.zoomLevel }));

	parts.push(
		s.radius >= 1000
			? t("plugin.generator.summary.kmRadius", { radius: s.radius / 1000 })
			: t("plugin.generator.summary.mRadius", { radius: s.radius }),
	);
	if (s.samplingMode !== "random") {
		const modeKey = `plugin.generator.sampling.${s.samplingMode}` as MessageKey;
		parts.push(t("plugin.generator.summary.samplingMode", { mode: t(modeKey) }));
	}

	if (s.checkAllDates) parts.push(t("plugin.generator.summary.checkingAllDates"));
	if (s.randomInTimeline) parts.push(t("plugin.generator.summary.randomDateInTimeline"));

	if (!s.rejectDateless) parts.push(t("plugin.generator.summary.allowingDateless"));
	if (!s.rejectNoDescription) parts.push(t("plugin.generator.summary.allowingNoDescription"));
	if (s.onlyOneInTimeframe) parts.push(t("plugin.generator.summary.uniqueInTimeframe"));

	if (s.skipExisting)
		parts.push(t("plugin.generator.summary.skippingExisting", { radius: s.skipExistingRadius }));
	if (s.getIntersection) parts.push(t("plugin.generator.summary.intersections"));
	if (s.pinpointSearch) parts.push(t("plugin.generator.summary.curvesOver", { angle: s.pinpointAngle }));
	if (s.checkLinks) parts.push(t("plugin.generator.summary.checkingLinks", { depth: s.linksDepth }));
	if (s.findRegions) parts.push(t("plugin.generator.summary.kmFromExisting", { radius: s.regionRadius }));
	if (s.filterByLinks)
		parts.push(t("plugin.generator.summary.linksRange", { min: s.minLinks, max: s.maxLinks }));
	if (s.searchInDescription && s.searchTerms) {
		const key =
			s.searchFilterType === "include"
				? "plugin.generator.summary.matchingTerms"
				: "plugin.generator.summary.excludingTerms";
		parts.push(t(key, { terms: s.searchTerms }));
	}

	if (s.numGenerators > 1) parts.push(t("plugin.generator.summary.workers", { count: s.numGenerators }));
	if (s.oneCountryAtATime) parts.push(t("plugin.generator.summary.oneRegionAtATime"));

	return parts.join(", ");
}

export function GeneratorSidebar({ onClose }: { onClose: () => void }) {
	const { t } = useT();
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
				rerender((n) => n + 1);
			},
			onProgress: () => tickProgress(),
			onRegionComplete: () => {
				rerender((n) => n + 1);
			},
			onDone: () => {
				setRunning(false);
				setPaused(false);
				engineRef.current = null;
				sessionEngine = null;
			},
		});
	}, [running]);

	// Drive the search-coverage overlay's visibility live from the toggle.
	useEffect(() => {
		searchCoverage.setEnabled(settings.showSearchOverlay);
	}, [settings.showSearchOverlay]);

	// Clear the overlay when leaving the generator, unless it's still running in the background.
	useEffect(() => {
		return () => {
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
		const sels = getActiveSelections().filter((s) => s.props.type === "Polygon");
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
			const region = selectionToRegion(sel, m, t("plugin.generator.unnamedPolygon"));
			if (region) regions.push(region);
		}
		setMeta(nextMeta);

		const engine = new GenerationEngine(google, settings, regions, {
			onLocationsFound: (locs: GeneratedLocation[]) => {
				MMA.addLocations(locs.map((l) => generatedToLocation(l, tagId)));
				rerender((n) => n + 1);
			},
			onProgress: () => tickProgress(),
			onRegionComplete: () => {
				rerender((n) => n + 1);
			},
			onDone: () => {
				setRunning(false);
				setPaused(false);
				engineRef.current = null;
				sessionEngine = null;
			},
		});

		engineRef.current = engine;
		sessionEngine = engine;
		setRunning(true);
		setPaused(false);
		engine.start();
	}, [settings, tagName]);

	const handlePause = useCallback(() => {
		const engine = engineRef.current;
		if (!engine) return;
		if (engine.isPaused()) {
			const sels = getActiveSelections().filter((s) => s.props.type === "Polygon");
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
				const region = selectionToRegion(sel, m, t("plugin.generator.unnamedPolygon"));
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
		engineRef.current?.stop();
		setRunning(false);
		setPaused(false);
		engineRef.current = null;
		sessionEngine = null;
	}, []);

	const handleClose = useCallback(() => {
		onClose();
	}, [onClose]);

	// Build regions from current selections + meta for progress display
	const polygonSelections = selections.filter((s) => s.props.type === "Polygon");
	const regions: GeneratorRegion[] = [];
	for (const sel of polygonSelections) {
		const m = meta.get(sel.key);
		if (m) {
			const region = selectionToRegion(sel, m, t("plugin.generator.unnamedPolygon"));
			if (region) regions.push(region);
		}
	}

	return (
		<Sidebar title={t("plugin.generator.title")} onBack={handleClose} className="generator-sidebar">
			<Section title={t("plugin.generator.regions", { count: polygonSelections.length })}>
				<RegionSelector
					defaultTarget={settings.defaultTarget}
					onDefaultTargetChange={(v) => updateSettings({ defaultTarget: v })}
					meta={meta}
					onMetaChange={handleMetaChange}
				/>
			</Section>

			<SettingsPanel settings={settings} onChange={updateSettings} />

			<Section title={t("plugin.generator.output")}>
				<label className="settings-popup__item settings-popup__select">
					{t("plugin.generator.tagAs")}
					<input
						className="text-input"
						type="text"
						value={tagName}
						onChange={(e) => {
							setTagName(e.target.value);
							genStore.set("tagName", e.target.value);
						}}
						placeholder={t("common.none")}
						disabled={running}
					/>
				</label>
			</Section>

			<div className="generator-sidebar__footer">
				<p className="generator-sidebar__summary">{summarizeSettings(settings, t)}</p>
				{running && regions.length > 0 && (
					<div className="generator-progress">
						<ProgressDisplay regions={regions} />
					</div>
				)}
				<div className="generator-sidebar__actions">
					{!running ? (
						<button
							className="button button--primary"
							onClick={handleStart}
							disabled={polygonSelections.length === 0}
						>
							{t("plugin.generator.start")}
						</button>
					) : (
						<>
							<button className="button" onClick={handlePause}>
								{paused ? t("plugin.generator.resume") : t("plugin.generator.pause")}
							</button>
							<button className="button" onClick={handleStop}>
								{t("plugin.generator.stop")}
							</button>
						</>
					)}
				</div>
			</div>
		</Sidebar>
	);
}
