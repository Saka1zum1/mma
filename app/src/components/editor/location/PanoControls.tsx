/* eslint-disable react-refresh/only-export-components */
import { memo, useEffect, useRef, useState, useCallback } from "react";
import { hasLoadAsPanoId, LocationFlag } from "@/types";
import { PANO_ZOOM, SV_JUMP_RADIUS, displayZoom, zoomInStep, zoomOutStep } from "@/lib/sv/constants";
import { google } from "@/lib/sv/opensv";
import { lookupStreetView } from "@/lib/sv/lookup";
import { shortenMapsUrl, mapsPanoUrl, fovForZoom, appendLinkTags } from "@/lib/sv/mapsLink";
import {
	buildLookmapOpenUrl,
	buildLookmapShareUrl,
	googlePovToLookmapRadians,
} from "@/lib/sv/lookaround/shareLink";
import { buildBaiduShareUrl, shortenBaiduShareUrl } from "@/lib/sv/baidu/shareLink";
import { stripBaidu, isBaiduPanoId, isBaiduRotatedCarPano } from "@/lib/sv/baidu/prefix";
import { getPanorama } from "@/lib/sv/panoSingleton";
import { buildTencentShareUrl } from "@/lib/sv/tencent/shareLink";
import { stripTencent, isTencentPanoId } from "@/lib/sv/tencent/prefix";
import { buildYandexShareUrl } from "@/lib/sv/yandex/shareLink";
import { stripYandex, isYandexPanoId } from "@/lib/sv/yandex/prefix";
import { getLocationProvider } from "@/lib/sv/providers/types";
import { useSettings } from "@/store/settings";
import { getMapState, useMapState } from "@/store/useMapStore";
import { getPanoAltitude, subscribePanoAltitude } from "./PanoViewerContext";
import { useBinding } from "@/lib/util/hotkeys";
import { useHotkeyRef } from "@/lib/hooks/useHotkey";
import { usePanoEvent } from "@/lib/hooks/usePanoEvent";
import { open } from "@tauri-apps/plugin-shell";
import { tweenPov } from "@/lib/sv/tweenPov";
import { snapshotPanoView, renderPanoView, canvasToBlob } from "@/lib/sv/panoCapture";
import { downloadBlob, copyImageToClipboard } from "@/lib/util/util";
import { toast } from "@/lib/util/toast";
import { log } from "@/lib/util/log";
import { Tooltip } from "@/components/primitives/Tooltip";
import { Icon } from "@/components/primitives/Icon";
import {
	mdiCameraOutline,
	mdiFullscreenExit,
	mdiFullscreen,
	mdiChevronUp,
	mdiPlus,
	mdiImageFilterCenterFocus,
	mdiMinus,
	mdiHome,
	mdiOpenInNew,
	mdiLoading,
	mdiCheck,
	mdiContentCopy,
	mdiImageFilterHdrOutline,
} from "@mdi/js";
import { useT } from "@/lib/i18n";

// --- Compass ---

function Compass({ panorama }: { panorama: google.maps.StreetViewPanorama }) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const update = () => {
			ref.current?.style.setProperty("--heading", `${(-panorama.getPov().heading).toFixed(2)}deg`);
		};
		const listener = panorama.addListener("pov_changed", update);
		update();
		return () => {
			google?.maps?.event?.removeListener(listener);
		};
	}, [panorama]);
	return (
		<div ref={ref} className="compass">
			<svg className="compass__arrow" viewBox="0 0 40 100">
				<path fill="#C1272D" d="M10 50l10-32 10 32z" />
				<path fill="#D1D1D1" d="M30 50L20 82 10 50z" />
			</svg>
		</div>
	);
}

const TAPE_DIRECTIONS: [number, string][] = [
	[0, "N"],
	[45, "NE"],
	[90, "E"],
	[135, "SE"],
	[180, "S"],
	[225, "SW"],
	[270, "W"],
	[315, "NW"],
];

const TAPE_DEG_WIDTH = 180;
const TAPE_PX_PER_DEG = 1.5;
const TAPE_WIDTH_PX = TAPE_DEG_WIDTH * TAPE_PX_PER_DEG;

