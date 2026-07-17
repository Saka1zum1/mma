import { useEffect, useState } from "react";
import { cmd } from "@/lib/commands";
import { useDomEvent } from "@/lib/hooks/useDomEvent";
import { google } from "@/lib/sv/opensv";
import { getDirtyCount, getCurrentMap } from "@/store/useMapStore";
import {
	startFrameMeter,
	stopFrameMeter,
	frameStats,
	type FrameStats,
} from "@/lib/render/frameMeter";
import {
	computeRenderStats,
	getDeckMetrics,
	type DeckMetrics,
	type RenderStats,
} from "@/lib/render/renderStats";

declare const __APP_VERSION__: string;

interface Stats {
	appVersion: string;
	buildMode: string;
	maps: number;
	locations: number;
	tags: number;
	commits: number;
	pendingSaves: number;
	dbSize: string;
	journalMode: string;
	foreignKeys: string;
	opensvVersion: string;
	webglRenderer: string;
	userAgent: string;
	viewport: string;
	devicePixelRatio: number;
	memory: string;
	startup: string;
	uptime: string;
	panoSingleton: boolean;
}

async function gatherStats(): Promise<Stats> {
	const dbStats = await cmd.storeDbStats();
	const startupMs = await cmd.appReady();

	const bytes = dbStats.dbSizeBytes;
	const dbSize =
		bytes < 1024 * 1024
			? `${(bytes / 1024).toFixed(1)} KB`
			: bytes < 1024 * 1024 * 1024
				? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
				: `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;

	const perfMem = (
		performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }
	).memory;
	const mem = perfMem
		? `${(perfMem.usedJSHeapSize / (1024 * 1024)).toFixed(1)} / ${(perfMem.jsHeapSizeLimit / (1024 * 1024)).toFixed(0)} MB`
		: "N/A";

	const secs = Math.floor(performance.now() / 1000);
	const mins = Math.floor(secs / 60);
	const hrs = Math.floor(mins / 60);
	const uptime =
		hrs > 0
			? `${hrs}h ${mins % 60}m ${secs % 60}s`
			: mins > 0
				? `${mins}m ${secs % 60}s`
				: `${secs}s`;

	let webglRenderer = "unknown";
	try {
		const canvas = document.createElement("canvas");
		const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
		if (gl) {
			const ext = gl.getExtension("WEBGL_debug_renderer_info");
			webglRenderer = ext
				? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
				: gl.getParameter(gl.RENDERER);
		}
	} catch {
		// ignored
	}

	return {
		appVersion: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev",
		buildMode: import.meta.env.MODE,
		maps: dbStats.maps,
		locations: dbStats.locations,
		tags: dbStats.tags,
		commits: dbStats.commits,
		pendingSaves: getCurrentMap() ? await getDirtyCount() : 0,
		dbSize,
		journalMode: dbStats.journalMode,
		foreignKeys: dbStats.foreignKeys ? "ON" : "OFF",
		opensvVersion: google?.maps?.version ?? "not loaded",
		webglRenderer,
		userAgent: navigator.userAgent,
		viewport: `${window.innerWidth}x${window.innerHeight}`,
		devicePixelRatio: window.devicePixelRatio,
		memory: mem,
		startup: `${startupMs} ms`,
		uptime,
		panoSingleton: !!google?.maps?.StreetViewPanorama,
	};
}

interface LiveStats {
	frame: FrameStats;
	deck: DeckMetrics | null;
	scene: RenderStats | null;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString();
const fmtMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function liveRows(live: LiveStats): [string, string][] {
	const { frame, deck, scene } = live;
	const rows: [string, string][] = [
		["FPS", `${frame.fps} (p95 ${frame.p95.toFixed(1)} ms, worst ${frame.worst.toFixed(0)} ms)`],
		["Long tasks", `${frame.longTasks} (${fmtInt(frame.longTaskMs)} ms)`],
	];
	if (scene) {
		rows.push(
			["Markers", `${fmtInt(scene.totalMarkers)} (${fmtInt(scene.onScreenMarkers)} on screen)`],
			["Selection overlay", fmtInt(scene.selOverlay)],
			["Layers", String(scene.layers)],
			[
				"Marker quad",
				`${scene.quadSidePx.toFixed(1)}px ${scene.markerStyle} x${scene.markerSize} @ ${scene.dpr}dpr`,
			],
			["Est fragments", `${(scene.estFragments / 1e6).toFixed(1)}M / frame`],
			["Overdraw", `${scene.overdraw.toFixed(2)}x viewport`],
		);
	} else {
		rows.push(["Markers", "no map open"]);
	}
	if (deck) {
		rows.push(
			["Deck layers drawn", `${deck.drawLayersCount} of ${deck.layersCount}`],
			["CPU / frame", `${deck.cpuTimePerFrame.toFixed(2)} ms`],
			["GPU / frame", deck.gpuTimePerFrame > 0 ? `${deck.gpuTimePerFrame.toFixed(2)} ms` : "n/a"],
			[
				"GPU memory",
				`${fmtMB(deck.gpuMemory)} (buf ${fmtMB(deck.bufferMemory)}, tex ${fmtMB(deck.textureMemory)})`,
			],
		);
	}
	return rows;
}

export function StatsForNerds({ onClose }: { onClose: () => void }) {
	const [stats, setStats] = useState<Stats | null>(null);
	const [live, setLive] = useState<LiveStats | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		gatherStats()
			.then(setStats)
			.catch((e) => setError(String(e)));
	}, []);

	useEffect(() => {
		startFrameMeter();
		const tick = () =>
			setLive({ frame: frameStats(), deck: getDeckMetrics(), scene: computeRenderStats() });
		const iv = setInterval(tick, 1000);
		tick();
		return () => {
			clearInterval(iv);
			stopFrameMeter();
		};
	}, []);

	useDomEvent("keydown", (e) => {
		if ((e as KeyboardEvent).key === "Escape") onClose();
	});

	if (!stats && !error) return null;

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 9999,
				background: "rgba(0,0,0,0.6)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				style={{
					background: "var(--surface-2)",
					color: "var(--text-1)",
					borderRadius: 8,
					padding: "20px 28px",
					minWidth: 420,
					maxWidth: 600,
					fontSize: 13,
					lineHeight: 1.7,
					border: "1px solid var(--border-subtle)",
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginBottom: 16,
					}}
				>
					<span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>
						Stats for Nerds
					</span>
					<button
						onClick={onClose}
						style={{
							background: "none",
							border: "none",
							color: "var(--text-2)",
							cursor: "pointer",
							fontSize: 18,
							padding: "0 4px",
						}}
					>
						x
					</button>
				</div>
				{error && <div style={{ color: "var(--destructive)" }}>{error}</div>}
				{stats && (
					<table style={{ width: "100%", borderCollapse: "collapse" }}>
						<tbody>
							{[
								["Version", stats.appVersion],
								["Build", stats.buildMode],
								["Maps", stats.maps],
								["Locations", stats.locations.toLocaleString()],
								["Tags", stats.tags],
								["Commits", stats.commits],
								["Pending saves", stats.pendingSaves],
								["DB size", stats.dbSize],
								["Journal mode", stats.journalMode],
								["Foreign keys", stats.foreignKeys],
								["opensv", stats.opensvVersion],
								["WebGL", stats.webglRenderer],
								["DPR", stats.devicePixelRatio],
								["Viewport", stats.viewport],
								["JS heap", stats.memory],
								["Startup", stats.startup],
								["Uptime", stats.uptime],
								["User agent", stats.userAgent],
							].map(([label, value]) => (
								<tr key={label}>
									<td
										className="text-muted"
										style={{
											paddingRight: 16,
											whiteSpace: "nowrap",
											verticalAlign: "top",
										}}
									>
										{label}
									</td>
									<td className="mono" style={{ wordBreak: "break-all" }}>
										{value}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
				{live && (
					<>
						<div
							style={{
								fontSize: 12,
								fontWeight: 600,
								color: "var(--text-2)",
								margin: "12px 0 4px",
								textTransform: "uppercase",
								letterSpacing: "0.05em",
							}}
						>
							Rendering (live)
						</div>
						<table style={{ width: "100%", borderCollapse: "collapse" }}>
							<tbody>
								{liveRows(live).map(([label, value]) => (
									<tr key={label}>
										<td
											className="text-muted"
											style={{
												paddingRight: 16,
												whiteSpace: "nowrap",
												verticalAlign: "top",
											}}
										>
											{label}
										</td>
										<td className="mono" style={{ wordBreak: "break-all" }}>
											{value}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</>
				)}
			</div>
		</div>
	);
}
