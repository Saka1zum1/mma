import { LocationFlag } from "@/types";
import { t } from "@/lib/i18n";
import { registerJob, type JobHandle } from "@/lib/jobs";
import { fmt } from "@/lib/util/format";
import { log } from "@/lib/util/log";
import { definePluginEvent, emitPluginEvent } from "@/plugins/pluginEvents";
import { createTags, setPluginMode } from "@/store/useMapStore";
import { createLocation } from "@/types";
import { autoTagNames } from "./engine/autoTags";
import { GenerationEngine } from "./engine/GenerationEngine";
import {
	isGoogleProvider,
	storedProvider,
	type GeneratedLocation,
	type GeneratorRegion,
	type GeneratorSettings,
	type GeneratorStats,
} from "./engine/types";
import { searchCoverage } from "./searchCoverage";

export type GeneratorStatus = "idle" | "running" | "paused";

export const GENERATOR_CHANGED = definePluginEvent("map-generator", "changed");

interface Run {
	engine: GenerationEngine;
	job: JobHandle;
}

let run: Run | null = null;
let sidebarOpen = false;
let frameQueued = false;

/** Traverse locations that are not normal coverage. One location gets one of these, never both. */
function coverageTag(loc: GeneratedLocation): string | null {
	if (loc.baiduCoverage === "timeline") return t("Timeline coverage");
	if (loc.baiduCoverage === "hidden") return t("Hidden coverage");
	return null;
}

function generatedToLocation(loc: GeneratedLocation, tagIds: number[]) {
	return createLocation({
		panoId: loc.panoId,
		lat: loc.lat,
		lng: loc.lng,
		heading: loc.heading,
		pitch: loc.pitch,
		zoom: loc.zoom,
		provider: storedProvider(loc.provider),
		flags: LocationFlag.LoadAsPanoId,
		...(tagIds.length ? { tags: tagIds } : {}),
		...(loc.imageDate ? { extra: { imageDate: loc.imageDate } } : {}),
	});
}

let activeSettings: GeneratorSettings | null = null;
let generationStartedAt = 0;
const announcedFirst = new Set<string>();
const announcedDone = new Set<string>();
let announcedAll = false;

function resetNotices(): void {
	announcedFirst.clear();
	announcedDone.clear();
	announcedAll = false;
	generationStartedAt = Date.now();
}

async function notify(title: string, body: string, loc?: GeneratedLocation): Promise<void> {
	try {
		if (typeof Notification !== "undefined" && Notification.permission === "granted") {
			new Notification(title, { body });
		}
	} catch (e) {
		log.warn("[generator] desktop notification failed:", e);
	}
	const note = activeSettings?.notification;
	if (!note?.sendToDiscord || !note.discordWebhook || !isGoogleProvider(activeSettings?.provider ?? "google")) {
		return;
	}
	const link = loc?.panoId
		? `\nhttps://www.google.com/maps/@?api=1&map_action=pano&pano=${encodeURIComponent(loc.panoId)}`
		: "";
	const place = [loc?.road, loc?.country].filter((part): part is string => !!part).join(", ");
	const content = `**${title}**\n${body}${place ? `\n${place}` : ""}${link}`;
	try {
		const response = await fetch(note.discordWebhook, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content, username: "MMA Map Generator" }),
		});
		if (!response.ok) log.warn("[generator] Discord webhook rejected the notice");
	} catch (e) {
		log.warn("[generator] Discord notification failed:", e);
	}
}

function announce(regions: GeneratorRegion[]): void {
	const settings = activeSettings;
	const note = settings?.notification;
	if (!note?.enabled || !settings || !isGoogleProvider(settings.provider)) return;
	const elapsed = ((Date.now() - generationStartedAt) / 1000).toFixed(1);
	for (const region of regions) {
		if (note.anyLocation && region.found.length > 0 && !announcedFirst.has(region.id)) {
			announcedFirst.add(region.id);
			void notify(
				t("Location found"),
				t("Found first location in {name} ({elapsed}s)", { name: region.name, elapsed }),
				region.found[0],
			);
		}
		if (
			note.onePolygonComplete &&
			region.found.length >= region.target &&
			!announcedDone.has(region.id)
		) {
			announcedDone.add(region.id);
			void notify(
				t("Region completed"),
				t("{name} has reached its goal ({elapsed}s)", { name: region.name, elapsed }),
			);
		}
	}
	if (
		note.allPolygonsComplete &&
		!announcedAll &&
		regions.length > 0 &&
		regions.every((region) => region.found.length >= region.target)
	) {
		announcedAll = true;
		void notify(
			t("Generation completed"),
			t("All regions have reached their goals ({elapsed}s)", { elapsed }),
		);
	}
}

