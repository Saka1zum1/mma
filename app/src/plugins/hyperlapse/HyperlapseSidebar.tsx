import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar, Section, Field, EmptyState } from "@/components/primitives/Sidebar";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { Button } from "@/components/primitives/Button";
import { Slider } from "@/components/primitives/Slider";
import { TextInput } from "@/components/primitives/TextInput";
import { NSelect } from "@/components/primitives/NSelect";
import { Switch } from "@/components/primitives/Switch";
import { Icon } from "@/components/primitives/Icon";
import { Tooltip } from "@/components/primitives/Tooltip";
import { usePluginState } from "@/plugins/registry";
import { fetchLocations, getMapState, useMapState } from "@/store/useMapStore";
import { getMapHost } from "@/lib/map/mapState";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/util/toast";
import { relativeTime } from "@/lib/util/format";
import { mdiCrosshairsGps, mdiDelete, mdiMapMarkerRadius, mdiPencil, mdiPlay } from "@mdi/js";
import type { LatLng } from "@/types";
import {
	DEFAULT_SETTINGS,
	normalizeSettings,
	type BuildProgress,
	type HyperlapseFrameMeta,
	type HyperlapseSettings,
	type LookMode,
	type PlaybackMode,
	type SavedSequence,
	type ViewFilter,
} from "./types";
import { buildSequence } from "./route/SequenceBuilder";
import { setRouteOverlay, clearRouteOverlay } from "./routeOverlay";
import { HyperlapseViewer } from "./HyperlapseViewer";
import {
	deleteSavedSequence,
	listSavedSequences,
	nextSequenceName,
	renameSavedSequence,
	saveSequence,
} from "./sequenceStore";
import "./hyperlapse.css";

