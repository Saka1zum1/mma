import { useEffect, useState } from "react";
import { cmd } from "@/lib/commands";
import { engineRows, type EngineRows } from "@/lib/engineActivity";
import { useAsync } from "@/lib/hooks/useAsync";
import { useDomEvent } from "@/lib/hooks/useDomEvent";
import { google } from "@/lib/sv/opensv";
import { fmt, formatBytes, localeFormat } from "@/lib/util/format";
import { getMapState } from "@/store/useMapStore";
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
import { t } from "@/lib/i18n";

declare const __APP_VERSION__: string;

interface Stats {
	appVersion: string;
	buildMode: string;
	maps: number;
	locations: number;
	locationBytes: string;
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
	const dbSize = formatBytes(bytes);

	const perfMem = (
		performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }
	).memory;
	const mem = perfMem
		? `${formatBytes(perfMem.usedJSHeapSize)} / ${formatBytes(perfMem.jsHeapSizeLimit)}`
		: "N/A";

	const secs = Math.floor(performance.now() / 1000);
	const uptime = uptimeFmt.format({
		hours: Math.floor(secs / 3600),
		minutes: Math.floor(secs / 60) % 60,
		seconds: secs % 60,
	});

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
		locationBytes: formatBytes(dbStats.locationSizeBytes),
		tags: dbStats.tags,
		commits: dbStats.commits,
		pendingSaves: getMapState().map ? (await cmd.storeGetSummary()).dirtyCount : 0,
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

const uptimeFmt = localeFormat<Partial<Record<Intl.DurationFormatUnit, number>>>(
	(l) => new Intl.DurationFormat(l, { style: "narrow" }),
);
const fmtInt = (n: number) => fmt.format(Math.round(n));

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
				`${formatBytes(deck.gpuMemory)} (buf ${formatBytes(deck.bufferMemory)}, tex ${formatBytes(deck.textureMemory)})`,
			],
		);
	}
	return rows;
}

export function StatsForNerds({ onClose }: { onClose: () => void }) {
	const [live, setLive] = useState<LiveStats | null>(null);
	const [engine, setEngine] = useState<EngineRows>(() => engineRows(null));
	const { data: stats, error } = useAsync(gatherStats, []);

	useEffect(() => {
		startFrameMeter();
		const tick = () => {
			setLive({ frame: frameStats(), deck: getDeckMetrics(), scene: computeRenderStats() });
			void cmd.procedureActivity().then(
				(a) => setEngine(engineRows(a)),
				() => setEngine(engineRows(null)),
			);
		};
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
						{t("Stats for Nerds")}
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
				{error && <div style={{ color: "var(--destructive)" }}>{String(error)}</div>}
				{stats && (
					<table style={{ width: "100%", borderCollapse: "collapse" }}>
						<tbody>
							{[
								["Version", stats.appVersion],
								["Build", stats.buildMode],
								["Maps", stats.maps],
								["Locations (saved)", fmt.format(stats.locations)],
								["Location data", stats.locationBytes],
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
					{t("Engine")}
				</div>
				<EngineSection engine={engine} />
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
							{t("Rendering (live)")}
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

function EngineSection({ engine }: { engine: EngineRows }) {
	const { providers, queries, requestsPerSecond, idle } = engine;
	if (idle) return <p className="text-muted" style={{ margin: "0 0 8px" }}>{t("Engine idle")}</p>;
	return (
		<div style={{ marginBottom: 8 }}>
			{providers.map((p) => {
				const pct = Math.round(p.fraction * 100);
				return (
					<div key={p.key} style={{ marginBottom: 8 }}>
						<div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
							<span>{t(p.label)}</span>
							<span className="mono">
								{fmt.format(p.done)} / {fmt.format(p.total)}
								{p.failed > 0 &&
									t({ one: ", {n} failed", other: ", {n} failed" }, { n: p.failed })}
								{p.skipped > 0 &&
									t({ one: ", {n} skipped", other: ", {n} skipped" }, { n: p.skipped })}
							</span>
						</div>
						<div className="coverage-bar__track" style={{ width: "100%", margin: "4px 0" }}>
							<div className="coverage-bar__fill" style={{ width: `${pct}%` }} />
						</div>
						<div className="text-muted mono" style={{ fontSize: 12 }}>
							{t(
								"{inflight} / {limit} in flight, {waiting} rate-waiting, {retries} retries, {instances} instances",
								{
									inflight: p.inflight,
									limit: p.inflightLimit,
									waiting: p.rateWaiting,
									retries: p.retries,
									instances: p.instances,
								},
							)}
						</div>
					</div>
				);
			})}
			{queries.map((q) => (
				<div
					key={q.entry}
					style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}
				>
					<span>{q.entry}</span>
					<span className="mono">
						{q.inflight} / {q.inflightLimit}
						{q.retries > 0 &&
							t({ one: ", {n} retry", other: ", {n} retries" }, { n: q.retries })}
					</span>
				</div>
			))}
			<div className="text-muted mono" style={{ fontSize: 12 }}>
				{t("{rate} requests/s", { rate: requestsPerSecond.toFixed(1) })}
			</div>
		</div>
	);
}
