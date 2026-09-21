import type {
	GeneratorSettings,
	GeneratorRegion,
	GeneratorStats,
	GeneratedLocation,
	GenerationCallbacks,
	PointSource,
	SamplingMode,
} from "./types";
import { gridPointSource, pointsInOrder } from "./pointSources";
import { blueLineSource, DISTRIBUTION_EVENNESS } from "./blueLineSampler";
import {
	randomPointInBounds,
	getBoundingBox,
	pointInGeoJsonGeometry,
	featureToPolygon,
} from "./geo";
import { ymFromDate } from "@/lib/util/date";
import { passesInitialFilters, passesDateFilters, isPanoGood, computeHeading } from "./filters";
import { fetchSvMetadataBatched } from "@/lib/sv/svMeta";
import { distMeters, lerpLng, unionBounds } from "@/lib/geo/geo";
import { searchCoverage } from "../searchCoverage";
import { RateWindow } from "./rateWindow";
import { spreadIndex } from "./spread";
import { cmd } from "@/lib/commands";
import { log } from "@/lib/util/log";
import { chunk } from "@/lib/util/util";
import type { Bounds, LatLng } from "@/types";

/** Share of a probe round that must have answered before the next round launches. */
const ROUND_OVERLAP_AT = 0.9;
const MAX_ROUNDS_IN_FLIGHT = 4;
/** Points per probe round; with the rounds in flight it keeps the lookup pipe saturated. */
const ROUND_SIZE = 1000;

const SILENT: GenerationCallbacks = {
	onLocationsFound: () => {},
	onProgress: () => {},
	onRegionComplete: () => {},
	onDone: () => {},
};