export function HyperlapseSidebar({ onClose }: { onClose: () => void }) {
	const { t } = useT();
	const [storedSettings, setSettings] = usePluginState<Partial<HyperlapseSettings>>(
		"hyperlapse",
		"settings",
		DEFAULT_SETTINGS,
	);
	const settings = normalizeSettings(storedSettings);
	const selectedCount = useMapState((s) => s.selectedLocationIds.size);
	const [busy, setBusy] = useState(false);
	const [progress, setProgress] = useState<BuildProgress | null>(null);
	const [metas, setMetas] = useState<HyperlapseFrameMeta[]>([]);
	const [path, setPath] = useState<LatLng[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [viewerOpen, setViewerOpen] = useState(false);
	const [saved, setSaved] = useState<SavedSequence[]>(() => listSavedSequences());
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [pickingLookAt, setPickingLookAt] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const pickOffRef = useRef<(() => void) | null>(null);

	const patchSettings = useCallback(
		(patch: Partial<HyperlapseSettings>) =>
			setSettings(normalizeSettings({ ...settings, ...patch })),
		[settings, setSettings],
	);

	const refreshSaved = () => setSaved(listSavedSequences());

	useEffect(() => {
		setRouteOverlay(metas.length || path.length ? { path, frames: metas } : null);
		return () => clearRouteOverlay();
	}, [path, metas]);

	useEffect(() => {
		return () => {
			pickOffRef.current?.();
			pickOffRef.current = null;
			getMapHost()?.setCursor(null);
		};
	}, []);

	const cancel = () => {
		abortRef.current?.abort();
		abortRef.current = null;
		setBusy(false);
		setProgress({ phase: "cancelled", progress: 0 });
	};

	const handleClose = () => {
		pickOffRef.current?.();
		pickOffRef.current = null;
		getMapHost()?.setCursor(null);
		clearRouteOverlay();
		onClose();
	};

	const setLookMode = (mode: LookMode) => {
		if (mode === "lookAt") {
			const center = getMapHost()?.getCenter();
			const lookAt =
				settings.lookAt ?? (center ? { lat: center.lat, lng: center.lng } : { lat: 0, lng: 0 });
			patchSettings({ lookMode: "lookAt", lookAt });
			return;
		}
		patchSettings({ lookMode: mode });
	};

	const useMapCenterAsLookAt = () => {
		const center = getMapHost()?.getCenter();
		if (!center) {
			toast(t("Map is not ready"));
			return;
		}
		patchSettings({ lookMode: "lookAt", lookAt: { lat: center.lat, lng: center.lng } });
	};

	const pickLookAtFromMap = () => {
		const host = getMapHost();
		if (!host) {
			toast(t("Map is not ready"));
			return;
		}
		pickOffRef.current?.();
		host.setCursor("crosshair");
		setPickingLookAt(true);
		toast(t("Click the map to set the look-at point"));
		pickOffRef.current = host.once("mousedown", (ll) => {
			pickOffRef.current = null;
			host.setCursor(null);
			setPickingLookAt(false);
			patchSettings({ lookMode: "lookAt", lookAt: { lat: ll.lat, lng: ll.lng } });
		});
	};

	const generate = async () => {
		if (busy) return;
		const ids = [...getMapState().selectedLocationIds];
		if (ids.length < 2) {
			toast(t("Select at least two locations with panoramas"));
			return;
		}
		const ac = new AbortController();
		abortRef.current = ac;
		setBusy(true);
		setMetas([]);
		setPath([]);
		try {
			const locations = await fetchLocations({
				type: "Locations",
				locations: ids,
				name: null,
			});
			const result = await buildSequence({
				settings,
				locations,
				signal: ac.signal,
				onProgress: setProgress,
			});
			const now = Date.now();
			const seq: SavedSequence = {
				id: `hl-${now}`,
				name: nextSequenceName(),
				createdAt: now,
				modifiedAt: now,
				settings: { panoZoom: settings.panoZoom },
				frames: result.frames,
				path: result.path,
			};
			saveSequence(seq);
			refreshSaved();
			setMetas(result.frames);
			setPath(result.path);
			setActiveId(seq.id);
			setProgress({
				phase: "done",
				progress: 1,
				resolved: result.frames.length,
				total: result.frames.length,
			});
			toast(t("Ready — {count} frames (textures load on demand)", { count: result.frames.length }));
		} catch (e) {
			if ((e as Error)?.name === "AbortError") return;
			toast(String((e as Error)?.message ?? e));
			setProgress({ phase: "error", progress: 0, message: String((e as Error)?.message ?? e) });
		} finally {
			setBusy(false);
			abortRef.current = null;
		}
	};

	const restore = (seq: SavedSequence, openViewer = false) => {
		if (busy) return;
		setMetas(seq.frames);
		setPath(seq.path);
		setActiveId(seq.id);
		setProgress({
			phase: "done",
			progress: 1,
			resolved: seq.frames.length,
			total: seq.frames.length,
		});
		if (openViewer) setViewerOpen(true);
		else toast(t("Ready — {count} frames (textures load on demand)", { count: seq.frames.length }));
	};

	const beginRename = (seq: SavedSequence) => {
		setRenamingId(seq.id);
		setRenameValue(seq.name);
	};

	const commitRename = (id: string) => {
		if (renameSavedSequence(id, renameValue)) {
			refreshSaved();
			toast(t("Sequence renamed"));
		}
		setRenamingId(null);
		setRenameValue("");
	};

	const confirmDelete = (id: string) => {
		deleteSavedSequence(id);
		if (activeId === id) {
			setActiveId(null);
			setMetas([]);
			setPath([]);
		}
		refreshSaved();
		setDeleteConfirmId(null);
	};

	const requestDelete = (id: string) => {
		setDeleteConfirmId(id);
	};

	return (
		<>
			<Sidebar title={t("Road Trip")} onBack={handleClose} className="hyperlapse-sidebar">
				<Section title={t("Parameters")}>
					<Field label={t("FOV ({n}°)", { n: settings.fov })}>
						<Slider
							min={40}
							max={110}
							value={settings.fov}
							onChange={(e) => patchSettings({ fov: Number(e.target.value) })}
						/>
					</Field>
					<Field label={t("Play FPS ({n})", { n: settings.fps })}>
						<Slider
							min={5}
							max={60}
							value={settings.fps}
							onChange={(e) => patchSettings({ fps: Number(e.target.value) })}
						/>
					</Field>
					<Field label={t("Playback mode")}>
						<NSelect
							value={settings.playbackMode}
							onChange={(e) => patchSettings({ playbackMode: e.target.value as PlaybackMode })}
						>
							<option value="once">{t("Once")}</option>
							<option value="loop">{t("Loop")}</option>
							<option value="pingpong">{t("Ping-pong")}</option>
						</NSelect>
					</Field>
					<Field label={t("Filter")}>
						<NSelect
							value={settings.viewFilter}
							onChange={(e) => patchSettings({ viewFilter: e.target.value as ViewFilter })}
						>
							<option value="none">{t("None")}</option>
							<option value="vivid">{t("Vivid")}</option>
							<option value="vintage">{t("Vintage")}</option>
							<option value="mono">{t("Mono")}</option>
						</NSelect>
					</Field>
					<Field label={t("Smooth camera transition")} row>
						<Switch
							checked={settings.smoothTransition}
							onChange={(v) => patchSettings({ smoothTransition: v })}
							label={t("Smooth camera transition")}
						/>
					</Field>
					<Field label={t("Pano zoom (1–3)")}>
						<TextInput
							type="number"
							min={1}
							max={3}
							step={1}
							value={settings.panoZoom}
							onChange={(e) => {
								const n = Math.round(Number(e.target.value));
								if (!Number.isFinite(n)) return;
								patchSettings({ panoZoom: Math.min(n ?? 2, 3) });
							}}
						/>
					</Field>
				</Section>

				<Section title={t("Look")} defaultOpen={false}>
					<Field label={t("Look mode")}>
						<NSelect
							value={settings.lookMode}
							onChange={(e) => setLookMode(e.target.value as LookMode)}
						>
							<option value="drive">{t("Follow driving direction")}</option>
							<option value="lookAt">{t("Look-at point")}</option>
							<option value="fixed">{t("Fixed heading")}</option>
							<option value="free">{t("Free (texture forward)")}</option>
						</NSelect>
					</Field>
					{settings.lookMode === "lookAt" && (
						<>
							{settings.lookAt && (
								<div className="hyperlapse-sidebar__row">
									<TextInput
										type="number"
										step="any"
										value={settings.lookAt.lat}
										aria-label="lat"
										onChange={(e) =>
											patchSettings({
												lookAt: {
													lat: Number(e.target.value),
													lng: settings.lookAt!.lng,
												},
											})
										}
									/>
									<TextInput
										type="number"
										step="any"
										value={settings.lookAt.lng}
										aria-label="lng"
										onChange={(e) =>
											patchSettings({
												lookAt: {
													lat: settings.lookAt!.lat,
													lng: Number(e.target.value),
												},
											})
										}
									/>
								</div>
							)}
							<div className="hyperlapse-sidebar__row">
								<Button small onClick={useMapCenterAsLookAt}>
									<Icon path={mdiCrosshairsGps} size={16} />
									{t("Map center")}
								</Button>
								<Button
									small
									className={pickingLookAt ? "is-active" : undefined}
									onClick={pickLookAtFromMap}
								>
									<Icon path={mdiMapMarkerRadius} size={16} />
									{t("Pick on map")}
								</Button>
							</div>
							<p className="hyperlapse-sidebar__hint">
								{t("In look-at mode the viewer locks heading; drag adjusts pitch and roll only.")}
							</p>
						</>
					)}
					{settings.lookMode === "fixed" && (
						<Field label={t("Heading (°)")}>
							<TextInput
								type="number"
								min={0}
								max={360}
								step={1}
								value={settings.fixedHeading}
								onChange={(e) =>
									patchSettings({
										fixedHeading: ((Number(e.target.value) % 360) + 360) % 360 || 0,
									})
								}
							/>
						</Field>
					)}
					<Field label={t("Fixed pitch")} row>
						<Switch
							checked={settings.useFixedPitch}
							onChange={(v) => patchSettings({ useFixedPitch: v })}
							label={t("Fixed pitch")}
						/>
					</Field>
					{settings.useFixedPitch && (
						<Field label={t("Pitch (°)")}>
							<TextInput
								type="number"
								min={-85}
								max={85}
								step={1}
								value={settings.fixedPitch}
								onChange={(e) => {
									const n = Number(e.target.value);
									if (!Number.isFinite(n)) return;
									patchSettings({ fixedPitch: Math.max(-85, Math.min(85, n)) });
								}}
							/>
						</Field>
					)}
				</Section>

				<div className="hyperlapse-sidebar__actions">
					{busy ? (
						<Button variant="destructive" onClick={cancel}>
							{t("Cancel")}
						</Button>
					) : (
						<Button variant="primary" disabled={selectedCount < 2} onClick={() => void generate()}>
							{t("Generate")}
						</Button>
					)}
					<Button disabled={!metas.length} onClick={() => setViewerOpen(true)}>
						{t("Open Road Trip viewer")}
					</Button>
				</div>

				{progress && (
					<p className="hyperlapse-sidebar__progress">
						{progress.message
							? t(progress.message)
							: t("{phase}: {percent}% ({resolved}/{total})", {
									phase: t(
										(
											{
												ordering: "Ordering",
												loading: "Loading",
												done: "Done",
												cancelled: "Cancelled",
												error: "Error",
											} as const
										)[progress.phase],
									),
									percent: Math.round(progress.progress * 100),
									resolved: progress.resolved ?? 0,
									total: progress.total ?? 0,
								})}
					</p>
				)}

				<Section title={t("Sequences")}>
					{saved.length === 0 ? (
						<EmptyState>{t("Select locations, then generate a Road Trip sequence.")}</EmptyState>
					) : (
						<ul className="hyperlapse-sidebar__saved">
							{saved.map((s) => (
								<li
									key={s.id}
									className={
										s.id === activeId
											? "hyperlapse-sidebar__saved-item is-active"
											: "hyperlapse-sidebar__saved-item"
									}
								>
									<div className="hyperlapse-sidebar__saved-meta">
										{renamingId === s.id ? (
											<TextInput
												autoFocus
												value={renameValue}
												onChange={(e) => setRenameValue(e.target.value)}
												onBlur={() => commitRename(s.id)}
												onKeyDown={(e) => {
													if (e.key === "Enter") commitRename(s.id);
													if (e.key === "Escape") {
														setRenamingId(null);
														setRenameValue("");
													}
												}}
											/>
										) : (
											<span className="hyperlapse-sidebar__saved-name">{s.name}</span>
										)}
										<small>
											{t("{count} frames · edited {time}", {
												count: s.frames.length,
												time: relativeTime(new Date(s.modifiedAt).toISOString()),
											})}
										</small>
									</div>
									<div className="hyperlapse-sidebar__saved-actions">
										<Tooltip content={t("Play")} side="bottom">
											<button
												type="button"
												className="icon-button"
												aria-label={t("Play")}
												disabled={busy}
												onClick={() => restore(s, true)}
											>
												<Icon path={mdiPlay} size={18} />
											</button>
										</Tooltip>
										<Tooltip content={t("Rename")} side="bottom">
											<button
												type="button"
												className="icon-button"
												aria-label={t("Rename")}
												disabled={busy}
												onClick={() => beginRename(s)}
											>
												<Icon path={mdiPencil} size={18} />
											</button>
										</Tooltip>
										<Tooltip content={t("Delete")} side="bottom">
											<button
												type="button"
												className="icon-button"
												aria-label={t("Delete")}
												disabled={busy}
												onClick={() => requestDelete(s.id)}
											>
												<Icon path={mdiDelete} size={18} />
											</button>
										</Tooltip>
									</div>
								</li>
							))}
						</ul>
					)}
				</Section>
			</Sidebar>

			<Dialog
				open={deleteConfirmId != null}
				onOpenChange={(open) => !open && setDeleteConfirmId(null)}
			>
				<DialogContent title={t("Delete")}>
					<p>{t("Delete this sequence?")}</p>
					<div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
						<Button small onClick={() => setDeleteConfirmId(null)}>
							{t("Cancel")}
						</Button>
						<Button
							small
							variant="destructive"
							onClick={() => deleteConfirmId && confirmDelete(deleteConfirmId)}
						>
							{t("Delete")}
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<HyperlapseViewer
				open={viewerOpen}
				onClose={() => setViewerOpen(false)}
				metas={metas}
				settings={settings}
				onSettingsPatch={patchSettings}
			/>
		</>
	);
}
