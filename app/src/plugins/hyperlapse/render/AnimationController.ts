import type { HyperlapseFrame, PlaybackDirection, PlaybackMode } from "../types";
import type { FrameLook, PovController } from "../pov";
import type { FrameRenderer } from "./FrameRenderer";
import type { FrameTexturePool } from "./FrameTexturePool";

export interface AnimationControllerOptions {
	fps?: number;
	mode?: PlaybackMode;
	smoothTransition?: boolean;
	pov: PovController;
	onFrame?: (index: number) => void;
	onPlayStateChange?: (playing: boolean) => void;
}

/**
 * Playback driver.
 *
 * Paint policy (perf-critical):
 * - RAF runs only while playing or while `needsPaint` is set (drag).
 * - Texture uploads only on frame index change (single reused CanvasTexture).
 * - Smooth blend only updates camera look numbers.
 */
export class AnimationController {
	private pool: FrameTexturePool | null = null;
	private index = 0;
	private playing = false;
	private running = false;
	private direction: PlaybackDirection = "forward";
	private fps: number;
	private mode: PlaybackMode;
	private smooth: boolean;
	private pov: PovController;
	private raf = 0;
	private accum = 0;
	private lastTs = 0;
	private blend = 0;
	private renderer: FrameRenderer;
	private onFrame?: (index: number) => void;
	private onPlayStateChange?: (playing: boolean) => void;
	private loadGen = 0;
	private currentFrame: HyperlapseFrame | null = null;
	private currentBase: FrameLook = { heading: 0, pitch: 0 };
	private stepping = false;
	private needsPaint = false;

	constructor(renderer: FrameRenderer, opts: AnimationControllerOptions) {
		this.renderer = renderer;
		this.fps = opts.fps ?? 20;
		this.mode = opts.mode ?? "pingpong";
		this.smooth = opts.smoothTransition ?? true;
		this.pov = opts.pov;
		this.onFrame = opts.onFrame;
		this.onPlayStateChange = opts.onPlayStateChange;
	}

	private ensureLoop() {
		if (this.running) return;
		this.running = true;
		this.lastTs = performance.now();
		const tick = (ts: number) => {
			if (!this.running) return;
			const dt = ts - this.lastTs;
			this.lastTs = ts;

			if (this.playing) {
				this.accum += dt;
				const frameMs = 1000 / this.fps;
				if (this.accum >= frameMs && !this.stepping) {
					this.accum %= frameMs;
					void this.stepOnce();
				}
				if (this.smooth && this.currentFrame) {
					this.blend = Math.min(1, this.accum / frameMs);
					this.applyBlendedLook();
				} else {
					this.applyCurrentLook();
				}
				this.renderer.render();
				this.needsPaint = false;
				this.raf = requestAnimationFrame(tick);
				return;
			}

			if (this.needsPaint) {
				this.applyCurrentLook();
				this.renderer.render();
				this.needsPaint = false;
			}

			// Stop the loop when idle to free the main thread / GPU for map+SV.
			if (!this.playing && !this.needsPaint) {
				this.running = false;
				this.raf = 0;
				return;
			}
			this.raf = requestAnimationFrame(tick);
		};
		this.raf = requestAnimationFrame(tick);
	}

	/** Request a single paint (e.g. after drag). Starts a short-lived RAF if needed. */
	requestPaint() {
		this.needsPaint = true;
		this.ensureLoop();
	}

	/** Immediate paint without waiting for RAF — used for pointer drag. */
	paintNow() {
		this.applyCurrentLook();
		this.renderer.render();
		this.needsPaint = false;
	}

	setPool(pool: FrameTexturePool | null) {
		this.pause();
		this.pool = pool;
		this.index = 0;
		this.direction = "forward";
		this.blend = 0;
		this.currentFrame = null;
		this.stepping = false;
		if (pool && pool.length) void this.show(0);
	}

	getIndex() {
		return this.index;
	}

	get length() {
		return this.pool?.length ?? 0;
	}

	isPlaying() {
		return this.playing;
	}

	setFps(fps: number) {
		this.fps = Math.max(1, fps);
	}

	setMode(mode: PlaybackMode) {
		this.mode = mode;
	}

	setSmooth(smooth: boolean) {
		this.smooth = smooth;
	}

