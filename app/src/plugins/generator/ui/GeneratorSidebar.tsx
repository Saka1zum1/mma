import { useState, useRef, useCallback, useEffect } from "react";
import { createLocation, LocationFlag } from "@/types";
import type { GeneratorSettings, GeneratorRegion, GeneratorRegionMeta, GeneratedLocation } from "../engine/types";
import { DEFAULT_SETTINGS } from "../engine/types";
import { GenerationEngine } from "../engine/GenerationEngine";
import { RegionSelector } from "./RegionSelector";
import { SettingsPanel } from "./SettingsPanel";
import { ProgressDisplay } from "./ProgressDisplay";
import { google } from "@/lib/sv/opensv";
import { getSelections, useSelections, getCurrentMap, createTags } from "@/store/useMapStore";
import type { Selection } from "@/bindings.gen";
import { createPluginStorage } from "@/plugins/registry";
import { Sidebar, Section } from "@/components/primitives/Sidebar";
import { searchCoverage } from "../searchCoverage";
import "./generator.css";

const genStore = createPluginStorage("map-generator");
const LEGACY_SETTINGS_KEY = "mma_generator_settings";

function loadSettings(): GeneratorSettings {
	let saved = genStore.get<Partial<GeneratorSettings>>("settings");
	if (!saved) {
		try {
			const legacy = localStorage.getItem(LEGACY_SETTINGS_KEY);
			if (legacy) saved = JSON.parse(legacy);
		} catch {
			// ignored
		}
	}
	return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
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
		panoId: loc.panoId,
		flags: LocationFlag.LoadAsPanoId,
		...(tagId != null ? { tags: [tagId] } : {}),
		...(loc.imageDate ? { extra: { imageDate: loc.imageDate } } : {}),
	});
}

async function resolveGeneratedLocationTag(): Promise<number | null> {
	const tagName = getCurrentMap()?.meta.settings?.generatedLocationTag;
	if (!tagName) return null;
	const [tag] = await createTags([tagName]);
	return tag.id;
}

function selectionToRegion(sel: Selection, meta: GeneratorRegionMeta): GeneratorRegion | null {
	if (sel.props.type !== "Polygon") return null;
	const poly = sel.props.polygon;
	const name = poly.properties?.name || "Unnamed polygon";
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

export function GeneratorSidebar({ onClose }: { onClose: () => void }) {
	const [settings, setSettings] = useState<GeneratorSettings>(loadSettings);
	const [meta, setMeta] = useState<Map<string, GeneratorRegionMeta>>(sessionMeta);
	const [running, setRunning] = useState(sessionRunning);
	const [paused, setPaused] = useState(sessionPaused);
	const [, rerender] = useState(0);
	const engineRef = useRef<GenerationEngine | null>(sessionEngine);
	const selections = useSelections();

	useEffect(() => { sessionMeta = meta; }, [meta]);
	useEffect(() => { sessionRunning = running; }, [running]);
	useEffect(() => { sessionPaused = paused; }, [paused]);

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
			onProgress: () => {
				rerender((n) => n + 1);
			},
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
			engineRef.current?.updateSettings(next); // apply live to a running job (#46)
			return next;
		});
	}, []);

	const handleStart = useCallback(async () => {
		const sels = getSelections().filter((s) => s.props.type === "Polygon");
		if (sels.length === 0) return;
		if (!google) return;

		const tagId = await resolveGeneratedLocationTag();
		sessionTagId = tagId;

		// Reset metadata for selected regions
		const nextMeta = new Map(sessionMeta);
		const regions: GeneratorRegion[] = [];
		for (const sel of sels) {
			const m = nextMeta.get(sel.key) ?? { target: settings.defaultTarget, found: [], checkedPanos: new Set(), isProcessing: false };
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
				rerender((n) => n + 1);
			},
			onProgress: () => {
				rerender((n) => n + 1);
			},
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
	}, [settings]);

	const handlePause = useCallback(() => {
		const engine = engineRef.current;
		if (!engine) return;
		if (engine.isPaused()) {
			engine.resume();
			setPaused(false);
		} else {
			engine.pause();
			setPaused(true);
		}
	}, []);

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
			const region = selectionToRegion(sel, m);
			if (region) regions.push(region);
		}
	}

	return (
		<Sidebar title="Map Generator" onBack={handleClose} className="generator-sidebar">
			<Section title={`Regions (${polygonSelections.length})`}>
				<RegionSelector
					defaultTarget={settings.defaultTarget}
					onDefaultTargetChange={(v) => updateSettings({ defaultTarget: v })}
					meta={meta}
					onMetaChange={setMeta}
				/>
			</Section>

			<SettingsPanel settings={settings} onChange={updateSettings} />

			<div className="generator-sidebar__actions">
				{!running ? (
					<button
						className="button button--primary"
						onClick={handleStart}
						disabled={polygonSelections.length === 0}
					>
						Start
					</button>
				) : (
					<>
						<button className="button" onClick={handlePause}>
							{paused ? "Resume" : "Pause"}
						</button>
						<button className="button" onClick={handleStop}>
							Stop
						</button>
					</>
				)}
			</div>

			{running && regions.length > 0 && (
				<Section title="Progress">
					<ProgressDisplay regions={regions} />
				</Section>
			)}
		</Sidebar>
	);
}
