import type { HyperlapseFrame, HyperlapseFrameMeta } from "../types";
import { stitchFrameImage, releaseCanvas } from "./PanoTextureLoader";

export interface FrameTexturePoolOptions {
	/** Keep at most this many decoded canvases. Default 3. */
	capacity?: number;
}

/**
 * Sliding-window cache of stitched panorama canvases.
 * Small by design — large equirects compete with map/SV WebGL for GPU memory.
 */
export class FrameTexturePool {
	private metas: HyperlapseFrameMeta[];
	private capacity: number;
	private cache = new Map<number, HyperlapseFrame>();
	private inflight = new Map<number, Promise<HyperlapseFrame | null>>();
	private order: number[] = []; // LRU indices
	private disposed = false;

	constructor(metas: HyperlapseFrameMeta[], opts: FrameTexturePoolOptions = {}) {
		this.metas = metas;
		this.capacity = Math.max(2, opts.capacity ?? 3);
	}

	get length() {
		return this.metas.length;
	}

	getMeta(index: number): HyperlapseFrameMeta | undefined {
		return this.metas[index];
	}

	/** Ensure `index` is loaded; also prefetch neighbors. */
	async ensure(index: number, signal?: AbortSignal): Promise<HyperlapseFrame | null> {
		if (this.disposed || index < 0 || index >= this.metas.length) return null;
		const frame = await this.loadOne(index, signal);
		// Prefetch neighbors without blocking.
		void this.loadOne(index + 1, signal);
		void this.loadOne(index - 1, signal);
		this.trim(index);
		return frame;
	}

	private async loadOne(index: number, signal?: AbortSignal): Promise<HyperlapseFrame | null> {
		if (this.disposed || index < 0 || index >= this.metas.length) return null;
		const hit = this.cache.get(index);
		if (hit) {
			this.touch(index);
			return hit;
		}
		let pending = this.inflight.get(index);
		if (!pending) {
			pending = (async () => {
				if (signal?.aborted) return null;
				const meta = this.metas[index];
				try {
					const image = await stitchFrameImage(meta);
					if (!image || this.disposed || signal?.aborted) {
						if (image) releaseCanvas(image);
						return null;
					}
					const frame: HyperlapseFrame = { ...meta, image };
					this.cache.set(index, frame);
					this.touch(index);
					this.trim(index);
					return frame;
				} catch {
					return null;
				} finally {
					this.inflight.delete(index);
				}
			})();
			this.inflight.set(index, pending);
		}
		return pending;
	}

	private touch(index: number) {
		const i = this.order.indexOf(index);
		if (i >= 0) this.order.splice(i, 1);
		this.order.push(index);
	}

	/** Evict frames farthest from `center`, keeping capacity. */
	trim(center: number) {
		while (this.order.length > this.capacity) {
			// Evict the LRU entry that is farthest from center (prefer keeping window around center).
			let evictAt = 0;
			let worst = -1;
			for (let i = 0; i < this.order.length; i++) {
				const idx = this.order[i];
				const dist = Math.abs(idx - center);
				// Prefer evicting old + far
				const score = dist * 10 + i;
				if (score > worst && idx !== center) {
					worst = score;
					evictAt = i;
				}
			}
			const idx = this.order.splice(evictAt, 1)[0];
			if (idx === center && this.order.length) continue;
			const frame = this.cache.get(idx);
			if (frame) {
				releaseCanvas(frame.image);
				this.cache.delete(idx);
			}
		}
	}

	dispose() {
		this.disposed = true;
		for (const frame of this.cache.values()) releaseCanvas(frame.image);
		this.cache.clear();
		this.inflight.clear();
		this.order = [];
	}
}