	/** Recompute base look after POV config changes. */
	syncPov() {
		if (!this.currentFrame) return;
		this.currentBase = this.pov.resolveBase(this.currentFrame);
		this.paintNow();
	}

	play() {
		if (!this.pool?.length || this.playing) return;
		this.playing = true;
		this.accum = 0;
		this.lastTs = performance.now();
		this.onPlayStateChange?.(true);
		this.ensureLoop();
	}

	pause() {
		if (!this.playing) return;
		this.playing = false;
		this.onPlayStateChange?.(false);
		this.applyCurrentLook();
		this.renderer.render();
	}

	toggle() {
		if (this.playing) this.pause();
		else this.play();
	}

	next() {
		this.pause();
		if (this.index < this.length - 1) void this.show(this.index + 1);
	}

	prev() {
		this.pause();
		if (this.index > 0) void this.show(this.index - 1);
	}

	seek(index: number) {
		this.pause();
		if (!this.length) return;
		void this.show(Math.max(0, Math.min(this.length - 1, index)));
	}

	seekRelative(delta: number) {
		if (!this.length || !delta) return;
		this.seek(this.index + delta);
	}

	private applyCurrentLook() {
		if (!this.currentFrame) return;
		const look = this.pov.resolve(this.currentFrame);
		// When blending is off, resolve() already includes offsets from current base.
		// But resolve() recomputes base from frame — which is correct.
		this.renderer.setLook(look.heading, look.pitch, this.pov.roll);
	}

	private applyBlendedLook() {
		const cur = this.currentFrame;
		if (!cur) return;
		const nextIdx =
			this.direction === "forward"
				? Math.min(this.index + 1, this.length - 1)
				: Math.max(this.index - 1, 0);
		const nextMeta = this.pool?.getMeta(nextIdx);
		if (!nextMeta || nextIdx === this.index || !this.smooth) {
			this.applyCurrentLook();
			return;
		}
		const a = this.currentBase;
		const b = this.pov.resolveBase(nextMeta);
		const heading = lerpAngle(a.heading, b.heading, this.blend);
		const pitch = a.pitch + (b.pitch - a.pitch) * this.blend;
		const hOff = this.pov.canDragHeading() ? this.pov.headingOffset : 0;
		this.renderer.setLook(
			heading + hOff,
			Math.max(-85, Math.min(85, pitch + this.pov.pitchOffset)),
			this.pov.roll,
		);
	}

	private async stepOnce() {
		if (this.stepping || !this.playing) return;
		this.stepping = true;
		try {
			const next = this.nextIndex();
			if (next == null) {
				this.pause();
				return;
			}
			await this.show(next);
		} finally {
			this.stepping = false;
		}
	}

	private nextIndex(): number | null {
		if (!this.pool?.length) return null;
		const last = this.pool.length - 1;

		if (this.direction === "forward") {
			if (this.index >= last) {
				if (this.mode === "once") return null;
				if (this.mode === "loop") return 0;
				this.direction = "backward";
				return this.index > 0 ? this.index - 1 : null;
			}
			return this.index + 1;
		}

		if (this.index <= 0) {
			if (this.mode === "once") return null;
			if (this.mode === "loop") return last;
			this.direction = "forward";
			return this.index < last ? this.index + 1 : null;
		}
		return this.index - 1;
	}

	private async show(index: number) {
		const pool = this.pool;
		if (!pool) return;
		this.index = index;
		this.blend = 0;
		const gen = ++this.loadGen;
		const frame = await pool.ensure(index);
		if (gen !== this.loadGen || !frame) return;
		this.currentFrame = frame;
		this.currentBase = this.pov.resolveBase(frame);
		this.renderer.setTexture(frame);
		this.applyCurrentLook();
		if (!this.playing) this.renderer.render();
		this.onFrame?.(index);
	}

	dispose() {
		this.playing = false;
		this.running = false;
		cancelAnimationFrame(this.raf);
		this.raf = 0;
		this.pool = null;
		this.currentFrame = null;
		this.stepping = false;
	}
}

function lerpAngle(a: number, b: number, t: number): number {
	const d = ((b - a + 540) % 360) - 180;
	return (a + d * t + 360) % 360;
}
