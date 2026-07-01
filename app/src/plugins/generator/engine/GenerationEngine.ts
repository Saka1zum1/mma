import type {
	GeneratorSettings,
	GeneratorRegion,
	GeneratedLocation,
	GenerationCallbacks,
} from "./types";
import { randomPointInBounds, getBoundingBox, pointInGeoJsonGeometry } from "./geo";
import { passesInitialFilters, passesDateFilters, isPanoGood, computeHeading } from "./filters";
import { distMeters } from "@/lib/geo/geo";
import { searchCoverage } from "../searchCoverage";
import { cmd } from "@/lib/commands";
import { log } from "@/lib/util/log";
import type { LatLng } from "@/types";

function chunk<T>(arr: T[], n: number): T[][] {
	const result: T[][] = [];
	for (let i = 0; i < arr.length; i += n) {
		result.push(arr.slice(i, i + n));
	}
	return result;
}

export class GenerationEngine {
	private settings: GeneratorSettings;
	private regions: GeneratorRegion[];
	private callbacks: GenerationCallbacks;
	private sv: google.maps.StreetViewService;
	private google: Google;
	private running = false;
	private paused = false;
	private pauseResolvers: (() => void)[] = [];
	private cancelledRegions = new Set<string>();
	private regionTasks: Promise<void>[] = [];
	private liveRegionIds = new Set<string>();
	private globalFoundPanoIds = new Set<string>();
	private pendingBatch: GeneratedLocation[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;

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
	// take effect immediately. numGenerators and oneCountryAtATime are fixed at start().
	updateSettings(settings: GeneratorSettings) {
		this.settings = settings;
	}

	async start(): Promise<void> {
		this.running = true;
		this.beginSearchOverlay();
		try {
			if (this.settings.oneCountryAtATime) {
				this.regionTasks.push(this.runSequential());
			} else {
				for (const region of this.regions) {
					this.regionTasks.push(this.runRegionWorkers(region, this.settings.numGenerators));
				}
			}
			// Drain dynamically: reconcileRegions() can push new tasks while we await.
			while (this.regionTasks.length) {
				await Promise.all(this.regionTasks.splice(0));
			}
		} finally {
			this.flushBatch();
			this.running = false;
			this.callbacks.onDone();
		}
	}

	// One worker per region, finishing each before the next (oneCountryAtATime).
	// Skips regions already running as a reconcile-added worker, or cancelled.
	private async runSequential(): Promise<void> {
		for (let i = 0; i < this.regions.length; i++) {
			if (!this.running) return;
			const region = this.regions[i];
			if (this.cancelledRegions.has(region.id) || this.liveRegionIds.has(region.id)) continue;
			this.liveRegionIds.add(region.id);
			await this.generateRegion(region);
			this.liveRegionIds.delete(region.id);
		}
	}

	private runRegionWorkers(region: GeneratorRegion, count: number): Promise<void> {
		this.liveRegionIds.add(region.id);
		const workers: Promise<void>[] = [];
		for (let i = 0; i < count; i++) workers.push(this.generateRegion(region));
		return Promise.all(workers).then(() => {
			this.liveRegionIds.delete(region.id);
		});
	}

	// Apply a region set change to a running job. Intended to be called while paused
	// (parked workers see cancellation / new workers park immediately), then resume().
	reconcileRegions(desired: GeneratorRegion[]): void {
		if (!this.running) return;
		const desiredIds = new Set(desired.map((r) => r.id));

		for (const region of this.regions) {
			if (!desiredIds.has(region.id)) this.cancelledRegions.add(region.id);
		}

		const count = this.settings.oneCountryAtATime ? 1 : this.settings.numGenerators;
		for (const region of desired) {
			this.cancelledRegions.delete(region.id); // revive if previously removed
			if (this.liveRegionIds.has(region.id)) continue; // already working (or parked)
			if (!this.regions.some((r) => r.id === region.id)) this.regions.push(region);
			this.regionTasks.push(this.runRegionWorkers(region, count));
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

	stop(): void {
		this.flushBatch(); // commit confirmed finds before teardown (running still true here)
		this.running = false;
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		this.pendingBatch.length = 0;
		this.resume();
		searchCoverage.endSession();
	}

	private beginSearchOverlay(): void {
		if (this.regions.length === 0) return;
		let west = Infinity,
			south = Infinity,
			east = -Infinity,
			north = -Infinity;
		for (const region of this.regions) {
			const [w, s, e, n] = getBoundingBox(region.feature);
			if (w < west) west = w;
			if (s < south) south = s;
			if (e > east) east = e;
			if (n > north) north = n;
		}
		const r = this.settings.radius;
		const midLat = (south + north) / 2;
		const mPerDegLng = 111320 * Math.cos((midLat * Math.PI) / 180) || 1;
		searchCoverage.beginSession(
			[west - r / mPerDegLng, south - r / 111320, east + r / mPerDegLng, north + r / 111320],
			r,
		);
	}

	isRunning(): boolean {
		return this.running;
	}
	isPaused(): boolean {
		return this.paused;
	}

	private async waitIfPaused(): Promise<void> {
		if (!this.paused) return;
		await new Promise<void>((resolve) => {
			this.pauseResolvers.push(resolve);
		});
	}

	private async generateRegion(region: GeneratorRegion): Promise<void> {
		const [west, south, east, north] = getBoundingBox(region.feature);
		// Consecutive rounds where skip-existing filtered every probe: the region is
		// blanketed by existing locations — give up instead of spinning forever.
		let coveredRounds = 0;

		while (
			region.found.length < region.target &&
			this.running &&
			!this.cancelledRegions.has(region.id)
		) {
			await this.waitIfPaused();
			if (!this.running || this.cancelledRegions.has(region.id)) return;

			region.isProcessing = true;
			const n = Math.min(region.target * 100, this.settings.speed);
			let randomCoords: LatLng[] = [];
			// Cap attempts so a degenerate/near-zero-area polygon can never spin forever.
			// The bbox reject in pointInGeoJsonGeometry keeps each attempt cheap.
			let attempts = 0;
			const maxAttempts = n * 200;
			while (randomCoords.length < n && attempts < maxAttempts) {
				attempts++;
				const pt = randomPointInBounds(south, north, west, east);
				if (pointInGeoJsonGeometry(pt.lng, pt.lat, region.feature.geometry)) {
					randomCoords.push(pt);
				}
			}
			// Skip-existing: drop probes already covered by map locations before any SV
			// request is spent on them. One bulk IPC per probe batch (spatial index).
			if (this.settings.skipExisting && randomCoords.length > 0) {
				try {
					// eslint-disable-next-line local/no-ipc-in-loop -- already the bulk form: one IPC per probe batch (up to `speed` coords), not per point
					const near = await cmd.storeNearAny(
						randomCoords.map((c) => c.lat),
						randomCoords.map((c) => c.lng),
						this.settings.skipExistingRadius,
					);
					randomCoords = randomCoords.filter((_, i) => !near[i]);
				} catch (e) {
					log.warn("[generator] storeNearAny failed, probing unfiltered:", e);
				}
				if (randomCoords.length === 0) {
					if (++coveredRounds >= 20) break;
					continue;
				}
				coveredRounds = 0;
			}
			if (randomCoords.length === 0) break;

			const batchSize = this.settings.findRegions ? 1 : 75;
			for (const batch of chunk(randomCoords, batchSize)) {
				if (
					!this.running ||
					this.cancelledRegions.has(region.id) ||
					region.found.length >= region.target
				)
					break;
				await this.waitIfPaused();
				await Promise.allSettled(batch.map((coord) => this.getLoc(coord, region)));
			}
		}

		region.isProcessing = false;
		this.callbacks.onRegionComplete(region.id);
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
					if (!this.running || this.paused) {
						resolve();
						return;
					}
					if (status !== "OK" || !data) {
						resolve();
						return;
					}
					const pano = data as google.maps.StreetViewResolvedPanoramaData;

					if (!passesInitialFilters(pano, s)) {
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
						resolve();
						return;
					}

					if (s.randomInTimeline && pano.time?.length) {
						const idx = Math.floor(Math.random() * pano.time.length);
						const entry = pano.time[idx];
						const d = Object.values(entry).find((v): v is Date => v instanceof Date);
						if (d) {
							const ym = d.getFullYear() + "-" + (d.getMonth() > 8 ? "" : "0") + (d.getMonth() + 1);
							if (
								Date.parse(ym) < Date.parse(s.fromDate) ||
								Date.parse(ym) > Date.parse(s.toDate)
							) {
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
							const ym = d.getFullYear() + "-" + (d.getMonth() > 8 ? "" : "0") + (d.getMonth() + 1);
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
		if (!this.running || this.paused || this.cancelledRegions.has(region.id)) return;
		const s = this.settings;
		if (depth > s.linksDepth) return;
		if (region.checkedPanos.has(id)) return;
		region.checkedPanos.add(id);
		if (region.found.length >= region.target) return;

		this.sv.getPanorama(
			{ pano: id },
			(data: google.maps.StreetViewPanoramaData | null, status: string) => {
				if (!this.running || this.paused || this.cancelledRegions.has(region.id)) return;
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
						const ym = d.getFullYear() + "-" + (d.getMonth() > 8 ? "" : "0") + (d.getMonth() + 1);
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
			},
		);
	}

	private async finalizeLoc(
		pano: google.maps.StreetViewResolvedPanoramaData,
		region: GeneratorRegion,
	): Promise<void> {
		if (!this.running || this.paused || this.cancelledRegions.has(region.id)) return;
		const s = this.settings;
		const panoId: string = pano.location.pano;

		if (this.globalFoundPanoIds.has(panoId)) return;
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
			if (!this.running || this.paused || this.cancelledRegions.has(region.id)) return;
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
		if (this.pendingBatch.length === 0 || !this.running || this.paused) return;
		const batch = this.pendingBatch.splice(0);
		this.callbacks.onLocationsFound(batch);
	}
}
