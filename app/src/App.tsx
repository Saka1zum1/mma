import { useState, useEffect } from "react";
import type { ComponentType } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCurrentMap } from "@/store/useMapStore";
import { useTargetMapId, useManualChapter, closeManual, gotoManualChapter } from "@/store/router";
import { MapList, BulkActions } from "@/components/map-list/MapList";
import { StatsForNerds } from "@/components/dialogs/StatsForNerds.add";
import { SettingsPage } from "@/components/dialogs/SettingsPage.add";
import { PluginMarketplace } from "@/components/dialogs/PluginMarketplace.add";
import { Manual } from "@/components/dialogs/Manual.add";
import { ManualSearch } from "@/components/dialogs/ManualSearch.add";
import { useHotkey } from "@/lib/hooks/useHotkey";
import { useBinding } from "@/lib/util/hotkeys.add";
import { useSetting } from "@/store/settings.add";
import { Icon } from "@/components/primitives/Icon";
import { mdiCog, mdiPuzzle, mdiClose } from "@mdi/js";
import { ToastContainer } from "@/components/primitives/Toast.add";
import { useUpdateState, dismissUpdate, installUpdate, relaunchApp } from "@/lib/util/updateCheck";
import "@/plugins";

// Dynamic import (deck.gl/luma.gl out of the initial bundle) WITHOUT React.lazy/Suspense —
// a Suspense boundary makes React 19 render the editor in a low-priority lane (~260ms/open).
// We preload the chunk in the background and render it as a plain component in the urgent lane.
const mapEditorModule = import("@/components/editor/MapEditor");

const isEditorWindow = getCurrentWindow().label.startsWith("map-");

export default function App() {
	const map = useCurrentMap();
	const [MapEditor, setMapEditor] = useState<ComponentType | null>(null);
	useEffect(() => {
		mapEditorModule.then((m) => setMapEditor(() => m.MapEditor));
	}, []);
	const [showStats, setShowStats] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [showPlugins, setShowPlugins] = useState(false);
	const [manualSearchOpen, setManualSearchOpen] = useState(false);
	const targetMapId = useTargetMapId();
	const manualChapter = useManualChapter();
	const customCss = useSetting("customCss");
	const update = useUpdateState();

	useHotkey(useBinding("toggleStats"), () => setShowStats((s) => !s));
	useHotkey(useBinding("openManualSearch"), () => setManualSearchOpen((v) => !v));

	useEffect(() => {
		// Only self-destruct when no map is *targeted* by the URL (the user closed
		// it) — not while a map is still loading on boot (URL has a map, data null).
		if (isEditorWindow && !targetMapId) {
			WebviewWindow.getByLabel("main").then(async (main) => {
				await main?.unminimize();
				await main?.setFocus();
			}).finally(() => {
				getCurrentWindow().destroy();
			});
			return;
		}
	}, [targetMapId]);


	useEffect(() => {
		let el = document.getElementById("mma-custom-css") as HTMLStyleElement | null;
		if (!el) {
			el = document.createElement("style");
			el.id = "mma-custom-css";
			document.head.appendChild(el);
		}
		el.textContent = customCss;
		return () => {
			el!.textContent = "";
		};
	}, [customCss]);

	return (
		<>
			{targetMapId ? (
				map && MapEditor ? <MapEditor /> : <div style={{ position: "fixed", inset: 0, background: "#252521" }} />
			) : (
				<MapList />
			)}
			{!showSettings && !showPlugins && (
				<div
					className="bottom-bar"
					style={{ position: "fixed", bottom: 12, right: 12, zIndex: 5, display: "flex", gap: 4 }}
				>
					{update.version && !update.dismissed && (
						<div className="update-pill">
							{update.phase === "available" && (
								<>
									<button className="update-pill__label" onClick={installUpdate}>
										v{update.version} - download update
									</button>
									<button className="update-pill__dismiss" onClick={dismissUpdate} title="Dismiss">
										<Icon path={mdiClose} size={14} />
									</button>
								</>
							)}
							{update.phase === "downloading" && (
								<span className="update-pill__label">Downloading {update.percent}%</span>
							)}
							{update.phase === "ready" && (
								<button className="update-pill__label" onClick={relaunchApp}>
									Restart to update
								</button>
							)}
							{update.phase === "error" && (
								<>
									<button className="update-pill__label" onClick={installUpdate}>
										Update failed - retry
									</button>
									<button className="update-pill__dismiss" onClick={dismissUpdate} title="Dismiss">
										<Icon path={mdiClose} size={14} />
									</button>
								</>
							)}
						</div>
					)}
					{!map && <BulkActions />}
					<button className="settings-gear" onClick={() => setShowPlugins(true)} title="Plugins">
						<Icon path={mdiPuzzle} />
					</button>
					<button className="settings-gear" onClick={() => setShowSettings(true)} title="Settings">
						<Icon path={mdiCog} />
					</button>
				</div>
			)}
			{showStats && <StatsForNerds onClose={() => setShowStats(false)} />}
			<SettingsPage open={showSettings} onOpenChange={setShowSettings} />
			<PluginMarketplace open={showPlugins} onOpenChange={setShowPlugins} />
			<ManualSearch open={manualSearchOpen} onOpenChange={setManualSearchOpen} />
			{manualChapter !== null && (
				<Manual
					chapterId={manualChapter}
					onNavigate={gotoManualChapter}
					onClose={closeManual}
				/>
			)}
			<ToastContainer />
		</>
	);
}