export function CompassTape({ panorama }: { panorama: google.maps.StreetViewPanorama }) {
	const innerRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const update = () => {
			if (innerRef.current)
				innerRef.current.style.transform = `translateX(${(-panorama.getPov().heading * TAPE_PX_PER_DEG).toFixed(1)}px)`;
		};
		const listener = panorama.addListener("pov_changed", update);
		update();
		return () => {
			google?.maps?.event?.removeListener(listener);
		};
	}, [panorama]);

	const ticks: { deg: number; label?: string }[] = [];
	for (let d = 0; d < 360; d += 5) {
		const dir = TAPE_DIRECTIONS.find(([a]) => a === d);
		ticks.push({ deg: d, label: dir?.[1] });
	}

	return (
		<div className="compass-tape">
			<div className="compass-tape__center-mark" />
			<div className="compass-tape__strip" style={{ width: TAPE_WIDTH_PX }}>
				<div className="compass-tape__inner" ref={innerRef}>
					{[-360, 0, 360].map((offset) =>
						ticks.map((t) => {
							const deg = t.deg + offset;
							const isCardinal = t.label && t.label.length === 1;
							return (
								<div
									key={deg}
									className="compass-tape__tick"
									style={{ left: deg * TAPE_PX_PER_DEG }}
								>
									<div
										className={`compass-tape__mark${isCardinal ? " compass-tape__mark--cardinal" : t.label ? " compass-tape__mark--inter" : ""}`}
									/>
									{t.label && (
										<span
											className={`compass-tape__label${isCardinal ? " compass-tape__label--cardinal" : ""}`}
										>
											{t.label}
										</span>
									)}
								</div>
							);
						}),
					)}
				</div>
			</div>
		</div>
	);
}

// --- Crosshair overlay ---

export class CrosshairOverlay {
	#pano: google.maps.StreetViewPanorama;
	#canvas: HTMLCanvasElement;
	#listener: google.maps.MapsEventListener;
	#resizeObserver: ResizeObserver;
	#regionSelector = '.gm-style > div[role="region"]';

