import { useState, useRef, useCallback, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { cmd } from "@/lib/commands";
import type { ValiLocation } from "@/bindings.gen";
import { createLocation, LocationFlag } from "@/types";
import { createTags } from "@/store/useMapStore";
import { Sidebar } from "@/components/primitives/Sidebar";
import { createPluginStorage } from "@/plugins/registry";
import "./vali.css";

type Phase = "editing" | "generating" | "done" | "error";

interface LogLine {
	text: string;
	isError: boolean;
}

type ValiProgress =
	| { kind: "workItems"; total: number }
	| {
			kind: "workItemDone";
			countryCode: string;
			subdivisionCode: string | null;
			done: number;
			total: number;
	  }
	| {
			kind: "countryDownloadStarted";
			countryCode: string;
			files: number;
			bytes: number;
			updates: boolean;
	  }
	| { kind: "fileDownloaded"; countryCode: string; name: string; bytes: number };

interface Bar {
	label: string;
	done: number;
	total: number;
	bytes: boolean;
}

const VALIG_URL = "https://valig.vercel.app";
const valiStore = createPluginStorage("vali");

function formatBytes(n: number): string {
	return n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} kB`;
}

let sessionPhase: Phase = "editing";
let sessionLines: LogLine[] = [];

export function ValiSidebar({ onClose }: { onClose: () => void }) {
	const [phase, setPhase] = useState<Phase>(sessionPhase);
	const [lines, setLines] = useState<LogLine[]>(sessionLines);
	const [bar, setBar] = useState<Bar | null>(null);
	const [error, setError] = useState("");
	const [importCount, setImportCount] = useState(0);
	const [tagName, setTagName] = useState(() => valiStore.get<string>("tagName", ""));
	const logRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		sessionPhase = phase;
	}, [phase]);
	useEffect(() => {
		sessionLines = lines;
	}, [lines]);

	// Auto-scroll log to bottom
	useEffect(() => {
		if (logRef.current) {
			logRef.current.scrollTop = logRef.current.scrollHeight;
		}
	}, [lines, bar]);

	const appendLine = useCallback((text: string, isError = false) => {
		setLines((prev) => [...prev, { text, isError }]);
	}, []);

	const onProgress = useCallback(
		(p: ValiProgress) => {
			switch (p.kind) {
				case "workItems":
					setBar({ label: "Generating", done: 0, total: p.total, bytes: false });
					break;
				case "workItemDone":
					setBar({
						label: `Generating (${p.subdivisionCode ?? p.countryCode})`,
						done: p.done,
						total: p.total,
						bytes: false,
					});
					break;
				case "countryDownloadStarted":
					appendLine(
						`Downloading ${p.countryCode}${p.updates ? " updates" : ""} (${p.files} files, ${formatBytes(p.bytes)})...`,
					);
					setBar({ label: `Downloading ${p.countryCode}`, done: 0, total: p.bytes, bytes: true });
					break;
				case "fileDownloaded":
					setBar((prev) =>
						prev?.bytes ? { ...prev, done: Math.min(prev.done + p.bytes, prev.total) } : prev,
					);
					break;
			}
		},
		[appendLine],
	);

	const importLocations = useCallback(async (valiLocs: ValiLocation[]) => {
		let tagId: number | null = null;
		const tagName = valiStore.get<string>("tagName", "");
		if (tagName) {
			tagId = (await createTags([tagName]))[0].id;
		}
		const locations = valiLocs.map((v) =>
			createLocation({
				lat: v.lat,
				lng: v.lng,
				heading: v.heading,
				...(v.zoom != null ? { zoom: v.zoom } : {}),
				...(v.pitch != null ? { pitch: v.pitch } : {}),
				...(v.panoId != null ? { panoId: v.panoId } : {}),
				...(v.tags.length ? { extra: { tags: v.tags } } : {}),
				flags: LocationFlag.LoadAsPanoId,
				...(tagId != null ? { tags: [tagId] } : {}),
			}),
		);
		MMA.addLocations(locations);
		setImportCount(locations.length);
	}, []);

	const handleGenerate = useCallback(async () => {
		setError("");
		setImportCount(0);

		let json: string;
		try {
			json = await navigator.clipboard.readText();
		} catch {
			setError("Could not read clipboard. Copy the JSON from Vali first.");
			return;
		}

		try {
			JSON.parse(json);
		} catch {
			setError(
				"Clipboard does not contain valid JSON. Click the copy button in Vali's Definition panel first.",
			);
			return;
		}

		setPhase("generating");
		setLines([]);
		setBar(null);

		const unlisten = await listen<ValiProgress>("vali-progress", (e) => onProgress(e.payload));
		try {
			const locations = await cmd.valiGenerate(json);
			appendLine(`${locations.length} locations generated`);
			setPhase("done");
			await importLocations(locations);
		} catch (e) {
			setPhase("error");
			setError(String(e));
		} finally {
			unlisten();
			setBar(null);
		}
	}, [appendLine, onProgress, importLocations]);

	const handleReset = useCallback(() => {
		setPhase("editing");
		setLines([]);
		setError("");
		sessionPhase = "editing";
		sessionLines = [];
	}, []);

	const handleClose = useCallback(() => {
		sessionPhase = "editing";
		sessionLines = [];
		onClose();
	}, [onClose]);

	return (
		<Sidebar title="Vali" onBack={handleClose} className="vali-sidebar" flush>
			<div className="vali-sidebar__body">
				{phase === "editing" && (
					<>
						<div className="vali-sidebar__iframe-wrap">
							<iframe
								src={VALIG_URL}
								title="Vali Configuration Editor"
								allow="clipboard-write; clipboard-read"
							/>
						</div>
						<div className="vali-sidebar__actions">
							{error && <div className="vali-sidebar__error">{error}</div>}
							<label className="settings-popup__item settings-popup__select">
								Tag as:
								<input
									className="input"
									type="text"
									value={tagName}
									onChange={(e) => {
										setTagName(e.target.value);
										valiStore.set("tagName", e.target.value);
									}}
									placeholder="None"
								/>
							</label>
							<button className="button button--primary" onClick={handleGenerate}>
								Generate
							</button>
						</div>
					</>
				)}

				{(phase === "generating" || phase === "done" || phase === "error") && (
					<div className="vali-sidebar__output">
						<div className="vali-sidebar__output-header">
							Output
							<span className="vali-sidebar__output-status">
								{phase === "generating" && (
									<>
										<span className="vali-sidebar__spinner" /> Running...
									</>
								)}
								{phase === "done" &&
									(importCount > 0 ? `Imported ${importCount} locations` : "Complete")}
								{phase === "error" && "Failed"}
							</span>
						</div>

						<div className="vali-sidebar__log" ref={logRef}>
							{lines.map((line, i) => (
								<div
									key={i}
									className={`vali-sidebar__log-line${line.isError ? " vali-sidebar__log-line--error" : ""}`}
								>
									{line.text}
								</div>
							))}
							{phase === "error" && error && (
								<div className="vali-sidebar__log-line vali-sidebar__log-line--error">{error}</div>
							)}
						</div>

						{phase === "generating" && bar && (
							<div className="vali-sidebar__progress">
								<div className="vali-sidebar__progress-label">
									{bar.label}
									<span>
										{bar.bytes
											? `${formatBytes(bar.done)} / ${formatBytes(bar.total)}`
											: `${bar.done} / ${bar.total}`}
									</span>
								</div>
								<div className="vali-sidebar__progress-track">
									<div
										className="vali-sidebar__progress-fill"
										style={{ width: `${bar.total > 0 ? (bar.done / bar.total) * 100 : 0}%` }}
									/>
								</div>
							</div>
						)}

						<div className="vali-sidebar__output-actions">
							{phase !== "generating" && (
								<button className="button" onClick={handleReset}>
									Back to Editor
								</button>
							)}
						</div>
					</div>
				)}
			</div>
		</Sidebar>
	);
}