export class GenerationEngine {
	private settings: GeneratorSettings;
	private regions: GeneratorRegion[];
	private callbacks: GenerationCallbacks;
	private sv: google.maps.StreetViewService;
	private google: Google;
	private readonly abort = new AbortController();
	private started = false;
	private paused = false;
	private pauseResolvers: (() => void)[] = [];
	private cancelledRegions = new Set<string>();
	private regionTasks: Promise<void>[] = [];
	private liveRegionIds = new Set<string>();
	private globalFoundPanoIds = new Set<string>();
	private pendingBatch: GeneratedLocation[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private pointSources = new Map<string, Promise<PointSource>>();
	private answered = new RateWindow();
	private accepted = new RateWindow();
	private probesTotal = 0;
	private foundTotal = 0;
	private duplicates = 0;
	private rejected = 0;
	private cells = new Map<string, { probes: number; found: number }>();
	private cellDeg = 0.25;

	constructor(
		google: Google,
		settings: GeneratorSettings,
		regions: GeneratorRegion[],
		callbacks: GenerationCallbacks,
	) {
		this.google = google;
		this.sv = new google.maps.StreetViewService();
		this.settings = settings;
		this.regions = regions;
		this.callbacks = callbacks;
	}

	replaceCallbacks(callbacks: GenerationCallbacks) {
		this.callbacks = callbacks;
	}

	// Live-apply settings mid-job. Most settings are read fresh on every probe, so they
	// take effect immediately. oneCountryAtATime is fixed at start().
	updateSettings(settings: GeneratorSettings) {
		this.settings = settings;
	}

	async start(): Promise<void> {
		if (this.started || this.stopped) return;
		this.started = true;
		this.beginSearchOverlay();
		try {
			if (this.settings.oneCountryAtATime) {
				this.regionTasks.push(this.runSequential());
			} else {
				for (const region of this.regions) {
					this.regionTasks.push(this.runRegion(region));
				}
			}
			// Drain dynamically: reconcileRegions() can push new tasks while we await.
			while (this.regionTasks.length) {
				await Promise.all(this.regionTasks.splice(0));
			}
		} catch (e) {
			if (!this.stopped) throw e;
		} finally {
			this.flushBatch();
			const { onDone } = this.callbacks;
			this.abort.abort();
			onDone();
		}
	}

	// One worker per region, finishing each before the next (oneCountryAtATime).
	// Skips regions already running as a reconcile-added worker, or cancelled.
	private async runSequential(): Promise<void> {
		for (let i = 0; i < this.regions.length; i++) {
			if (this.stopped) return;
			const region = this.regions[i];
			if (this.cancelledRegions.has(region.id) || this.liveRegionIds.has(region.id)) continue;
			this.liveRegionIds.add(region.id);
			await this.generateRegion(region);
			this.liveRegionIds.delete(region.id);
		}
	}

	private runRegion(region: GeneratorRegion): Promise<void> {
		this.liveRegionIds.add(region.id);
		return this.generateRegion(region).then(() => {
			this.liveRegionIds.delete(region.id);
		});
	}

	// Apply a region set change to a running job. Intended to be called while paused
	// (parked workers see cancellation / new workers park immediately), then resume().
	reconcileRegions(desired: GeneratorRegion[]): void {
		if (!this.isRunning()) return;
		const desiredIds = new Set(desired.map((r) => r.id));

		for (const region of this.regions) {
			if (!desiredIds.has(region.id)) this.cancelledRegions.add(region.id);
		}

		for (const region of desired) {
			this.cancelledRegions.delete(region.id); // revive if previously removed
			const existing = this.regions.find((r) => r.id === region.id);
			if (existing) existing.target = region.target;
			if (this.liveRegionIds.has(region.id)) continue; // already working (or parked)
			if (!existing) this.regions.push(region);
			this.regionTasks.push(this.runRegion(existing ?? region));
		}

		const b = this.searchOverlayBounds();
		if (b && this.isRunning()) searchCoverage.growSession(b, this.settings.radius);
	}

	// Live-apply per-region target changes mid-job; workers re-read target every probe.
	updateRegionTargets(targets: ReadonlyMap<string, number>): void {
		for (const region of this.regions) {
			const t = targets.get(region.id);
			if (t != null) region.target = t;
		}
	}

	pause(): void {
		this.flushBatch(); // commit confirmed-but-buffered finds so they land on the map immediately
		this.paused = true;
	}

	resume(): void {
		this.paused = false;
		const resolvers = this.pauseResolvers.splice(0);
		for (const resolve of resolvers) resolve();
		this.flushBatch(); // flush any locations held back while paused
	}

	/** Rates over the last ten seconds plus run-wide counts: probes answered, locations
	 *  added, the share of answers that became a location, and how evenly the finds
	 *  spread over the probed cells. */
	stats(): GeneratorStats {
		const answers = this.answered.inWindow();
		return {
			probesPerSec: this.answered.perSecond(),
			locsPerSec: this.accepted.perSecond(),
			hitRate: answers > 0 ? this.accepted.inWindow() / answers : null,
			probes: this.probesTotal,
			found: this.foundTotal,
			duplicates: this.duplicates,
			rejected: this.rejected,
			spread: spreadIndex([...this.cells.values()].filter((c) => c.probes > 0).map((c) => c.found)),
		};
	}

	/** Aggregate found/target over the engine's current regions. */
	progress(): { found: number; target: number } {
		let found = 0;
		let target = 0;
		for (const region of this.regions) {
			found += Math.min(region.found.length, region.target);
			target += region.target;
		}
		return { found, target };
	}

	stop(): void {
		if (this.stopped) return;
		this.flushBatch();
		this.callbacks = SILENT;
		this.abort.abort();
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		this.pendingBatch.length = 0;
		this.resume();
		searchCoverage.endSession();
	}

	/** Every region's box, padded by the probe radius so a disc at the edge still lands. */
	private searchOverlayBounds(): Bounds | null {
		if (this.regions.length === 0) return null;
		let bounds: Bounds | null = null;
		for (const region of this.regions) {
			const bb = getBoundingBox(region.feature);
			if (bb) bounds = bounds ? unionBounds(bounds, bb) : bb;
		}
		if (!bounds) return null;
		const { west, south, east, north } = bounds;
		const r = this.settings.radius;
		const midLat = (south + north) / 2;
		const mPerDegLng = 111320 * Math.cos((midLat * Math.PI) / 180) || 1;
		return {
			west: west - r / mPerDegLng,
			south: south - r / 111320,
			east: east + r / mPerDegLng,
			north: north + r / 111320,
		};
	}

	private beginSearchOverlay(): void {
		const b = this.searchOverlayBounds();
		if (b) {
			searchCoverage.beginSession(b, this.settings.radius);
			this.cellDeg = Math.max((b.north - b.south) / 24, (b.east - b.west) / 24, 0.005);
		}
	}

	private cell(p: LatLng): { probes: number; found: number } {
		const key = `${Math.floor(p.lat / this.cellDeg)}:${Math.floor(p.lng / this.cellDeg)}`;
		let c = this.cells.get(key);
		if (!c) {
			c = { probes: 0, found: 0 };
			this.cells.set(key, c);
		}
		return c;
	}

	isRunning(): boolean {
		return this.started && !this.stopped;
	}
	isPaused(): boolean {
		return this.paused;
	}

	private get stopped(): boolean {
		return this.abort.signal.aborted;
	}

	/** Parks while paused, then answers whether the region still has work to do. */
	private async proceed(region: GeneratorRegion): Promise<boolean> {
		while (this.paused) {
			await new Promise<void>((resolve) => {
				this.pauseResolvers.push(resolve);
			});
		}
		return (
			!this.stopped && !this.cancelledRegions.has(region.id) && region.found.length < region.target
		);
	}

	private async generateRegion(region: GeneratorRegion): Promise<void> {
		const mode = this.settings.samplingMode;
		if (mode === "kernels") await this.generateRegionKernels(region);
		else if (mode === "random") await this.generateRegionRandom(region);
		else await this.generateRegionFrom(region, mode);

		region.isProcessing = false;
		this.callbacks.onRegionComplete(region.id);
	}

	/** Probes a region's points in batches until they run out. Every worker on the region
	 *  draws from the one supply, so no point is probed twice. */
	private async generateRegionFrom(
		region: GeneratorRegion,
		mode: Exclude<SamplingMode, "random" | "kernels">,
	): Promise<void> {
		let source = this.pointSources.get(region.id);
		if (!source) {
			source = this.pointSource(region, mode);
			this.pointSources.set(region.id, source);
		}
		const take = await source;
		const rounds = this.roundLauncher(region);

		while (await this.proceed(region)) {
			region.isProcessing = true;
			const batch = await take(ROUND_SIZE);
			if (batch.length === 0) break;
			const coords = await this.withoutExisting(batch);
			if (coords.length === 0) continue;
			await rounds.launch(coords);
		}
		await rounds.drain();

		this.pointSources.delete(region.id);
	}

	private async pointSource(
		region: GeneratorRegion,
		mode: Exclude<SamplingMode, "random" | "kernels">,
	): Promise<PointSource> {
		const polygon = featureToPolygon(region.feature);
		if (mode === "blueline")
			return blueLineSource(polygon, DISTRIBUTION_EVENNESS[this.settings.distribution]);
		if (mode === "poisson") {
			const pairs = await cmd.polygonPoissonPoints(polygon, 2 * this.settings.radius);
			const points = pairs.map(([lng, lat]) => ({ lat, lng }));
			log.info(`[generator] Poisson disk: ${points.length} probes for ${region.name}`);
			return pointsInOrder(points);
		}
		// Discs of the search radius cover the plane with no gaps when their centers form a honeycomb radius * sqrt(3) apart.
		const runs = await cmd.honeycombPoints(polygon, this.settings.radius * Math.sqrt(3));
		log.info(
			`[generator] Grid: ${runs.reduce((n, run) => n + run.count, 0)} probes for ${region.name}`,
		);
		return gridPointSource(runs);
	}

	/** With skip-existing on, drops the points that already have a location within its radius. */
	private async withoutExisting(coords: LatLng[]): Promise<LatLng[]> {
		if (!this.settings.skipExisting) return coords;
		try {
			const near = await cmd.storeNearAny(
				coords.map((c) => c.lat),
				coords.map((c) => c.lng),
				this.settings.skipExistingRadius,
			);
			return coords.filter((_, i) => !near[i]);
		} catch (e) {
			log.warn("[generator] storeNearAny failed, probing unfiltered:", e);
			return coords;
		}
	}

	private async generateRegionKernels(region: GeneratorRegion): Promise<void> {
		const bounds = getBoundingBox(region.feature);
		if (!bounds) return;
		const { east, north, south } = bounds;
		const centroidLat = (south + north) / 2;
		const centroidLng = lerpLng(bounds, 0.5);
		const coveringRadius = distMeters(
			{ lat: centroidLat, lng: centroidLng },
			{ lat: north, lng: east },
		);

		let seeds: string[];
		try {
			const locs = await cmd.storeFindNearby(centroidLat, centroidLng, coveringRadius);
			seeds = locs
				.filter((l) => l.panoId && pointInGeoJsonGeometry(l.lng, l.lat, region.feature.geometry))
				.map((l) => l.panoId!);
		} catch (e) {
			log.warn("[generator] Failed to fetch seed locations:", e);
			return;
		}

		if (seeds.length === 0) {
			log.warn(`[generator] Kernels: no existing locations with panoId in ${region.name}`);
			return;
		}
		log.info(`[generator] Kernels: ${seeds.length} seeds in ${region.name}`);

		const visited = region.checkedPanos;
		const depthMap = new Map<string, number>();
		const queue: string[] = [];
		for (const id of seeds) {
			if (!visited.has(id)) {
				visited.add(id);
				queue.push(id);
				depthMap.set(id, 0);
			}
		}

		const maxDepth = this.settings.linksDepth;
		const s = this.settings;

		while (queue.length > 0 && (await this.proceed(region))) {
			region.isProcessing = true;
			const frontier = queue.splice(0, ROUND_SIZE);
			const results = await fetchSvMetadataBatched(frontier, { signal: this.abort.signal });

			for (let i = 0; i < results.length; i++) {
				if (region.found.length >= region.target) break;

				const pano = results[i];
				if (!pano) continue;

				if (pano.extra?.drivingDirection != null && pano.tiles) {
					pano.tiles.centerHeading = pano.extra.drivingDirection;
				}

				const lat = pano.location.latLng.lat();
				const lng = pano.location.latLng.lng();
				if (!pointInGeoJsonGeometry(lng, lat, region.feature.geometry)) continue;

				let depth = depthMap.get(frontier[i]) ?? 0;

				// a find resets depth
				if (isPanoGood(pano, s)) {
					await this.finalizeLoc(pano, region);
					depth = 0;
				} else if (++depth > maxDepth) {
					continue;
				}

				for (const link of pano.links) {
					if (link.pano && !visited.has(link.pano)) {
						visited.add(link.pano);
						queue.push(link.pano);
						depthMap.set(link.pano, depth);
					}
				}
				if (s.checkAllDates && pano.time) {
					for (const entry of pano.time) {
						if (entry.pano && !visited.has(entry.pano)) {
							visited.add(entry.pano);
							queue.push(entry.pano);
							depthMap.set(entry.pano, depth);
						}
					}
				}
			}
		}
	}

	private async generateRegionRandom(region: GeneratorRegion): Promise<void> {
		let coveredRounds = 0;
		const rounds = this.roundLauncher(region);
		const polygon = featureToPolygon(region.feature);
		const bounds = getBoundingBox(region.feature);

		while (await this.proceed(region)) {
			region.isProcessing = true;
			const n = Math.min(region.target * 100, ROUND_SIZE);
			let randomCoords: LatLng[] = [];
			try {
				// eslint-disable-next-line local/no-ipc-in-loop -- one bulk sample per round, not per item
				randomCoords = (await cmd.polygonRandomPoints(polygon, n)).map(([lng, lat]) => ({
					lat,
					lng,
				}));
			} catch (e) {
				log.warn("[generator] polygonRandomPoints failed, sampling in JS:", e);
				if (bounds) {
					let attempts = 0;
					const maxAttempts = n * 200;
					while (randomCoords.length < n && attempts < maxAttempts) {
						attempts++;
						const pt = randomPointInBounds(bounds);
						if (pointInGeoJsonGeometry(pt.lng, pt.lat, region.feature.geometry)) {
							randomCoords.push(pt);
						}
					}
				}
			}
			if (this.settings.skipExisting && randomCoords.length > 0) {
				randomCoords = await this.withoutExisting(randomCoords);
				if (randomCoords.length === 0) {
					if (++coveredRounds >= 20) break;
					continue;
				}
				coveredRounds = 0;
			}
			if (randomCoords.length === 0) break;

			await rounds.launch(randomCoords);
		}
		await rounds.drain();
	}

	/** Rounds overlap: the next launches once most of the current one has answered, so a
	 *  straggling request cannot drain the pipe. findRegions stays strictly serial. */
	private roundLauncher(region: GeneratorRegion) {
		const rounds = new Set<Promise<void>>();
		let failure: unknown;
		const surface = () => {
			if (failure !== undefined) throw failure;
		};
		return {
			launch: async (coords: LatLng[]) => {
				surface();
				if (this.settings.findRegions) return this.probeAll(coords, region);
				const round = this.probeCoords(coords, region);
				const settled: Promise<void> = round.settled
					.catch((e: unknown) => {
						failure ??= e ?? new Error("probe round failed");
					})
					.finally(() => rounds.delete(settled));
				rounds.add(settled);
				if (rounds.size >= MAX_ROUNDS_IN_FLIGHT) await Promise.race(rounds);
				await round.mostlyDone;
			},
			drain: async () => {
				await Promise.all(rounds);
				surface();
			},
		};
	}

	private async probeAll(coords: LatLng[], region: GeneratorRegion): Promise<void> {
		const size = this.settings.findRegions ? 1 : coords.length || 1;
		for (const batch of chunk(coords, size)) {
			if (!(await this.proceed(region))) return;
			await this.probeCoords(batch, region).settled;
		}
	}

	/** One probe round. Each answer is handled the moment it streams in; `mostlyDone`
	 *  settles once `ROUND_OVERLAP_AT` of them are in, `settled` when the round is over. */
	private probeCoords(
		coords: LatLng[],
		region: GeneratorRegion,
	): { mostlyDone: Promise<void>; settled: Promise<void> } {
		const seen = new Uint8Array(coords.length);
		const threshold = Math.max(1, Math.ceil(coords.length * ROUND_OVERLAP_AT));
		let received = 0;
		let reachedMost!: () => void;
		const mostlyDone = new Promise<void>((resolve) => (reachedMost = resolve));

		const noteAnswer = (index: number) => {
			if (seen[index]) return;
			seen[index] = 1;
			received++;
			this.answered.add(1);
			this.probesTotal++;
			this.cell(coords[index]).probes++;
			if (received === threshold) reachedMost();
		};

		const settled = (async () => {
			try {
				await Promise.allSettled(
					coords.map((coord, i) =>
						this.getLoc(coord, region).finally(() => {
							noteAnswer(i);
						}),
					),
				);
			} finally {
				reachedMost();
			}
		})();
		return { mostlyDone, settled };
	}

	private getLoc(coord: LatLng, region: GeneratorRegion): Promise<void> {
		searchCoverage.addProbe(coord.lng, coord.lat);
		const s = this.settings;
		const source = s.rejectUnofficial
			? this.google.maps.StreetViewSource.GOOGLE
			: this.google.maps.StreetViewSource.DEFAULT;

		return new Promise<void>((resolve) => {
			this.sv.getPanorama(
				{ location: { lat: coord.lat, lng: coord.lng }, sources: [source], radius: s.radius },
				(data: google.maps.StreetViewPanoramaData | null, status: string) => {
					// Paused/stopped while this request was in flight: drop the result.
					if (!this.isRunning() || this.paused) {
						resolve();
						return;
					}
					if (status !== "OK" || !data) {
						this.rejected++;
						resolve();
						return;
					}
					const pano = data as google.maps.StreetViewResolvedPanoramaData;

					if (!passesInitialFilters(pano, s)) {
						this.rejected++;
						resolve();
						return;
					}

					if (s.findRegions) {
						for (const found of region.found) {
							if (distMeters(found, coord) < s.regionRadius * 1000) {
								resolve();
								return;
							}
						}
					}

					const dateResult = passesDateFilters(pano, s);
					if (dateResult === false) {
						this.rejected++;
						resolve();
						return;
					}

					if (s.randomInTimeline && pano.time?.length) {
						const idx = Math.floor(Math.random() * pano.time.length);
						const entry = pano.time[idx];
						const d = Object.values(entry).find((v): v is Date => v instanceof Date);
						if (d) {
							const ym = ymFromDate(d);
							if (
								Date.parse(ym) < Date.parse(s.fromDate) ||
								Date.parse(ym) > Date.parse(s.toDate)
							) {
								this.rejected++;
								resolve();
								return;
							}
						}
						this.getPanoDeep(entry.pano, region, 0);
						resolve();
						return;
					}

					if (dateResult === "checkAll" && pano.time) {
						const fromDate = Date.parse(s.fromDate);
						const toDate = Date.parse(s.toDate);
						for (const entry of pano.time) {
							if (s.rejectUnofficial && entry.pano.length !== 22) continue;
							const d = Object.values(entry).find((v): v is Date => v instanceof Date);
							if (!d) continue;
							const ym = ymFromDate(d);
							if (Date.parse(ym) >= fromDate && Date.parse(ym) <= toDate) {
								this.getPanoDeep(entry.pano, region, 0);
							}
						}
					} else {
						this.getPanoDeep(pano.location.pano, region, 0);
					}

					resolve();
				},
			);
		});
	}

	private getPanoDeep(id: string, region: GeneratorRegion, depth: number): void {
		if (!this.isRunning() || this.paused || this.cancelledRegions.has(region.id)) return;
		const s = this.settings;
		if (depth > s.linksDepth) return;
		if (region.checkedPanos.has(id)) {
			this.duplicates++;
			return;
		}
		region.checkedPanos.add(id);
		if (region.found.length >= region.target) return;

		this.sv.getPanorama(
			{ pano: id },
			(data: google.maps.StreetViewPanoramaData | null, status: string) => {
				if (!this.isRunning() || this.paused || this.cancelledRegions.has(region.id)) return;
				if (status === "UNKNOWN_ERROR") {
					region.checkedPanos.delete(id);
					this.getPanoDeep(id, region, depth);
					return;
				}
				if (status !== "OK" || !data) return;
				const pano = data as google.maps.StreetViewResolvedPanoramaData;

				const inRegion = pointInGeoJsonGeometry(
					pano.location.latLng.lng(),
					pano.location.latLng.lat(),
					region.feature.geometry,
				);
				const good = isPanoGood(pano, s) && inRegion;

				if (s.checkAllDates && !s.selectMonths && pano.time) {
					const fromDate = Date.parse(s.fromDate);
					const toDate = Date.parse(s.toDate);
					for (const entry of pano.time) {
						if (s.rejectUnofficial && entry.pano.length !== 22) continue;
						const d = Object.values(entry).find((v): v is Date => v instanceof Date);
						if (!d) continue;
						const ym = ymFromDate(d);
						if (Date.parse(ym) >= fromDate && Date.parse(ym) <= toDate) {
							this.getPanoDeep(entry.pano, region, good ? 1 : depth + 1);
						}
					}
				}

				if (s.checkLinks && pano.links) {
					for (const link of pano.links) {
						if (link.pano) this.getPanoDeep(link.pano, region, good ? 1 : depth + 1);
					}
				}
				if (s.checkLinks && pano.time) {
					for (const entry of pano.time) {
						this.getPanoDeep(entry.pano, region, good ? 1 : depth + 1);
					}
				}

				if (good) void this.finalizeLoc(pano, region);
				else this.rejected++;
			},
		);
	}

	private async finalizeLoc(
		pano: google.maps.StreetViewResolvedPanoramaData,
		region: GeneratorRegion,
	): Promise<void> {
		if (!this.isRunning() || this.paused || this.cancelledRegions.has(region.id)) return;
		const s = this.settings;
		const panoId: string = pano.location.pano;

		if (this.globalFoundPanoIds.has(panoId)) {
			this.duplicates++;
			return;
		}
		if (region.found.length >= region.target) return;

		this.globalFoundPanoIds.add(panoId);

		// A link-walked or snapped pano can sit near an existing location even when
		// its probe coordinate didn't — final skip-existing gate before accepting.
		if (s.skipExisting) {
			try {
				const covered = await cmd.storeNearAny(
					[pano.location.latLng.lat()],
					[pano.location.latLng.lng()],
					s.skipExistingRadius,
				);
				if (covered[0]) return;
			} catch (e) {
				log.warn("[generator] storeNearAny failed, accepting unchecked:", e);
			}
			if (!this.isRunning() || this.paused || this.cancelledRegions.has(region.id)) return;
			if (region.found.length >= region.target) return;
		}

		const loc: GeneratedLocation = {
			panoId,
			lat: pano.location.latLng.lat(),
			lng: pano.location.latLng.lng(),
			heading: computeHeading(pano, s),
			pitch: s.adjustPitch ? s.pitchDeviation : 0,
			zoom: s.adjustZoom ? s.zoomLevel : 0,
			imageDate: pano.imageDate ?? null,
		};

		region.found.push(loc);
		this.pendingBatch.push(loc);
		this.accepted.add(1);
		this.foundTotal++;
		this.cell(loc).found++;
		this.callbacks.onProgress(region.id, region.found.length, region.target);

		if (this.pendingBatch.length >= 200) {
			this.flushBatch();
		} else if (!this.flushTimer) {
			this.flushTimer = setTimeout(() => this.flushBatch(), 1000);
		}
	}

	private flushBatch(): void {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		if (this.pendingBatch.length === 0 || !this.isRunning() || this.paused) return;
		const batch = this.pendingBatch.splice(0);
		this.callbacks.onLocationsFound(batch);
	}
}