	constructor(pano: google.maps.StreetViewPanorama) {
		this.#pano = pano;
		this.#canvas = document.createElement("canvas");
		Object.assign(this.#canvas.style, {
			position: "absolute",
			top: "0",
			left: "0",
			pointerEvents: "none",
		});
		this.#resizeObserver = new ResizeObserver(() => this.#draw());
		this.#listener = pano.addListener("status_changed", () => {
			const el = this.#root()?.querySelector(".gm-style");
			if (el) this.#resizeObserver.observe(el);
			this.#mount();
		});
		this.#mount();
	}

	#root(): HTMLElement | null {
		return Object.values(this.#pano).find((e) => e instanceof HTMLElement) as HTMLElement | null;
	}

	#mount() {
		const root = this.#root();
		if (!root) return;
		const region = root.querySelector(this.#regionSelector);
		if (region && !root.contains(this.#canvas)) {
			region.insertAdjacentElement("afterend", this.#canvas);
		}
		this.#draw();
	}

	#draw() {
		const root = this.#root();
		const region = root?.querySelector(this.#regionSelector);
		if (!region) return;
		const { width, height } = region.getBoundingClientRect();
		this.#canvas.width = width;
		this.#canvas.height = height;
		const cx = Math.floor(width / 2);
		const cy = Math.floor(height / 2);
		const aspect = width / height;
		const ctx = this.#canvas.getContext("2d")!;

		ctx.strokeStyle = "#000";
		ctx.lineWidth = 1;
		ctx.setLineDash([5, 5]);
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(width, height);
		ctx.moveTo(width, 0);
		ctx.lineTo(0, height);
		ctx.stroke();

		ctx.strokeStyle = "#f33";
		ctx.lineWidth = 3;
		ctx.setLineDash([]);
		ctx.beginPath();
		ctx.moveTo(cx - 5 * aspect, cy - 5);
		ctx.lineTo(cx + 5 * aspect, cy + 5);
		ctx.moveTo(cx + 5 * aspect, cy - 5);
		ctx.lineTo(cx - 5 * aspect, cy + 5);
		ctx.stroke();
	}

	dispose() {
		this.#resizeObserver.disconnect();
		this.#listener.remove();
		this.#canvas.remove();
	}
}

// --- Shader car toggle ---

export function sendHideCar(hide: boolean) {
	// Single source of truth for rotation detection — works for the main app's
	// preview/hotkeys AND the LocalGuessr plugin (both share the singleton
	// panorama for Baidu/Google-inject providers), so callers never need to
	// compute or pass rotation state themselves.
	// Always send an explicit 0/1 (never omit) — the uniform is program-level
	// state on the GPU and does not reset itself between rounds/panos.
	const uniforms: { name: string; type: "float"; value: number[] }[] = [];
	if (hide) {
		const rotated = isBaiduRotatedCarPano(getPanorama()?.getPano() ?? null);
		uniforms.push({ name: "uBaiduCarRotate", type: "float", value: [rotated ? 1 : 0] });
	}
	window.postMessage({
		type: "update-material",
		shaderMessage: { defines: hide ? ["NO_CAR"] : [], uniforms },
	});
}

// --- Pano control subcomponents ---

export function CompassControl({ panorama }: { panorama: google.maps.StreetViewPanorama }) {
	const { t } = useT();
	const [links, setLinks] = useState<google.maps.StreetViewLink[]>([]);
	const controlRef = useRef<HTMLDivElement>(null);
	const animRef = useRef<{ stop: () => void; target: { heading: number; pitch: number } } | null>(
		null,
	);

	const animatePov = useCallback(
		(target: { heading: number; pitch: number }) => {
			animRef.current?.stop();
			const stop = tweenPov(panorama, target, () => {
				animRef.current = null;
			});
			animRef.current = { stop, target };
		},
		[panorama],
	);

	useEffect(() => {
		const linksListener = panorama.addListener("links_changed", () => {
			setLinks(
				(panorama.getLinks() ?? []).filter((l): l is google.maps.StreetViewLink => l != null),
			);
		});
		setLinks((panorama.getLinks() ?? []).filter((l): l is google.maps.StreetViewLink => l != null));
		return () => {
			google?.maps?.event?.removeListener(linksListener);
		};
	}, [panorama]);

	useEffect(() => {
		const update = () => {
			const h = panorama.getPov().heading;
			controlRef.current?.querySelectorAll<HTMLElement>(".compass-control__link").forEach((btn) => {
				btn.classList.toggle("is-active", Math.abs(h - Number(btn.dataset.heading ?? 0)) < 1);
			});
		};
		const povListener = panorama.addListener("pov_changed", update);
		update();
		return () => {
			google?.maps?.event?.removeListener(povListener);
		};
	}, [panorama, links]);

	const pointNorth = useCallback(
		(e?: React.MouseEvent) => {
			if (e?.ctrlKey && links.length > 0) {
				if (animRef.current || links.length === 0) return;
				const h = panorama.getPov().heading;
				const next = links.reduce((best, cur) => {
					const bestDelta = (best.heading! + 360 - h) % 360;
					const curDelta = (cur.heading! + 360 - h) % 360;
					if (bestDelta <= 0.01) return cur;
					if (curDelta <= 0.01) return best;
					return curDelta < bestDelta ? cur : best;
				});
				if (next?.pano) {
					panorama.setPano(next.pano);
					return;
				}
				if (next) animatePov({ heading: next.heading!, pitch: 0 });
				return;
			}
			const targetHeading = animRef.current?.target.heading ?? panorama.getPov().heading;
			if (targetHeading === 0) {
				animatePov({ heading: 0, pitch: -90 });
			} else {
				animatePov({ heading: 0, pitch: 0 });
			}
		},
		[panorama, links, animatePov],
	);

	const navigateToLink = useCallback(
		(linkHeading: number) => {
			animatePov({ heading: linkHeading, pitch: 0 });
		},
		[animatePov],
	);

	return (
		<div
			className="embed-controls__control"
			data-position="left-bottom"
			style={{ inset: "auto auto 248px 0px" }}
		>
			<div className="map-control map-control--transparent">
				<div className="compass-control" ref={controlRef}>
					<Tooltip content={t("editor.pointNorth")} side="right">
						<button
							className="compass-control__button"
							onClick={pointNorth}
							aria-label={t("editor.pointNorthLabel")}
						>
							<Compass panorama={panorama} />
						</button>
					</Tooltip>
					{links.map((link) => (
						<button
							key={link.pano}
							className="compass-control__link"
							data-heading={(link.heading ?? 0).toFixed(2)}
							style={{ "--heading": `${(link.heading ?? 0).toFixed(2)}deg` } as React.CSSProperties}
							onClick={() => navigateToLink(link.heading ?? 0)}
						>
							<Icon path={mdiChevronUp} />
						</button>
					))}
				</div>
			</div>
		</div>
	);
}

function ZoomControl({ panorama }: { panorama: google.maps.StreetViewPanorama }) {
	const { t } = useT();
	const [atMin, setAtMin] = useState(() => (panorama.getZoom() ?? 0) <= PANO_ZOOM.min);
	usePanoEvent(panorama, "zoom_changed", () => {
		setAtMin((panorama.getZoom() ?? 0) <= PANO_ZOOM.min);
	});

	const zoomIn = useCallback(() => {
		panorama.setZoom(zoomInStep(panorama.getZoom()));
	}, [panorama]);

	const zoomOut = useCallback(() => {
		panorama.setZoom(zoomOutStep(panorama.getZoom()));
	}, [panorama]);

	const resetZoom = useCallback(() => {
		panorama.setZoom(PANO_ZOOM.min);
	}, [panorama]);

	return (
		<div
			className="embed-controls__control"
			data-position="left-bottom"
			style={{ inset: "auto auto 112px 0px" }}
		>
			<div className="map-control map-control--button">
				<Tooltip content={t("common.zoomIn")} side="right">
					<button onClick={zoomIn} aria-label={t("common.zoomIn")}>
						<Icon path={mdiPlus} />
					</button>
				</Tooltip>
				<Tooltip content={t("editor.resetZoom")} side="right">
					<button disabled={atMin} onClick={resetZoom} aria-label={t("editor.resetZoom")}>
						<Icon path={mdiImageFilterCenterFocus} />
					</button>
				</Tooltip>
				<Tooltip content={t("common.zoomOut")} side="right">
					<button disabled={atMin} onClick={zoomOut} aria-label={t("common.zoomOut")}>
						<Icon path={mdiMinus} />
					</button>
				</Tooltip>
			</div>
		</div>
	);
}

function ReturnToSpawnControl({
	panorama,
	onReturnToSpawn,
}: {
	panorama: google.maps.StreetViewPanorama;
	onReturnToSpawn: () => void;
}) {
	const { t } = useT();
	const location = useMapState((s) => s.activeLocation);
	const [hasChanged, setHasChanged] = useState(false);
	const checkChanged = useCallback(() => {
		if (!location) return;
		const pov = panorama.getPov();
		setHasChanged(
			pov.heading !== location.heading ||
			pov.pitch !== location.pitch ||
			panorama.getZoom() !== displayZoom(location.zoom),
		);
	}, [panorama, location]);
	usePanoEvent(panorama, "pov_changed", checkChanged, [location]);
	usePanoEvent(panorama, "zoom_changed", checkChanged, [location]);

	return (
		<div
			className="embed-controls__control"
			data-position="left-bottom"
			style={{ inset: "auto auto 56px 0px" }}
		>
			<div className="map-control map-control--button">
				<Tooltip content={t("editor.returnToSpawn")} side="right">
					<button disabled={!hasChanged} onClick={onReturnToSpawn} aria-label={t("editor.returnToSpawn")}>
						<Icon path={mdiHome} />
					</button>
				</Tooltip>
			</div>
		</div>
	);
}

function CoordinateControl({ panorama }: { panorama: google.maps.StreetViewPanorama }) {
	const { t } = useT();
	const textRef = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		const update = () => {
			const zoom = (panorama.getZoom() ?? 0).toFixed(2);
			let altitude = getPanoAltitude();
			if (altitude == null) {
				const alt = getMapState().activeLocation?.extra?.altitude;
				if (typeof alt === "number" && Number.isFinite(alt)) altitude = alt;
			}
			if (textRef.current) {
				// null = unknown → hide; 0 is a valid sea-level reading and must show.
				textRef.current.textContent =
					altitude == null
						? ` ${t("editor.zoomReadout", { zoom })}`
						: ` ${t("editor.altitudeZoom", { altitude: altitude.toFixed(2), zoom })}`;
			}
		};
		const zoomListener = panorama.addListener("zoom_changed", update);
		const posListener = panorama.addListener("position_changed", update);
		const panoListener = panorama.addListener("pano_changed", update);
		const unsubAltitude = subscribePanoAltitude(update);
		update();
		return () => {
			google?.maps?.event?.removeListener(zoomListener);
			google?.maps?.event?.removeListener(posListener);
			google?.maps?.event?.removeListener(panoListener);
			unsubAltitude();
		};
	}, [panorama]);

	return (
		<div
			className="embed-controls__control"
			data-position="bottom-left"
			style={{ inset: "auto auto 0px 96px" }}
		>
			<div className="map-control coordinate-control is-dark">
				<Icon path={mdiImageFilterHdrOutline} size={10} />
				<span ref={textRef} />
			</div>
		</div>
	);
}

