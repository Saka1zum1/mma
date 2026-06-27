import { useState, useEffect } from "react";
import type { ComponentType, CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { useCurrentMap } from "@/store/useMapStore";
import { useTargetMapId, useManualChapter, closeManual, gotoManualChapter, goToList } from "@/store/router";
import { MapList, BulkActions } from "@/components/map-list/MapList";
import { StatsForNerds } from "@/components/dialogs/StatsForNerds";
import { SettingsPage } from "@/components/dialogs/SettingsPage";
import { PluginMarketplace } from "@/components/dialogs/PluginMarketplace";
import { Manual } from "@/components/manual/Manual";
import { ManualSearch } from "@/components/manual/ManualSearch";
import { useHotkey } from "@/lib/hooks/useHotkey";
import { useBinding } from "@/lib/util/hotkeys";
import { useSetting, useSettings, CSS_VAR_SETTINGS } from "@/store/settings";
import { Icon } from "@/components/primitives/Icon";
import { mdiCog, mdiPuzzle, mdiClose } from "@mdi/js";
import { ToastContainer } from "@/components/primitives/Toast";
import { TooltipProvider } from "@/components/primitives/Tooltip";
import { useUpdateState, dismissUpdate, installUpdate, relaunchApp } from "@/lib/util/updateCheck";
import "@/plugins";

// Dynamic import (deck.gl/luma.gl out of the initial bundle) WITHOUT React.lazy/Suspense —
// a Suspense boundary makes React 19 render the editor in a low-priority lane (~260ms/open).
// We preload the chunk in the background and render it as a plain component in the urgent lane.
const mapEditorModule = import("@/components/editor/MapEditor");

// A real Tauri sub-window for a single map (label "map-<id>"). Always false on web, where
// every tab reports label "main" — there the URL (targetMapId) alone picks editor vs list.
const isEditorWindow = getCurrentWindow().label.startsWith("map-");

// tauri-plugin-window-state StateFlags::all() — size|position|maximized|visible|decorations|fullscreen
const WINDOW_STATE_ALL = 0b111111;

const BLANK_STYLE: CSSProperties = { position: "fixed", inset: 0, background: "#252521" };
const Blank = () => <div style={BLANK_STYLE} />;

// The URL is the role authority — `targetMapId` picks editor vs list on BOTH Tauri and web.
// The window label only adds Tauri's "close my window when I back out" behavior.
export default function App() {
	const targetMapId = useTargetMapId();
	// A Tauri map window whose map was backed out of: focus the list window, persist this
	// window's geometry, then destroy it. Never true on web (no sub-window to close).
	const closing = isEditorWindow && !targetMapId;

	useSelfDestruct(closing);
	useCustomCss();
	useCssVarSettings();

	return (
		<TooltipProvider>
			{closing ? <Blank /> : targetMapId ? <EditorRoot /> : <MapList />}
			{!closing && <AppChrome />}
			<ToastContainer />
		</TooltipProvider>
	);
}

/** Editor window content: the map data + the lazily-loaded editor chunk, with a blank
 *  placeholder while either is still resolving. */
function EditorRoot() {
	const map = useCurrentMap();
	const [MapEditor, setMapEditor] = useState<ComponentType | null>(null);
	useEffect(() => {
		mapEditorModule.then((m) => setMapEditor(() => m.MapEditor));
	}, []);
	if (!map || !MapEditor) return <Blank />;
	return <MapEditor />;
}

/** Floating UI shared by both window roles: settings/plugins gears, update pill, and the
 *  app-level dialogs. Hidden by App while a window is self-destructing. */
function AppChrome() {
	const map = useCurrentMap();
	const manualChapter = useManualChapter();
	const update = useUpdateState();
	const [showStats, setShowStats] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [showPlugins, setShowPlugins] = useState(false);
	const [manualSearchOpen, setManualSearchOpen] = useState(false);

	useHotkey(useBinding("toggleStats"), () => setShowStats((s) => !s));
	useHotkey(useBinding("openManualSearch"), () => setManualSearchOpen((v) => !v));
	useHotkey(useBinding("closeMap"), () => { if (map) goToList(); });

	return (
		<>
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
				<Manual chapterId={manualChapter} onNavigate={gotoManualChapter} onClose={closeManual} />
			)}
		</>
	);
}

/** Tauri-only: a map sub-window persists its geometry and destroys itself once its map is
 *  backed out of. destroy() never fires CloseRequested, so the window-state plugin wouldn't
 *  save geometry — we save it explicitly first. */
function useSelfDestruct(closing: boolean) {
	useEffect(() => {
		if (!closing) return;
		WebviewWindow.getByLabel("main")
			.then(async (main) => {
				await main?.unminimize();
				await main?.setFocus();
			})
			.finally(async () => {
				await invoke("plugin:window-state|save_window_state", { flags: WINDOW_STATE_ALL }).catch(() => {});
				getCurrentWindow().destroy();
			});
	}, [closing]);
}

/** Mirror the CSS-var-backed app settings (see `CSS_VAR_SETTINGS`) onto `:root`. */
function useCssVarSettings() {
	const settings = useSettings();
	useEffect(() => {
		for (const [cssVar, value] of CSS_VAR_SETTINGS) {
			document.documentElement.style.setProperty(cssVar, value(settings));
		}
	}, [settings]);
}

function useCustomCss() {
	const customCss = useSetting("customCss");
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
}