async function addFound(locs: GeneratedLocation[], baseTagId: number | null): Promise<void> {
	const namesPerLoc = locs.map((loc) => {
		const names = autoTagNames(loc, activeSettings);
		const coverage = coverageTag(loc);
		if (coverage && !names.some((name) => name.toLowerCase() === coverage.toLowerCase())) {
			names.push(coverage);
		}
		return names;
	});
	const unique = [...new Set(namesPerLoc.flat())];
	const created = unique.length ? await createTags(unique) : [];
	const idByName = new Map(created.map((tag) => [tag.name.toLowerCase(), tag.id]));
	const rows = locs.map((loc, i) => {
		const ids = namesPerLoc[i]
			.map((name) => idByName.get(name.toLowerCase()))
			.filter((id): id is number => id != null);
		if (baseTagId != null) ids.unshift(baseTagId);
		return generatedToLocation(loc, ids);
	});
	await MMA.addLocations(rows);
}

async function resolveTagByName(name: string): Promise<number | null> {
	if (!name) return null;
	const [tag] = await createTags([name]);
	return tag.id;
}

// Finds arrive one pano at a time; the region list and the tray hear about them once a frame.
function progressFrame(): void {
	if (frameQueued) return;
	frameQueued = true;
	requestAnimationFrame(() => {
		frameQueued = false;
		if (run) {
			const scan = run.engine.traverseProgress();
			if (scan && scan.total > 0) {
				run.job.update(
					Math.min(scan.finished / scan.total, 1),
					`${fmt.format(scan.finished)} / ${fmt.format(scan.total)}`,
				);
			} else {
				const { found, target } = run.engine.progress();
				run.job.update(
					target > 0 ? Math.min(found / target, 1) : 0,
					`${fmt.format(found)} / ${fmt.format(target)}`,
				);
			}
		}
		emitPluginEvent(GENERATOR_CHANGED);
	});
}

export function getGeneratorStatus(): GeneratorStatus {
	if (!run) return "idle";
	return run.engine.isPaused() ? "paused" : "running";
}

let lastStats: GeneratorStats | null = null;

/** The live run's stats, or the last run's once it settled. */
export function getGeneratorStats(): GeneratorStats | null {
	return run ? run.engine.stats() : lastStats;
}

/** Generate over `regions`, tagging finds with `tagName`. False while a run is already live,
 *  so a double click starts one run. */
export function startGeneration(
	settings: GeneratorSettings,
	regions: GeneratorRegion[],
	tagName: string,
): boolean {
	if (run) return false;
	activeSettings = settings;
	resetNotices();
	let tagId: number | null = null;
	const engine = new GenerationEngine(settings, regions, {
		onLocationsFound: (locs) => {
			void addFound(locs, tagId).then(
				() => {
					announce(regions);
					progressFrame();
				},
				(e: unknown) => {
					log.error("[generator] failed to save finds:", e);
					progressFrame();
				},
			);
		},
		onProgress: progressFrame,
		onRegionComplete: () => {
			announce(regions);
			progressFrame();
		},
		onDone: () => settle(engine, t("Generation complete")),
	});
	const job = registerJob(t("Map generator"), {
		scope: "map",
		cancel: () => stop(engine),
		reveal: () => setPluginMode("map-generator"),
	});
	job.setHidden(sidebarOpen);
	run = { engine, job };
	emitPluginEvent(GENERATOR_CHANGED);
	void resolveTagByName(tagName)
		.then((id) => {
			tagId = id;
			return engine.start();
		})
		.catch((e: unknown) => {
			log.error("[generator] run failed:", e);
			stop(engine);
		});
	return true;
}

/** Stop generating. Finds already confirmed are written; nothing lands after. */
export function stopGeneration(): void {
	if (run) stop(run.engine);
}

function stop(engine: GenerationEngine): void {
	engine.stop();
	settle(engine);
}

/** Retire `engine`'s run, and only that run. */
function settle(engine: GenerationEngine, message?: string): void {
	const current = run;
	if (current?.engine !== engine) return;
	lastStats = engine.stats();
	run = null;
	current.job.finish(sidebarOpen ? undefined : message);
	emitPluginEvent(GENERATOR_CHANGED);
}

export function pauseGeneration(): void {
	if (!run || run.engine.isPaused()) return;
	run.engine.pause();
	emitPluginEvent(GENERATOR_CHANGED);
}

/** Resume a paused run over `desired`, the regions selected now. */
export function resumeGeneration(desired: GeneratorRegion[]): void {
	if (!run || !run.engine.isPaused()) return;
	run.engine.reconcileRegions(desired);
	run.engine.resume();
	emitPluginEvent(GENERATOR_CHANGED);
}

export function updateGenerationSettings(settings: GeneratorSettings): void {
	activeSettings = settings;
	run?.engine.updateSettings(settings);
}

export function updateGenerationTargets(targets: ReadonlyMap<string, number>): void {
	run?.engine.updateRegionTargets(targets);
}

/** The open sidebar shows the run itself, so its tray entry hides; closing it while idle
 *  clears the search overlay. */
export function setGeneratorSidebarOpen(open: boolean): void {
	sidebarOpen = open;
	run?.job.setHidden(open);
	if (!open && !run) searchCoverage.endSession();
}