// --- PanoControls ---

function PanoMetadataControl() {
	const { t } = useT();
	const location = useMapState((s) => s.activeLocation);
	if (!location) return null;
	return (
		<div
			className="embed-controls__control"
			data-position="top-left"
			style={{ inset: "0px auto auto 0px" }}
		>
			<div
				className="map-control coordinate-control is-dark"
				style={{ fontSize: "10px", display: "flex", flexDirection: "column", gap: "2px" }}
			>
				<span>
					{hasLoadAsPanoId(location) ? t("editor.pinnedPanoYes") : t("editor.pinnedPanoNo")}
				</span>
				{location.extra &&
					Object.entries(location.extra).map(([key, val]) => (
						<span key={key}>
							{key}: {val == null ? "null" : String(val)}
						</span>
					))}
			</div>
		</div>
	);
}

export const PanoControls = memo(function PanoControls({
	panorama,
	isFullscreen,
	onFullscreen,
	onReturnToSpawn,
	altProvider = false,
}: {
	panorama: google.maps.StreetViewPanorama;
	isFullscreen: boolean;
	onFullscreen: () => void;
	onReturnToSpawn: () => void;
	/** True when an alt pano provider (e.g. Look Around) owns the viewport. */
	altProvider?: boolean;
}) {
	const { t } = useT();
	const vis = useSettings();
	const fullscreenKey = useBinding("toggleFullscreen");
	const jumpForwardKey = useBinding("jumpForward");
	const jumpBackwardKey = useBinding("jumpBackward");
	const [copyState, setCopyState] = useState<"idle" | "loading" | "done">("idle");
	const [screenshotState, setScreenshotState] = useState<"idle" | "loading" | "done">("idle");

	// Built from the LIVE pano, not the saved location: the link shares what you're looking at.
	const location = useMapState((s) => s.activeLocation);
	const provider = getLocationProvider(location);
	const panoId = panorama.getPano();
	const isAppleLocation = provider === "apple";
	const isBaiduLocation = provider === "baidu" || isBaiduPanoId(panoId);
	const isTencentLocation = provider === "tencent" || isTencentPanoId(panoId);
	const isYandexLocation = provider === "yandex" || isYandexPanoId(panoId);

	const buildMapsUrl = useCallback(() => {
		const pos = panorama.getPosition();
		const pov = panorama.getPov();
		if (!pos || !pov) return null;

		if (isAppleLocation) {
			const lat = pos.lat();
			const lng = pos.lng();
			return new URL(buildLookmapOpenUrl(lat, lng, pov.heading, pov.pitch));
		}

		if (isBaiduLocation) {
			const loc = panorama.getLocation();
			const sid = stripBaidu(loc?.pano ?? "");
			if (!sid) return null;
			return new URL(buildBaiduShareUrl(sid, pov.heading, pov.pitch));
		}

		if (isTencentLocation) {
			const loc = panorama.getLocation();
			const svid = stripTencent(loc?.pano ?? "");
			if (!svid) return null;
			return new URL(buildTencentShareUrl(svid, pov.heading, pov.pitch));
		}

		if (isYandexLocation) {
			const loc = panorama.getLocation();
			const oid = stripYandex(loc?.pano ?? "");
			if (!oid) return null;
			return new URL(buildYandexShareUrl(oid, pos.lat(), pos.lng(), pov.heading));
		}

		const loc = panorama.getLocation();
		if (!loc) return null;
		return mapsPanoUrl({
			lat: pos.lat(),
			lng: pos.lng(),
			heading: pov.heading,
			pitch: pov.pitch,
			fov: fovForZoom(panorama.getZoom()),
			panoId: loc.pano ?? "",
		});
	}, [panorama, isAppleLocation, isBaiduLocation, isTencentLocation, isYandexLocation]);

	const buildAppleShareUrl = useCallback(() => {
		const pos = panorama.getPosition();
		const pov = panorama.getPov();
		if (!pos || !pov) return null;
		const { yaw, pitch } = googlePovToLookmapRadians(pov.heading, pov.pitch);
		return buildLookmapShareUrl(pos.lat(), pos.lng(), yaw, pitch);
	}, [panorama]);

	const buildBaiduCopyUrl = useCallback(() => {
		const loc = panorama.getLocation();
		const pov = panorama.getPov();
		const sid = stripBaidu(loc?.pano ?? "");
		if (!sid || !pov) return null;
		return buildBaiduShareUrl(sid, pov.heading, pov.pitch);
	}, [panorama]);

	const buildTencentCopyUrl = useCallback(() => {
		const loc = panorama.getLocation();
		const pov = panorama.getPov();
		const svid = stripTencent(loc?.pano ?? "");
		if (!svid || !pov) return null;
		return buildTencentShareUrl(svid, pov.heading, pov.pitch);
	}, [panorama]);

	const buildYandexCopyUrl = useCallback(() => {
		const loc = panorama.getLocation();
		const pos = panorama.getPosition();
		const pov = panorama.getPov();
		const oid = stripYandex(loc?.pano ?? "");
		if (!oid || !pos || !pov) return null;
		return buildYandexShareUrl(oid, pos.lat(), pos.lng(), pov.heading);
	}, [panorama]);

	const openInMaps = useCallback(() => {
		const url = buildMapsUrl();
		if (url) open(url.toString());
	}, [buildMapsUrl]);

	// `long` skips the shortenMapsUrl redirect lookup and copies the raw long URL;
	// `noTags` omits the tag/loadMode params.
	const doCopy = useCallback(
		async ({ long, noTags }: { long: boolean; noTags: boolean }) => {
			if (isAppleLocation) {
				const link = buildAppleShareUrl();
				if (!link) return;
				await navigator.clipboard.writeText(link).catch(() => {});
				setCopyState("done");
				setTimeout(() => setCopyState("idle"), 500);
				return;
			}

			if (isBaiduLocation) {
				const link = buildBaiduCopyUrl();
				if (!link) return;
				if (long) {
					await navigator.clipboard.writeText(link).catch(() => {});
					setCopyState("done");
					setTimeout(() => setCopyState("idle"), 500);
					return;
				}
				setCopyState("loading");
				try {
					const short = await shortenBaiduShareUrl(link);
					await navigator.clipboard.writeText(short);
				} catch {
					await navigator.clipboard.writeText(link).catch(() => {});
				}
				setCopyState("done");
				setTimeout(() => setCopyState("idle"), 500);
				return;
			}

			if (isTencentLocation) {
				const link = buildTencentCopyUrl();
				if (!link) return;
				await navigator.clipboard.writeText(link).catch(() => {});
				setCopyState("done");
				setTimeout(() => setCopyState("idle"), 500);
				return;
			}

			if (isYandexLocation) {
				const link = buildYandexCopyUrl();
				if (!link) return;
				await navigator.clipboard.writeText(link).catch(() => {});
				setCopyState("done");
				setTimeout(() => setCopyState("idle"), 500);
				return;
			}

			const url = buildMapsUrl();
			if (!url) return;
			const active = getMapState().activeLocation;
			if (!noTags && active) appendLinkTags(url, active, getMapState().tags);
			const longStr = url.toString();
			if (long) {
				await navigator.clipboard.writeText(longStr).catch(() => {});
				setCopyState("done");
				setTimeout(() => setCopyState("idle"), 500);
				return;
			}
			setCopyState("loading");
			try {
				const short = await shortenMapsUrl(longStr);
				await navigator.clipboard.writeText(short);
			} catch {
				await navigator.clipboard.writeText(longStr).catch(() => {});
			}
			setCopyState("done");
			setTimeout(() => setCopyState("idle"), 500);
		},
		[
			buildMapsUrl,
			buildAppleShareUrl,
			buildBaiduCopyUrl,
			buildTencentCopyUrl,
			buildYandexCopyUrl,
			isAppleLocation,
			isBaiduLocation,
			isTencentLocation,
			isYandexLocation,
		],
	);

	const jumpForwardRef = useHotkeyRef(jumpForwardKey);
	const jumpBackwardRef = useHotkeyRef(jumpBackwardKey);
	const jumpPending = useRef<Promise<void> | null>(null);

	const jump = useCallback(
		async (headingOffset: number) => {
			await jumpPending.current;
			const pos = panorama.getPosition();
			if (!pos) return;
			const lat = typeof pos.lat === "function" ? pos.lat() : Number.NaN;
			const lng = typeof pos.lng === "function" ? pos.lng() : Number.NaN;
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

			const heading = (panorama.getPov().heading + headingOffset + 360) % 360;
			let targetLit: { lat: number; lng: number };
			if (google?.maps?.geometry?.spherical?.computeOffset) {
				const origin = new google.maps.LatLng(lat, lng);
				const target = google.maps.geometry.spherical.computeOffset(
					origin,
					SV_JUMP_RADIUS,
					heading,
				);
				targetLit = { lat: target.lat(), lng: target.lng() };
			} else {
				// opensv does not always ship the geometry library — fall back to
				// a local spherical offset so alt-provider jumps still work.
				const R = 6371000;
				const δ = SV_JUMP_RADIUS / R;
				const θ = (heading * Math.PI) / 180;
				const φ1 = (lat * Math.PI) / 180;
				const λ1 = (lng * Math.PI) / 180;
				const φ2 = Math.asin(
					Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
				);
				const λ2 =
					λ1 +
					Math.atan2(
						Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
						Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
					);
				targetLit = {
					lat: (φ2 * 180) / Math.PI,
					lng: ((((λ2 * 180) / Math.PI + 540) % 360) - 180),
				};
			}

			try {
				// Look Around proxy / inject providers: setPosition → SIS → provider meta.
				const panoId = panorama.getPano();
				if (
					altProvider ||
					isBaiduPanoId(panoId) ||
					isTencentPanoId(panoId) ||
					isYandexPanoId(panoId) ||
					isBaiduLocation ||
					isTencentLocation ||
					isYandexLocation
				) {
					panorama.setPosition(targetLit);
					return;
				}
				const loc = await lookupStreetView(targetLit.lat, targetLit.lng, 0, {
					onlyOfficial: true,
					radius: SV_JUMP_RADIUS,
				});
				if (!loc?.panoId) return;
				if (loc.flags & LocationFlag.LoadAsPanoId) {
					panorama.setPano(loc.panoId);
				} else {
					panorama.setPosition({ lat: loc.lat, lng: loc.lng });
				}
			} catch {
				// no coverage found
			} finally {
				jumpPending.current = null;
			}
		},
		[panorama, altProvider, isBaiduLocation, isTencentLocation, isYandexLocation],
	);

	const jumpForward = useCallback(() => {
		jumpPending.current = jump(0);
	}, [jump]);

	const jumpBackward = useCallback(() => {
		jumpPending.current = jump(180);
	}, [jump]);

	const takeScreenshot = useCallback(
		async (download: boolean) => {
			setScreenshotState("loading");
			const panoId = panorama.getPano();
			const view = snapshotPanoView(panorama);
			try {
				let blob: Blob | string = "";
				if (isYandexPanoId(panoId) || isYandexLocation || isAppleLocation) {
					const el = document.querySelector(".psv-canvas");
					if (el instanceof HTMLCanvasElement) {
						blob = el.toDataURL("image/jpeg", 1.0);
					}
				} else {
					blob = await canvasToBlob(await renderPanoView(view, 1920, 1080));
				}
				const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
				const asBlob =
					typeof blob === "string"
						? await (await fetch(blob)).blob()
						: blob;
				const copied = download || !(asBlob instanceof Blob) ? false : await copyImageToClipboard(asBlob);
				if (copied) {
					toast(t("Screenshot copied"));
				} else {
					downloadBlob(blob, `${view.panoId}_${stamp}.png`);
					toast(
						download
							? t("Screenshot downloaded")
							: t("Clipboard unavailable, downloaded instead"),
					);
				}
				setScreenshotState("done");
				setTimeout(() => setScreenshotState("idle"), 500);
			} catch (error) {
				log.warn("[pano-screenshot] capture failed", error);
				setScreenshotState("idle");
				toast(t("Screenshot failed"));
			}
		},
		[panorama, isYandexLocation, isAppleLocation, t],
	);

	return (
		<div className="embed-controls pano-embed-controls">
			{(vis.showScreenshotButton || vis.showFullscreenButton) && (
				<div
					className="embed-controls__control"
					data-position="top-right"
					style={{ inset: "0px 0px auto auto", display: "flex" }}
				>
					{vis.showScreenshotButton && (
						<div className="map-control map-control--button">
							<Tooltip content={t("Copy screenshot (Shift: download)")} side="bottom" align="end">
								<button
									onClick={(e) => takeScreenshot(e.shiftKey)}
									disabled={screenshotState !== "idle"}
									aria-label={t("Copy screenshot to clipboard")}
									data-qa="pano-screenshot"
								>
									{screenshotState === "loading" ? (
										<Icon path={mdiLoading} className="spin" />
									) : screenshotState === "done" ? (
										<Icon path={mdiCheck} />
									) : (
										<Icon path={mdiCameraOutline} />
									)}
								</button>
							</Tooltip>
						</div>
					)}
					{vis.showFullscreenButton && (
						<div className="map-control map-control--button">
							<Tooltip
								content={t("editor.toggleFullscreen", { key: fullscreenKey.toUpperCase() })}
								side="bottom"
								align="end"
							>
								<button
									onClick={onFullscreen}
									aria-label={t("editor.toggleFullscreen", { key: fullscreenKey.toUpperCase() })}
								>
									{isFullscreen ? <Icon path={mdiFullscreenExit} /> : <Icon path={mdiFullscreen} />}
								</button>
							</Tooltip>
						</div>
					)}
				</div>
			)}

			{vis.showJumpButtons && (
				<div
					className="embed-controls__control"
					data-position="right-top"
					style={{ inset: "56px 0px auto auto" }}
				>
					<div className="map-control map-control--button">
						<Tooltip content={t("editor.jumpForward", { key: jumpForwardKey })} side="left">
							<button
								ref={jumpForwardRef}
								disabled={vis.defaultMovementMode !== "moving"}
								onClick={jumpForward}
								aria-label={t("editor.jumpForward", { key: jumpForwardKey })}
							>
								100m
							</button>
						</Tooltip>
						<Tooltip content={t("editor.jumpBackward", { key: jumpBackwardKey })} side="left">
							<button
								ref={jumpBackwardRef}
								disabled={vis.defaultMovementMode !== "moving"}
								onClick={jumpBackward}
								aria-label={t("editor.jumpBackward", { key: jumpBackwardKey })}
							>
								-100m
							</button>
						</Tooltip>
					</div>
				</div>
			)}

			{vis.showCompass && <CompassControl panorama={panorama} />}

			{vis.showCompassTape && <CompassTape panorama={panorama} />}

			{vis.showZoom && <ZoomControl panorama={panorama} />}

			{vis.showReturnToSpawn && (
				<ReturnToSpawnControl panorama={panorama} onReturnToSpawn={onReturnToSpawn} />
			)}

			<div
				className="embed-controls__control"
				data-position="bottom-left"
				style={{ inset: "auto auto 0px 0px" }}
			>
				{vis.showMapLinks && (
					<div className="map-control map-control--button map-links-control">
						<Tooltip content={t("editor.openInMaps")} side="top" align="start">
							<button onClick={openInMaps} aria-label={t("editor.openInMaps")}>
								<Icon path={mdiOpenInNew} />
							</button>
						</Tooltip>
						<Tooltip content={t("editor.copyLinkHint")} side="right">
							<button
								onClick={(e) => doCopy({ long: e.altKey, noTags: e.shiftKey })}
								aria-label={t("editor.copyLink")}
							>
								{copyState === "loading" ? (
									<Icon path={mdiLoading} className="spin" />
								) : copyState === "done" ? (
									<Icon path={mdiCheck} />
								) : (
									<Icon path={mdiContentCopy} />
								)}
							</button>
						</Tooltip>
					</div>
				)}
			</div>

			{vis.showCoordinateDisplay && <CoordinateControl panorama={panorama} />}

			{vis.showPanoMetadata && <PanoMetadataControl />}
		</div>
	);
});
