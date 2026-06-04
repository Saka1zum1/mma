import type {
	GeneratorSettings,
	GeneratorRegion,
	GeneratedLocation,
	GenerationCallbacks,
} from "./types";
import { randomPointInBounds, getBoundingBox, pointInGeoJsonGeometry } from "./geo";
import { passesInitialFilters, passesDateFilters, isPanoGood, computeHeading } from "./filters";
import { distMeters } from "@/lib/geo/geo";

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
	private pauseResolve: (() => void) | null = null;
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

	async start(): Promise<void> {
		this.running = true;
		try {
			if (this.settings.oneCountryAtATime) {
				for (const region of this.regions) {
					if (!this.running) break;
					await this.generateRegion(region);
				}
			} else {
				const tasks: Promise<void>[] = [];
				for (const region of this.regions) {
					for (let i = 0; i < this.settings.numGenerators; i++) {
						tasks.push(this.generateRegion(region));
					}
				}
				await Promise.all(tasks);
			}
		} finally {
			this.flushBatch();
			this.running = false;
			this.callbacks.onDone();
		}
	}

	pause(): void {
		this.paused = true;
	}

	resume(): void {
		this.paused = false;
		if (this.pauseResolve) {
			this.pauseResolve();
			this.pauseResolve = null;
		}
		this.flushBatch(); // flush any locations held back while paused
	}

	stop(): void {
		this.running = false;
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		this.pendingBatch.length = 0;
		this.resume();
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
			this.pauseResolve = resolve;
		});
	}

	private async generateRegion(region: GeneratorRegion): Promise<void> {
		const [west, south, east, north] = getBoundingBox(region.feature);

		while (region.found.length < region.target && this.running) {
			await this.waitIfPaused();
			if (!this.running) return;

			region.isProcessing = true;
			const n = Math.min(region.target * 100, 1000);
			const randomCoords: { lat: number; lng: number }[] = [];
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
			if (randomCoords.length === 0) break;

			const batchSize = this.settings.findRegions ? 1 : 75;
			for (const batch of chunk(randomCoords, batchSize)) {
				if (!this.running || region.found.length >= region.target) break;
				await this.waitIfPaused();
				await Promise.allSettled(batch.map((coord) => this.getLoc(coord, region)));
			}
		}

		region.isProcessing = false;
		this.callbacks.onRegionComplete(region.id);
	}

	private getLoc(coord: { lat: number; lng: number }, region: GeneratorRegion): Promise<void> {
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
		if (!this.running || this.paused) return;
		const s = this.settings;
		if (depth > s.linksDepth) return;
		if (region.checkedPanos.has(id)) return;
		region.checkedPanos.add(id);
		if (region.found.length >= region.target) return;

		this.sv.getPanorama(
			{ pano: id },
			(data: google.maps.StreetViewPanoramaData | null, status: string) => {
				if (!this.running || this.paused) return;
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

				if (good) this.finalizeLoc(pano, region);
			},
		);
	}

	private finalizeLoc(
		pano: google.maps.StreetViewResolvedPanoramaData,
		region: GeneratorRegion,
	): void {
		if (!this.running || this.paused) return;
		const s = this.settings;
		const panoId: string = pano.location.pano;

		if (this.globalFoundPanoIds.has(panoId)) return;
		if (region.found.length >= region.target) return;

		this.globalFoundPanoIds.add(panoId);

		const loc: GeneratedLocation = {
			panoId,
			lat: pano.location.latLng.lat(),
			lng: pano.location.latLng.lng(),
			heading: computeHeading(pano, s),
			pitch: s.adjustPitch ? s.pitchDeviation : 0,
			imageDate: pano.imageDate ?? null,
		};

		region.found.push(loc);
		this.pendingBatch.push(loc);
		this.callbacks.onProgress(region.id, region.found.length, region.target);

		if (this.pendingBatch.length >= 10) {
			this.flushBatch();
		} else if (!this.flushTimer) {
			this.flushTimer = setTimeout(() => this.flushBatch(), 500);
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
