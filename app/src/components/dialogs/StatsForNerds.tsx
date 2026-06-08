import { useEffect, useState } from "react";
import { cmd } from "@/lib/commands";
import { google } from "@/lib/sv/opensv";
import { getDirtyCount, getCurrentMap } from "@/store/useMapStore";

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

export function StatsForNerds({ onClose }: { onClose: () => void }) {
	const [stats, setStats] = useState<Stats | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		gatherStats()
			.then(setStats)
			.catch((e) => setError(String(e)));
	}, []);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [onClose]);

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
					background: "#1a1a1a",
					color: "#e0e0e0",
					borderRadius: 8,
					padding: "20px 28px",
					minWidth: 420,
					maxWidth: 600,
					fontFamily: "monospace",
					fontSize: 13,
					lineHeight: 1.7,
					border: "1px solid #333",
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
					<span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Stats for Nerds</span>
					<button
						onClick={onClose}
						style={{
							background: "none",
							border: "none",
							color: "#888",
							cursor: "pointer",
							fontSize: 18,
							padding: "0 4px",
						}}
					>
						x
					</button>
				</div>
				{error && <div style={{ color: "#f44" }}>{error}</div>}
				{stats && (
					<table style={{ width: "100%", borderCollapse: "collapse" }}>
						<tbody>
							{(
								[
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
								] as [string, string | number][]
							).map(([label, value]) => (
								<tr key={label}>
									<td
										style={{
											color: "#888",
											paddingRight: 16,
											whiteSpace: "nowrap",
											verticalAlign: "top",
										}}
									>
										{label}
									</td>
									<td style={{ wordBreak: "break-all" }}>{value}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}
