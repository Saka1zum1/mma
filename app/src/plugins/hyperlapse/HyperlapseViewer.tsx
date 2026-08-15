import { useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { Button } from "@/components/primitives/Button";
import { Slider } from "@/components/primitives/Slider";
import { TextInput } from "@/components/primitives/TextInput";
import { NSelect } from "@/components/primitives/NSelect";
import { Icon } from "@/components/primitives/Icon";
import {
	mdiPlay,
	mdiPause,
	mdiSkipNext,
	mdiSkipPrevious,
	mdiFullscreen,
	mdiFullscreenExit,
	mdiAxisZRotateClockwise,
	mdiRestore,
} from "@mdi/js";
import { useT } from "@/lib/i18n";
import { FrameRenderer } from "./render/FrameRenderer";
import { AnimationController } from "./render/AnimationController";
import { FrameTexturePool } from "./render/FrameTexturePool";
import { PovController } from "./pov";
import type { HyperlapseFrameMeta, HyperlapseSettings, LookMode, ViewFilter } from "./types";

const VIEW_FILTER_LABEL: Record<ViewFilter, string> = {
	none: "None",
	vivid: "Vivid",
	vintage: "Vintage",
	mono: "Mono",
};

export function HyperlapseViewer({
	open,
	onClose,
	metas,
	settings,
	onSettingsPatch,
}: {
	open: boolean;
	onClose: () => void;
	metas: HyperlapseFrameMeta[];
	settings: HyperlapseSettings;
	/** Persist look-mode changes made in the viewer back to plugin settings. */
	onSettingsPatch?: (patch: Partial<HyperlapseSettings>) => void;
}) {
	const { t } = useT();
	const containerRef = useRef<HTMLDivElement>(null);
	const rendererRef = useRef<FrameRenderer | null>(null);
	const animRef = useRef<AnimationController | null>(null);
	const poolRef = useRef<FrameTexturePool | null>(null);
	const povRef = useRef(new PovController());
	const metasRef = useRef(metas);
	metasRef.current = metas;
	const indexRafRef = useRef(0);
	const pendingIndexRef = useRef(0);
	const [index, setIndex] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [ready, setReady] = useState(false);
	const [canvasFs, setCanvasFs] = useState(false);
	const [lookMode, setLookMode] = useState<LookMode>(settings.lookMode);
	const [viewFilter, setViewFilter] = useState<ViewFilter>(settings.viewFilter);
	const dragRef = useRef<{
		x: number;
		y: number;
		h: number;
		p: number;
		r: number;
		mode: "look" | "roll";
	} | null>(null);

	useLayoutEffect(() => {
		if (!open || !metas.length) {
			setReady(false);
			return;
		}

		let cancelled = false;
		let ro: ResizeObserver | null = null;
		let raf = 0;

		const disposeViewer = () => {
			animRef.current?.dispose();
			animRef.current = null;
			poolRef.current?.dispose();
			poolRef.current = null;
			rendererRef.current?.dispose();
			rendererRef.current = null;
		};

		const mount = () => {
			if (cancelled) return;
			const el = containerRef.current;
			if (!el) {
				raf = requestAnimationFrame(mount);
				return;
			}
			const w = el.clientWidth;
			const h = el.clientHeight;
			if (w < 2 || h < 2) {
				raf = requestAnimationFrame(mount);
				return;
			}

			disposeViewer();
			if (cancelled) return;

			const pov = povRef.current;
			pov.fromSettings(settings);
			pov.resetOffsets();
			setLookMode(pov.lookMode);
			setViewFilter(settings.viewFilter);

			const renderer = new FrameRenderer(el, {
				width: w,
				height: h,
				fov: settings.fov,
			});
			const pool = new FrameTexturePool(metasRef.current, { capacity: 3 });
			const anim = new AnimationController(renderer, {
				fps: settings.fps,
				mode: settings.playbackMode,
				smoothTransition: settings.smoothTransition,
				pov,
				onFrame: (i) => {
					pendingIndexRef.current = i;
					if (indexRafRef.current) return;
					indexRafRef.current = requestAnimationFrame(() => {
						indexRafRef.current = 0;
						setIndex(pendingIndexRef.current);
					});
				},
				onPlayStateChange: setPlaying,
			});
			rendererRef.current = renderer;
			poolRef.current = pool;
			animRef.current = anim;
			anim.setPool(pool);
			setIndex(0);
			setReady(true);
			el.focus({ preventScroll: true });

			ro = new ResizeObserver(() => {
				if (!containerRef.current || !rendererRef.current) return;
				const cw = containerRef.current.clientWidth;
				const ch = containerRef.current.clientHeight;
				if (cw < 2 || ch < 2) return;
				rendererRef.current.setSize(cw, ch);
				animRef.current?.paintNow();
			});
			ro.observe(el);
		};

		raf = requestAnimationFrame(mount);
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
			if (indexRafRef.current) cancelAnimationFrame(indexRafRef.current);
			indexRafRef.current = 0;
			ro?.disconnect();
			if (document.fullscreenElement) {
				void document.exitFullscreen().catch(() => undefined);
			}
			disposeViewer();
			setReady(false);
			setPlaying(false);
			setCanvasFs(false);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, metas]);

	useEffect(() => {
		const anim = animRef.current;
		const renderer = rendererRef.current;
		const pov = povRef.current;
		if (!anim || !renderer || !ready) return;
		anim.setFps(settings.fps);
		anim.setMode(settings.playbackMode);
		anim.setSmooth(settings.smoothTransition);
		pov.applyConfig({
			lookMode,
			lookAt: settings.lookAt,
			fixedHeading: settings.fixedHeading,
			useFixedPitch: settings.useFixedPitch,
			fixedPitch: settings.fixedPitch,
		});
		renderer.setFov(settings.fov);
		anim.syncPov();
	}, [
		settings.fps,
		settings.playbackMode,
		settings.smoothTransition,
		settings.fov,
		settings.lookAt,
		settings.fixedHeading,
		settings.useFixedPitch,
		settings.fixedPitch,
		lookMode,
		ready,
	]);

	useEffect(() => {
		setViewFilter(settings.viewFilter);
	}, [settings.viewFilter]);

	useEffect(() => {
		const onFs = () => {
			const el = containerRef.current;
			setCanvasFs(!!el && document.fullscreenElement === el);
			// Resize after FS transition.
			requestAnimationFrame(() => {
				const box = containerRef.current;
				const r = rendererRef.current;
				if (!box || !r) return;
				r.setSize(box.clientWidth, box.clientHeight);
				animRef.current?.paintNow();
			});
		};
		document.addEventListener("fullscreenchange", onFs);
		return () => document.removeEventListener("fullscreenchange", onFs);
	}, []);

	useEffect(() => {
		if (!open || !ready) return;

		const FAST_STEP = 5;
		const DOUBLE_MS = 400;
		let lastArrow: { key: string; t: number } | null = null;

		const isTypingTarget = (target: EventTarget | null) => {
			if (!(target instanceof HTMLElement)) return false;
			const tag = target.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
			return target.isContentEditable;
		};

		const onKeyDown = (e: KeyboardEvent) => {
			if (isTypingTarget(e.target)) return;
			const anim = animRef.current;
			if (!anim) return;

			if (e.code === "Space") {
				e.preventDefault();
				anim.toggle();
				return;
			}

			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
			e.preventDefault();
			const now = performance.now();
			const isDouble =
				lastArrow?.key === e.key && now - lastArrow.t < DOUBLE_MS;
			if (isDouble) {
				lastArrow = null;
				anim.seekRelative(e.key === "ArrowRight" ? FAST_STEP : -FAST_STEP);
				return;
			}
			lastArrow = { key: e.key, t: now };
			if (e.key === "ArrowRight") anim.next();
			else anim.prev();
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, ready]);

	const toggleCanvasFullscreen = async () => {
		const el = containerRef.current;
		if (!el) return;
		try {
			if (document.fullscreenElement === el) {
				await document.exitFullscreen();
			} else if (document.fullscreenElement) {
				await document.exitFullscreen();
				await el.requestFullscreen();
			} else {
				await el.requestFullscreen();
			}
		} catch {
			// Fullscreen may be blocked; ignore.
		}
	};

	const onPointerDown = (e: React.PointerEvent) => {
		const pov = povRef.current;
		(e.target as HTMLElement).setPointerCapture?.(e.pointerId);
		const rollMode = e.button === 2 || e.altKey || e.shiftKey;
		dragRef.current = {
			x: e.clientX,
			y: e.clientY,
			h: pov.headingOffset,
			p: pov.pitchOffset,
			r: pov.roll,
			mode: rollMode ? "roll" : "look",
		};
	};
	const onPointerMove = (e: React.PointerEvent) => {
		const drag = dragRef.current;
		const anim = animRef.current;
		if (!drag || !anim) return;
		const dx = e.clientX - drag.x;
		const dy = e.clientY - drag.y;
		const pov = povRef.current;
		if (drag.mode === "roll") pov.applyRollDrag(dx, drag.r);
		else pov.applyLookDrag(dx, dy, drag.h, drag.p);
		// Immediate paint — no texture work, no React state.
		anim.paintNow();
	};
	const onPointerUp = () => {
		dragRef.current = null;
	};

	const changeLookMode = (mode: LookMode) => {
		setLookMode(mode);
		povRef.current.lookMode = mode;
		if (mode === "lookAt") povRef.current.headingOffset = 0;
		onSettingsPatch?.({ lookMode: mode });
		animRef.current?.syncPov();
	};

	const changeViewFilter = (filter: ViewFilter) => {
		setViewFilter(filter);
		onSettingsPatch?.({ viewFilter: filter });
	};

	const resetRoll = () => {
		povRef.current.resetRoll();
		animRef.current?.paintNow();
	};

	const resetView = () => {
		povRef.current.resetOffsets();
		animRef.current?.syncPov();
	};

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent title={t("Road Trip viewer")} className="hyperlapse-viewer-dialog">
				<div className="hyperlapse-viewer">
					<div
						ref={containerRef}
						className={clsx("hyperlapse-viewer__canvas", {
							"hyperlapse-viewer__canvas--fs": canvasFs,
						})}
						data-filter={viewFilter}
						tabIndex={-1}
						onPointerDown={onPointerDown}
						onPointerMove={onPointerMove}
						onPointerUp={onPointerUp}
						onPointerCancel={onPointerUp}
						onContextMenu={(e) => e.preventDefault()}
					>
						<button
							type="button"
							className="icon-button hyperlapse-viewer__fs-btn"
							aria-label={
								canvasFs
									? t("Exit fullscreen")
									: t("Fullscreen canvas")
							}
							title={
								canvasFs
									? t("Exit fullscreen")
									: t("Fullscreen canvas")
							}
							onClick={(e) => {
								e.stopPropagation();
								void toggleCanvasFullscreen();
							}}
						>
							<Icon path={canvasFs ? mdiFullscreenExit : mdiFullscreen} />
						</button>
					</div>

					<div className="hyperlapse-viewer__pov">
						<label className="hyperlapse-viewer__pov-field">
							<span>{t("Look mode")}</span>
							<NSelect
								value={lookMode}
								disabled={!ready}
								className="nselect--limited"
								onChange={(e) => changeLookMode(e.target.value as LookMode)}
							>
								<option value="drive">{t("Follow driving direction")}</option>
								<option value="lookAt">{t("Look-at point")}</option>
								<option value="fixed">{t("Fixed heading")}</option>
								<option value="free">{t("Free (texture forward)")}</option>
							</NSelect>
						</label>
						<label className="hyperlapse-viewer__pov-field">
							<span>{t("Filter")}</span>
							<NSelect
								value={viewFilter}
								disabled={!ready}
								className="nselect--limited"
								onChange={(e) => changeViewFilter(e.target.value as ViewFilter)}
							>
								{(Object.keys(VIEW_FILTER_LABEL) as ViewFilter[]).map((id) => (
									<option key={id} value={id}>
										{t(VIEW_FILTER_LABEL[id])}
									</option>
								))}
							</NSelect>
						</label>
						{lookMode === "fixed" && (
							<label className="hyperlapse-viewer__pov-field">
								<span>{t("Heading (°)")}</span>
								<TextInput
									type="number"
									min={0}
									max={360}
									value={settings.fixedHeading}
									disabled={!ready}
									onChange={(e) => {
										const v = ((Number(e.target.value) % 360) + 360) % 360 || 0;
										povRef.current.fixedHeading = v;
										onSettingsPatch?.({ fixedHeading: v });
										animRef.current?.syncPov();
									}}
								/>
							</label>
						)}
						{lookMode === "lookAt" && (
							<span className="hyperlapse-viewer__pov-hint">
								{settings.lookAt
									? t("Aiming at {lat}, {lng}", {
											lat: settings.lookAt.lat.toFixed(5),
											lng: settings.lookAt.lng.toFixed(5),
										})
									: t("No look-at point set — pick one in the sidebar.")}
							</span>
						)}
						<span className="hyperlapse-viewer__pov-hint">
							{lookMode === "lookAt"
								? t("Drag for pitch · Alt/Shift/right-drag to roll")
								: t("Drag to look · Alt/Shift/right-drag to roll")}
						</span>
					</div>

					<div className="hyperlapse-viewer__controls">
						<Button
							small
							disabled={!ready}
							aria-label={t("Previous frame")}
							onClick={() => animRef.current?.prev()}
						>
							<Icon path={mdiSkipPrevious} size={18} />
						</Button>
						<Button
							small
							variant="primary"
							disabled={!ready || !metas.length}
							aria-label={playing ? t("Pause") : t("Play")}
							onClick={() => animRef.current?.toggle()}
						>
							<Icon path={playing ? mdiPause : mdiPlay} size={18} />
						</Button>
						<Button
							small
							disabled={!ready}
							aria-label={t("Next frame")}
							onClick={() => animRef.current?.next()}
						>
							<Icon path={mdiSkipNext} size={18} />
						</Button>
						<div className="hyperlapse-viewer__scrub">
							<Slider
								min={0}
								max={Math.max(0, metas.length - 1)}
								value={index}
								disabled={!ready || !metas.length}
								onChange={(e) => animRef.current?.seek(Number(e.target.value))}
							/>
							<span className="hyperlapse-viewer__pos">
								{metas.length ? index + 1 : 0} / {metas.length}
							</span>
						</div>
						<Button
							small
							disabled={!ready}
							aria-label={t("Reset view offsets")}
							title={t("Reset view offsets")}
							onClick={resetView}
						>
							<Icon path={mdiRestore} size={18} />
						</Button>
						<Button
							small
							disabled={!ready}
							aria-label={t("Reset roll")}
							title={t("Reset roll")}
							onClick={resetRoll}
						>
							<Icon path={mdiAxisZRotateClockwise} size={18} />
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
