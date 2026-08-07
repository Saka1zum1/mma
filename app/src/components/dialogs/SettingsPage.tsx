import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { NSelect } from "@/components/primitives/NSelect";
import { Slider } from "@/components/primitives/Slider";
import { Checkbox } from "@/components/primitives/Checkbox";
import { Button } from "@/components/primitives/Button";
import { TextInput } from "@/components/primitives/TextInput";
import {
	SettingRow,
	SettingsSearchContext,
	useSettingsSearch,
} from "@/components/primitives/SettingRow";
import {
	getAllBindings,
	useBinding,
	getBinding,
	setBinding,
	resetBinding,
	resetAllBindings,
	reassignBinding,
	getConflicts,
	getAltSlowConflict,
	isCustomized,
	type HotkeyAction,
	type HotkeyDef,
	type HotkeyGroup,
} from "@/lib/util/hotkeys";
import { Icon } from "@/components/primitives/Icon";
import { mdiAlertCircleOutline, mdiRefresh } from "@mdi/js";
import {
	useSettings,
	useSetting,
	setSetting,
	type AppSettings,
	type MapListField,
	type BorderDetail,
	type SubdivisionDetail,
	MOVEMENT_MODES,
	SEEN_RESOLUTIONS,
	EXACT_DATE_FORMATS,
	DATE_TIMEZONES,
	MAP_LIST_FIELDS,
	GEOCODE_PROVIDERS,
	DISCORD_PRESENCE_MODES,
	TAG_VIEW_MODES,
	TAG_FOLDER_COLOR_MODES,
	POLYGON_COLOR_MODES,
	OPACITY_TOGGLE_MODES,
	TAG_SUGGESTION_LIMITS,
	BORDER_DETAILS,
	SUBDIVISION_DETAILS,
	PREVIEW_ASPECT_RATIOS,
} from "@/store/settings";
import { formatBinding, buildComboString } from "@/lib/hooks/useHotkey";
import { cmd } from "@/lib/commands";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "@/lib/util/toast";
import { log } from "@/lib/util/log";
import type { DataLocation } from "@/bindings.gen";
import { useUpdateState, checkForUpdate, installUpdate, relaunchApp } from "@/lib/util/updateCheck";
import { ColorPicker } from "@/components/primitives/ColorPicker";
import { LOCALES, hotkeyLabel, useT, type AppLocale } from "@/lib/i18n";
import { localizeOptions } from "@/lib/i18n/helpers";
import type { MessageKey } from "@/locales/en";

/** Non-row section content. Hidden during search unless the section title
 *  matched, or `match` (a keyword string for content with no SettingRows)
 *  contains the query. */
function Aux({ children, match }: { children: ReactNode; match?: string }) {
	const { query, auxVisible } = useSettingsSearch();
	if (!auxVisible && !(match && query && match.toLowerCase().includes(query))) return null;
	return <div className="settings-aux">{children}</div>;
}

/** A sub-group heading inside a section. Visible when the section is fully
 *  shown, or when searching and the heading text itself matches the query. */
function GroupHeading({ children }: { children: ReactNode }) {
	const { query, searching, auxVisible } = useSettingsSearch();
	if (auxVisible) return <h3 className="settings-group">{children}</h3>;
	if (
		searching &&
		typeof children === "string" &&
		children.toLowerCase().includes(query)
	) {
		return <h3 className="settings-group">{children}</h3>;
	}
	return null;
}

function SettingSlider({
	value,
	min,
	max,
	step,
	onChange,
	format,
	disabled,
}: {
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (v: number) => void;
	format?: (v: number) => string;
	disabled?: boolean;
}) {
	return (
		<>
			<Slider
				className="setting-slider"
				min={min}
				max={max}
				step={step}
				value={value}
				disabled={disabled}
				onChange={(e) => onChange(Number(e.target.value))}
			/>
			<span className="mono setting-slider__value">{format ? format(value) : value}</span>
		</>
	);
}

function SettingSelect<K extends keyof AppSettings>({
	setting,
	options,
}: {
	setting: K;
	options: Record<AppSettings[K] & string, string>;
}) {
	const value = useSetting(setting);
	return (
		<NSelect
			className="nselect--compact"
			value={value as string}
			onChange={(e) => setSetting(setting, e.target.value as AppSettings[K])}
		>
			{Object.entries(options).map(([v, label]) => (
				<option key={v} value={v}>
					{label as string}
				</option>
			))}
		</NSelect>
	);
}

const BLOCKED_COMBOS = new Set(["Mod++", "Mod+-"]);

function getBlockedReason(
	e: KeyboardEvent,
	t: (key: MessageKey, params?: Record<string, string | number>) => string,
): string | null {
	const combo = buildComboString(e);
	if (!combo) return null;
	if (e.altKey) {
		const conflict = getAltSlowConflict(combo);
		if (conflict) {
			return t("settings.hotkey.altSlowConflict", {
				combo: formatBinding(combo),
				label: hotkeyLabel(conflict.action),
			});
		}
	}
	if (BLOCKED_COMBOS.has(combo)) return t("settings.hotkey.blockedByWindow");
	return null;
}

function HotkeyRow({
	action,
	flash,
	onJump,
}: {
	action: HotkeyAction;
	flash: boolean;
	onJump: (action: string) => void;
}) {
	const { t } = useT();
	const label = hotkeyLabel(action);
	const binding = useBinding(action);
	const [recording, setRecording] = useState(false);
	const [blocked, setBlocked] = useState<string | null>(null);
	const [pending, setPending] = useState<{ combo: string; conflicts: HotkeyDef[] } | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const custom = isCustomized(action);

	useEffect(() => {
		if (recording && !pending && inputRef.current) inputRef.current.focus();
	}, [recording, pending]);

	const cancel = useCallback(() => {
		setRecording(false);
		setBlocked(null);
		setPending(null);
	}, []);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();

			if (e.key === "Escape") {
				cancel();
				return;
			}

			if (e.key === "Backspace" || e.key === "Delete") {
				setBinding(action, "");
				cancel();
				return;
			}

			const reason = getBlockedReason(e.nativeEvent, t);
			if (reason) {
				setBlocked(reason);
				return;
			}

			const combo = buildComboString(e.nativeEvent);
			if (!combo) return;

			const collisions = getConflicts(action, combo);
			if (collisions.length > 0) {
				setBlocked(null);
				setPending({ combo, conflicts: collisions });
				return;
			}

			setBinding(action, combo);
			cancel();
		},
		[action, cancel, t],
	);

	const reassign = useCallback(() => {
		if (!pending) return;
		reassignBinding(action, pending.combo);
		cancel();
	}, [action, pending, cancel]);

	const conflicts = getConflicts(action, binding);
	const hasConflict = conflicts.length > 0;

	return (
		<tr
			id={`hotkey-row-${action}`}
			className={`${custom ? "hotkey-row--custom" : ""}${flash ? " hotkey-row--flash" : ""}${hasConflict ? " hotkey-row--conflict" : ""}`}
		>
			<td>{label}</td>
			<td>
				{recording ? (
					pending ? (
						<div className="hotkey-reassign" onKeyDown={(e) => e.key === "Escape" && cancel()}>
							<span className="hotkey-reassign__msg">
								{t("settings.hotkey.reassignPrompt", {
									combo: formatBinding(pending.combo),
									actions: pending.conflicts.map((c) => hotkeyLabel(c.action)).join(", "),
								})}
							</span>
							<Button variant="primary" className="hotkey-reset" autoFocus onClick={reassign}>
								{t("settings.hotkey.reassign")}
							</Button>
							<Button className="hotkey-reset" onClick={cancel}>
								{t("common.cancel")}
							</Button>
						</div>
					) : (
						<>
							<input
								ref={inputRef}
								className="hotkey-record"
								readOnly
								value={blocked ? t("settings.hotkey.tryAnotherKey") : t("settings.hotkey.pressKey")}
								onKeyDown={handleKeyDown}
								onBlur={() => {
									setRecording(false);
									setBlocked(null);
								}}
							/>
							{blocked && <span className="hotkey-blocked">{blocked}</span>}
						</>
					)
				) : (
					<code
						className={`hotkey-display mono${!binding ? " hotkey-display--empty" : ""}`}
						onClick={() => setRecording(true)}
						title={t("settings.clickToRebind")}
					>
						{binding ? formatBinding(binding) : " "}
					</code>
				)}
				{!recording &&
					conflicts.map((c) => (
						<button
							key={c.action}
							className="hotkey-conflict"
							onClick={() => onJump(c.action)}
							title={t("settings.hotkey.alsoBoundTo", { label: hotkeyLabel(c.action) })}
						>
							<Icon path={mdiAlertCircleOutline} className="hotkey-conflict__icon" />
							{hotkeyLabel(c.action)}
						</button>
					))}
			</td>
			<td>
				{custom && (
					<Button
						className="hotkey-reset"
						onClick={() => resetBinding(action)}
						title={t("common.resetToDefault")}
					>
						{t("common.reset")}
					</Button>
				)}
			</td>
		</tr>
	);
}

const GROUPS: HotkeyGroup[] = [
	"Commands",
	"Global",
	"Map Navigation",
	"Location Editor",
	"Quicktag",
	"Review",
];

function KeyboardBody() {
	const { t } = useT();
	const [filter, setFilter] = useState("");
	const [flash, setFlash] = useState<string | null>(null);
	const lower = filter.toLowerCase();
	const allBindings = getAllBindings();

	const jumpTo = useCallback((action: string) => {
		document
			.getElementById(`hotkey-row-${action}`)
			?.scrollIntoView({ block: "nearest", behavior: "smooth" });
		setFlash(action);
		window.setTimeout(() => setFlash((cur) => (cur === action ? null : cur)), 1500);
	}, []);

	const groupTitle = (group: HotkeyGroup): string => {
		const map: Record<HotkeyGroup, MessageKey> = {
			Commands: "settings.hotkey.commands",
			Global: "settings.hotkey.global",
			"Map Navigation": "settings.hotkey.mapNavigation",
			"Location Editor": "settings.hotkey.locationEditor",
			Quicktag: "settings.hotkey.quicktag",
			Review: "settings.hotkey.review",
		};
		return t(map[group]);
	};

	return (
		<Aux>
			<div className="settings-hotkey-filter">
				<TextInput
					type="text"
					placeholder={t("settings.filterShortcuts")}
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					style={{ width: "100%" }}
				/>
			</div>
			{GROUPS.map((group) => {
				const defs = allBindings.filter(
					(d) =>
						d.group === group &&
						(!lower ||
							hotkeyLabel(d.action).toLowerCase().includes(lower) ||
							getBinding(d.action).toLowerCase().includes(lower)),
				);
				if (defs.length === 0) return null;
				return (
					<div key={group}>
						<h3 className="settings-group">{groupTitle(group)}</h3>
						<table className="settings-hotkey-table">
							<thead>
								<tr>
									<th>{t("settings.action")}</th>
									<th>{t("settings.binding")}</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{defs.map((d) => (
									<HotkeyRow
										key={d.action}
										action={d.action}
										flash={flash === d.action}
										onJump={jumpTo}
									/>
								))}
							</tbody>
						</table>
					</div>
				);
			})}
			<div style={{ marginTop: ".5rem" }}>
				<Button onClick={resetAllBindings}>{t("common.resetAllDefaults")}</Button>
			</div>
		</Aux>
	);
}

function StreetViewBody() {
	const { t } = useT();
	const s = useSettings();
	const controls: { key: keyof typeof s; label: string }[] = [
		{ key: "showFullscreenButton", label: t("settings.showFullscreenButton") },
		{ key: "showScreenshotButton", label: t("settings.showScreenshotButton") },
		{ key: "showJumpButtons", label: t("settings.showJumpButtons") },
		{ key: "showCompass", label: t("settings.showCompass") },
		{ key: "showCompassTape", label: t("settings.showCompassTape") },
		{ key: "showZoom", label: t("settings.showZoom") },
		{ key: "showReturnToSpawn", label: t("settings.showReturnToSpawn") },
		{ key: "showMapLinks", label: t("settings.showMapLinks") },
		{ key: "showCoordinateDisplay", label: t("settings.showCoordinateDisplay") },
		{ key: "showPanoMetadata", label: t("settings.showPanoMetadata") },
	];
	const movementOptions = localizeOptions(MOVEMENT_MODES, (k) =>
		t(`settings.movement.${k}` as MessageKey),
	);
	const exactDateOptions = localizeOptions(EXACT_DATE_FORMATS, (k) =>
		t(`settings.exactDate.${k}` as MessageKey),
	);
	const dateTzOptions = localizeOptions(DATE_TIMEZONES, (k) =>
		t(`settings.dateTimezone.${k}` as MessageKey),
	);
	const geocodeOptions = localizeOptions(GEOCODE_PROVIDERS, (k) =>
		t(`settings.geocode.${k}` as MessageKey),
	);

	return (
		<>
			<GroupHeading>{t("settings.group.navigation")}</GroupHeading>
			<SettingRow setting="showLinksControl" label={t("settings.showLinksControl")} />
			<SettingRow setting="clickToGo" label={t("settings.clickToGo")} />
			{s.clickToGo && (
				<>
					<SettingRow sub setting="showNavArrow" label={t("settings.showNavArrow")} />
					<SettingRow sub setting="showGroundArrow" label={t("settings.showGroundArrow")} />
				</>
			)}
			<SettingRow
				setting="hideNavWithUI"
				label={t("settings.hideNavWithUI")}
				description={t("settings.hideNavWithUIDesc")}
			/>
			<SettingRow setting="showRoadLabels" label={t("settings.showRoadLabels")} />
			<SettingRow setting="showCar" label={t("settings.showCar")} />
			<SettingRow setting="showCrosshair" label={t("settings.showCrosshair")} />
			<SettingRow
				label={t("settings.defaultMovementMode")}
				control={<SettingSelect setting="defaultMovementMode" options={movementOptions} />}
			/>
			<SettingRow
				label={t("settings.panoLookSpeed")}
				control={
					<SettingSlider
						value={s.panoLookSpeed}
						min={1}
						max={10}
						step={1}
						onChange={(v) => setSetting("panoLookSpeed", v)}
					/>
				}
			/>
			<SettingRow
				label={t("settings.previewAspectRatio")}
				control={<SettingSelect setting="previewAspectRatio" options={PREVIEW_ASPECT_RATIOS} />}
			/>

			<GroupHeading>{t("settings.group.viewerControls")}</GroupHeading>
			{controls.map(({ key, label }) => (
				<SettingRow key={key} setting={key} label={label} />
			))}

			<GroupHeading>{t("settings.group.fullscreen")}</GroupHeading>
			<SettingRow setting="showFullscreenMinimap" label={t("settings.showFullscreenMinimap")} />
			<SettingRow
				sub
				disabled={!s.showFullscreenMinimap}
				label={t("settings.fullscreenMinimapCloseDelay")}
				description={t("settings.minimapCloseDelayDesc")}
				control={
					<SettingSlider
						value={s.fullscreenMinimapCloseDelay}
						min={0}
						max={1000}
						step={50}
						disabled={!s.showFullscreenMinimap}
						onChange={(v) => setSetting("fullscreenMinimapCloseDelay", v)}
						format={(v) => `${v}ms`}
					/>
				}
			/>
			<SettingRow setting="showFullscreenTagbar" label={t("settings.showFullscreenTagbar")} />
			<SettingRow
				setting="showFullscreenDatePicker"
				label={t("settings.showFullscreenDatePicker")}
			/>
			<SettingRow setting="showFullscreenReviewBar" label={t("settings.showFullscreenReviewBar")} />
			<SettingRow setting="showFullscreenGeocode" label={t("settings.showFullscreenGeocode")} />

			<GroupHeading>{t("settings.group.geocoding")}</GroupHeading>
			<SettingRow
				label={t("settings.geocodeProvider")}
				description={t("settings.geocodeProviderDesc")}
				control={<SettingSelect setting="geocodeProvider" options={geocodeOptions} />}
			/>
			{s.geocodeProvider === "nominatim" && (
				<>
					<Aux match="nominatim geocode reverse osm openstreetmap api key">
						<p className="settings-popup__warning">{t("settings.nominatimWarning")}</p>
					</Aux>
					<SettingRow
						sub
						label={t("settings.nominatimApiKey")}
						control={
							<TextInput
								type="text"
								value={s.nominatimApiKey}
								onChange={(e) => setSetting("nominatimApiKey", e.target.value)}
							/>
						}
					/>
				</>
			)}

			<GroupHeading>{t("settings.group.datePicker")}</GroupHeading>
			<SettingRow setting="showCameraBadges" label={t("settings.showCameraBadges")} />
			<SettingRow
				label={t("settings.exactDateFormat")}
				control={<SettingSelect setting="exactDateFormat" options={exactDateOptions} />}
			/>
			<SettingRow
				label={t("settings.dateTimezone")}
				control={<SettingSelect setting="dateTimezone" options={dateTzOptions} />}
			/>
		</>
	);
}

function MarkersBody() {
	const { t } = useT();
	const s = useSettings();
	const opacityOptions = localizeOptions(OPACITY_TOGGLE_MODES, (k) =>
		t(`settings.opacityToggle.${k}` as MessageKey),
	);
	const polygonColorOptions = localizeOptions(POLYGON_COLOR_MODES, (k) =>
		t(`settings.polygonColor.${k}` as MessageKey),
	);
	return (
		<>
			<GroupHeading>{t("settings.group.fullscreen")}</GroupHeading>
			<SettingRow setting="showFullscreenMapMeta" label={t("settings.showFullscreenMapMeta")} />
			<SettingRow
				setting="showFullscreenMiniLocationPreview"
				label={t("settings.showFullscreenMiniLocationPreview")}
			/>

			<GroupHeading>{t("settings.group.navigation")}</GroupHeading>
			<SettingRow
				label={t("settings.mapPanSpeed")}
				control={
					<SettingSlider
						value={s.mapPanSpeed}
						min={1}
						max={20}
						step={1}
						onChange={(v) => setSetting("mapPanSpeed", v)}
					/>
				}
			/>
			<SettingRow setting="panToImported" label={t("settings.panToImported")} />
			<SettingRow
				sub
				disabled={!s.panToImported}
				label={t("settings.pastePadding")}
				control={
					<SettingSlider
						value={s.pastePadding}
						min={0.001}
						max={0.05}
						step={0.001}
						disabled={!s.panToImported}
						onChange={(v) => setSetting("pastePadding", v)}
						format={(v) => `${v.toFixed(3)}°`}
					/>
				}
			/>
			<SettingRow
				label={t("settings.slowModifier")}
				description={t("settings.altSlowDesc")}
				control={
					<SettingSlider
						value={s.slowModifier}
						min={2}
						max={10}
						step={1}
						onChange={(v) => setSetting("slowModifier", v)}
						format={(v) => `${v}x`}
					/>
				}
			/>

			<SettingRow
				label={t("settings.opacityToggleMode")}
				description={t("settings.opacityToggleDesc")}
				control={<SettingSelect setting="opacityToggleMode" options={opacityOptions} />}
			/>

			<GroupHeading>{t("settings.group.markers")}</GroupHeading>
			<SettingRow
				label={t("settings.markerColor")}
				control={
					<ColorPicker
						color={s.markerColor}
						onChange={(color) => setSetting("markerColor", color)}
						ariaLabel={t("settings.markerColor")}
					/>
				}
			/>
			<SettingRow
				label={t("settings.activeLocationColor")}
				control={
					<ColorPicker
						color={s.activeLocationColor}
						onChange={(color) => setSetting("activeLocationColor", color)}
						ariaLabel={t("settings.activeLocationColor")}
					/>
				}
			/>
			<SettingRow
				label={t("settings.importPreviewColor")}
				control={
					<ColorPicker
						color={s.importPreviewColor}
						onChange={(color) => setSetting("importPreviewColor", color)}
						ariaLabel={t("settings.importPreviewColor")}
					/>
				}
			/>
			<SettingRow
				setting="followActiveInReview"
				label={t("settings.followActiveInReview")}
			/>

			<GroupHeading>{t("settings.group.panoramaDots")}</GroupHeading>
			<SettingRow
				label={t("settings.panoDotColor")}
				control={
					<ColorPicker
						color={s.panoDotColor}
						onChange={(color) => setSetting("panoDotColor", color)}
						ariaLabel={t("settings.panoDotColor")}
					/>
				}
			/>
			<SettingRow
				label={t("settings.panoDotScaled")}
				control={
					<NSelect
						value={s.panoDotScaled ? "scaled" : "constant"}
						onChange={(e) => setSetting("panoDotScaled", e.target.value === "scaled")}
					>
						<option value="constant">{t("settings.panoDot.constant")}</option>
						<option value="scaled">{t("settings.panoDot.scaled")}</option>
					</NSelect>
				}
			/>

			<GroupHeading>{t("settings.group.selections")}</GroupHeading>
			<SettingRow
				label={t("settings.polygonColor")}
				control={
					<span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
						<SettingSelect setting="polygonColorMode" options={polygonColorOptions} />
						{s.polygonColorMode === "fixed" && (
							<ColorPicker
								color={s.polygonColor}
								onChange={(color) => setSetting("polygonColor", color)}
								ariaLabel={t("settings.polygonColor")}
							/>
						)}
					</span>
				}
			/>

			<BorderDetailGroup />
		</>
	);
}

function BorderDetailGroup() {
	const { t } = useT();
	const s = useSettings();
	const borderOptions = localizeOptions(BORDER_DETAILS, (k) =>
		t(`settings.border.${k}` as MessageKey),
	);
	const subdivisionOptions = localizeOptions(SUBDIVISION_DETAILS, (k) =>
		t(`settings.subdivision.${k}` as MessageKey),
	);
	const [mediumReady, setMediumReady] = useState<boolean | null>(null);
	const [heavyReady, setHeavyReady] = useState<boolean | null>(null);
	const [adm1Ready, setAdm1Ready] = useState<boolean | null>(null);
	const [downloading, setDownloading] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const [m, h, a] = await Promise.all([
				cmd.checkBorderFile("medium").catch(() => false),
				cmd.checkBorderFile("heavy").catch(() => false),
				cmd.checkBorderFile("adm1").catch(() => false),
			]);
			if (!cancelled) {
				setMediumReady(m);
				setHeavyReady(h);
				setAdm1Ready(a);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleChange = async (level: BorderDetail) => {
		setError(null);
		if (level === "light") {
			setSetting("borderDetail", level);
			return;
		}
		const isReady = level === "medium" ? mediumReady : heavyReady;
		if (isReady) {
			setSetting("borderDetail", level);
			return;
		}
		setDownloading(level);
		try {
			await cmd.downloadBorderFile(level);
			if (level === "medium") setMediumReady(true);
			else setHeavyReady(true);
			setSetting("borderDetail", level);
		} catch (e) {
			setError(
				t("settings.borderDownloadFailed", {
					message: e instanceof Error ? e.message : String(e),
				}),
			);
		} finally {
			setDownloading(null);
		}
	};

	const handleSubdivisionChange = async (level: SubdivisionDetail) => {
		setError(null);
		if (level === "off" || adm1Ready) {
			setSetting("subdivisionDetail", level);
			return;
		}
		setDownloading(level);
		try {
			await cmd.downloadBorderFile(level);
			setAdm1Ready(true);
			setSetting("subdivisionDetail", level);
		} catch (e) {
			setError(
				t("settings.borderDownloadFailed", {
					message: e instanceof Error ? e.message : String(e),
				}),
			);
		} finally {
			setDownloading(null);
		}
	};

	const statusLabel = (level: "medium" | "heavy") => {
		if (downloading === level) return t("settings.downloading");
		const ready = level === "medium" ? mediumReady : heavyReady;
		if (ready === null) return "";
		return ready ? "" : t("settings.willDownload");
	};

	const subdivisionStatus = () => {
		if (downloading === "adm1") return t("settings.downloading");
		if (adm1Ready === null) return "";
		return adm1Ready ? "" : t("settings.adm1WillDownload");
	};

	return (
		<>
			<GroupHeading>{t("settings.group.borders")}</GroupHeading>
			<SettingRow
				label={t("settings.borderDetail")}
				control={
					<NSelect
						className="nselect--compact"
						value={s.borderDetail}
						onChange={(e) => handleChange(e.target.value as BorderDetail)}
						disabled={downloading !== null}
					>
						{Object.entries(borderOptions).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
								{value !== "light" && statusLabel(value as "medium" | "heavy")}
							</option>
						))}
					</NSelect>
				}
			/>
			<SettingRow
				label={t("settings.subdivisionDetail")}
				control={
					<NSelect
						className="nselect--compact"
						value={s.subdivisionDetail}
						onChange={(e) => handleSubdivisionChange(e.target.value as SubdivisionDetail)}
						disabled={downloading !== null}
					>
						{Object.entries(subdivisionOptions).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
								{value !== "off" && subdivisionStatus()}
							</option>
						))}
					</NSelect>
				}
			/>
			{(downloading || error) && (
				<Aux>
					{downloading && (
						<p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", opacity: 0.7 }}>
							{t("settings.downloadingBorders")}
						</p>
					)}
					{error && <p className="settings-popup__warning">{error}</p>}
				</Aux>
			)}
		</>
	);
}

function TagsBody() {
	const { t } = useT();
	const s = useSettings();
	const tagViewOptions = localizeOptions(TAG_VIEW_MODES, (k) =>
		t(`settings.tagView.${k}` as MessageKey),
	);
	const tagFolderColorOptions = localizeOptions(TAG_FOLDER_COLOR_MODES, (k) =>
		t(`settings.tagFolderColor.${k}` as MessageKey),
	);
	const limitIndex = Math.max(
		0,
		(TAG_SUGGESTION_LIMITS as readonly number[]).indexOf(s.tagSuggestionLimit),
	);
	return (
		<>
			<GroupHeading>{t("settings.group.tags")}</GroupHeading>
			<SettingRow
				label={t("settings.tagViewMode")}
				control={<SettingSelect setting="tagViewMode" options={tagViewOptions} />}
			/>
			<SettingRow
				sub
				label={t("settings.tagFolderColor")}
				control={
					<span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
						<SettingSelect setting="tagFolderColorMode" options={tagFolderColorOptions} />
						{s.tagFolderColorMode === "direct" && (
							<ColorPicker
								color={s.tagFolderColor}
								onChange={(color) => setSetting("tagFolderColor", color)}
								ariaLabel={t("settings.tagFolderColor")}
							/>
						)}
					</span>
				}
			/>
			<SettingRow
				sub
				setting="truncateTagPaths"
				label={t("settings.truncateTagPaths")}
			/>
			<SettingRow setting="animateTagReorder" label={t("settings.animateTagReorder")} />
			<SettingRow
				label={t("settings.tagGap")}
				control={
					<SettingSlider
						value={s.tagGap}
						min={0}
						max={16}
						step={1}
						onChange={(v) => setSetting("tagGap", v)}
						format={(v) => `${v}px`}
					/>
				}
			/>
			<SettingRow
				label={t("settings.tagSuggestionLimit")}
				control={
					<SettingSlider
						value={limitIndex}
						min={0}
						max={TAG_SUGGESTION_LIMITS.length - 1}
						step={1}
						onChange={(v) => setSetting("tagSuggestionLimit", TAG_SUGGESTION_LIMITS[v])}
						format={() =>
							s.tagSuggestionLimit === 0 ? t("common.all") : String(s.tagSuggestionLimit)
						}
					/>
				}
			/>
		</>
	);
}

function EditingBody() {
	const { t } = useT();
	const s = useSettings();
	const seenResolutionOptions = localizeOptions(SEEN_RESOLUTIONS, (k) =>
		t(`settings.seen.${k}` as MessageKey),
	);
	return (
		<>
			<GroupHeading>{t("settings.group.seen")}</GroupHeading>
			<SettingRow setting="enableSeen" label={t("settings.enableSeen")} />
			{s.enableSeen && (
				<>
					<SettingRow sub setting="enableSeenThumbnails" label={t("settings.enableSeenThumbnails")} />
					{s.enableSeenThumbnails && (
						<SettingRow
							sub
							label={t("settings.seenResolution")}
							control={<SettingSelect setting="seenResolution" options={seenResolutionOptions} />}
						/>
					)}
				</>
			)}
		</>
	);
}

function MapListBlock() {
	const { t } = useT();
	const s = useSettings();
	const fields = s.mapListFields;

	const toggle = (field: MapListField) => {
		if (fields.includes(field)) {
			setSetting(
				"mapListFields",
				fields.filter((f) => f !== field),
			);
		} else {
			setSetting("mapListFields", [...fields, field]);
		}
	};

	return (
		<Aux match="map list fields columns row">
			<p className="text-muted" style={{ margin: "0.25rem 0", fontSize: "0.85rem" }}>
				{t("settings.mapListFieldsHint")}
			</p>
			{Object.keys(MAP_LIST_FIELDS).map((value) => (
				<label key={value} className="settings-checkbox-item">
					<Checkbox
						checked={fields.includes(value as MapListField)}
						onChange={() => toggle(value as MapListField)}
					/>
					{t(`settings.mapList.${value}` as MessageKey)}
				</label>
			))}
		</Aux>
	);
}

declare const __APP_VERSION__: string;

function UpdateBlock() {
	const { t } = useT();
	const update = useUpdateState();
	const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
	const checking = update.phase === "checking";
	const badgeMod = update.phase === "up-to-date" ? " settings-updates__version--latest" : "";
	const status =
		update.phase === "available"
			? t("settings.versionAvailable", { version: update.version ?? "" })
			: update.phase === "error"
				? (update.error ?? t("settings.update.checkFailed"))
				: update.phase === "idle"
					? t("settings.update.idle")
					: update.phase === "checking"
						? t("settings.update.checking")
						: update.phase === "up-to-date"
							? t("settings.update.upToDate")
							: update.phase === "downloading"
								? t("settings.update.downloading")
								: t("settings.updateInstalled");

	return (
		<Aux match="update version check release restart install">
			<div className="settings-aux__col">
				<div className="settings-aux__row">
					<span
						className={`settings-updates__version${badgeMod}`}
						title={status}
						aria-label={status}
					>
						v{version}
					</span>
					<button
						className="icon-button settings-updates__check"
						onClick={checkForUpdate}
						disabled={checking || update.phase === "downloading"}
						title={t("settings.checkForUpdates")}
						aria-label={t("settings.checkForUpdates")}
					>
						<Icon
							path={mdiRefresh}
							size={18}
							className={checking ? "settings-updates__spin" : undefined}
						/>
					</button>
					{(update.phase === "error" || update.phase === "up-to-date") && (
						<span className="text-muted" style={{ fontSize: "0.8rem" }}>
							{status}
						</span>
					)}
				</div>
				{update.phase === "available" && (
					<div className="settings-aux__col">
						<span>{t("settings.versionAvailable", { version: update.version ?? "" })}</span>
						{update.notes && (
							<pre
								style={{
									maxHeight: 120,
									overflow: "auto",
									fontSize: 12,
									whiteSpace: "pre-wrap",
									margin: 0,
								}}
							>
								{update.notes}
							</pre>
						)}
						<Button variant="primary" onClick={installUpdate}>
							{t("settings.downloadAndInstall")}
						</Button>
					</div>
				)}
				{update.phase === "downloading" && (
					<div className="settings-aux__row">
						<progress value={update.percent} max={100} style={{ flex: 1 }} />
						<span>{update.percent}%</span>
					</div>
				)}
				{update.phase === "ready" && (
					<div className="settings-aux__row">
						<span>{t("settings.updateInstalled")}</span>
						<Button variant="primary" onClick={relaunchApp}>
							{t("settings.restartNow")}
						</Button>
					</div>
				)}
			</div>
		</Aux>
	);
}

function ApplicationBody() {
	const { t } = useT();
	const language = useSetting("language");
	const languageOptions = localizeOptions(LOCALES, (k) => t(`locale.${k}` as MessageKey));

	return (
		<>
			<GroupHeading>{t("settings.group.language")}</GroupHeading>
			<SettingRow
				label={t("settings.language")}
				description={t("settings.languageDesc")}
				control={
					<NSelect
						className="nselect--compact"
						value={language}
						onChange={(e) => setSetting("language", e.target.value as AppLocale)}
					>
						{Object.entries(languageOptions).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</NSelect>
				}
			/>

			<GroupHeading>{t("settings.group.startup")}</GroupHeading>
			<SettingRow setting="restoreSession" label={t("settings.restoreSession")} />

			<GroupHeading>{t("settings.group.mapList")}</GroupHeading>
			<MapListBlock />

			<GroupHeading>{t("settings.group.updates")}</GroupHeading>
			<UpdateBlock />

			<GroupHeading>{t("settings.group.data")}</GroupHeading>
			<DataBody />
		</>
	);
}

function CustomCssBlock() {
	const { t } = useT();
	const s = useSettings();
	return (
		<Aux match="custom css stylesheet style theme">
			<textarea
				className="settings-css-editor"
				value={s.customCss}
				onChange={(e) => setSetting("customCss", e.target.value)}
				placeholder={t("settings.customCssPlaceholder")}
				spellCheck={false}
			/>
		</Aux>
	);
}

function generateApiKey(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function IntegrationsBody() {
	const { t } = useT();
	const enabled = useSetting("remoteApi");
	const key = useSetting("remoteApiKey");
	const discordOptions = localizeOptions(DISCORD_PRESENCE_MODES, (k) =>
		t(`settings.discord.${k}` as MessageKey),
	);
	return (
		<>
			<GroupHeading>{t("settings.group.discord")}</GroupHeading>
			<SettingRow
				label={t("settings.discordPresence")}
				control={<SettingSelect setting="discordPresence" options={discordOptions} />}
			/>

			<GroupHeading>{t("settings.group.remoteApi")}</GroupHeading>
			<SettingRow
				checked={enabled}
				onChange={(v) => {
					if (v && !key) setSetting("remoteApiKey", generateApiKey());
					setSetting("remoteApi", v);
				}}
				label={t("settings.remoteApi")}
			/>
			{enabled && (
				<Aux match="api key regenerate remote token">
					<div className="settings-aux__row">
						<TextInput
							type="text"
							readOnly
							className="mono"
							value={key}
							style={{ flex: 1 }}
							onFocus={(e) => e.target.select()}
						/>
						<Button onClick={() => setSetting("remoteApiKey", generateApiKey())}>
							{t("common.regenerate")}
						</Button>
					</div>
				</Aux>
			)}
		</>
	);
}

function DataBody() {
	const { t } = useT();
	const [loc, setLoc] = useState<DataLocation | null>(null);
	// undefined = no dialog; string = chosen folder; null = reset to default.
	const [pending, setPending] = useState<string | null | undefined>(undefined);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		cmd
			.getDataLocation()
			.then(setLoc)
			.catch(() => {});
	}, []);

	const pick = useCallback(async () => {
		const picked = await openDialog({ directory: true, title: t("settings.chooseDataFolder") });
		if (typeof picked === "string") setPending(picked);
	}, [t]);

	const apply = useCallback(async () => {
		setBusy(true);
		try {
			await cmd.setDataLocation(pending ?? null);
			await relaunchApp();
		} catch (e) {
			log.error("data folder relaunch failed", e);
			toast(t("toast.relaunchFailed"));
			setBusy(false);
		}
	}, [pending, t]);

	const target = pending ?? loc?.default_path ?? "";

	return (
		<Aux match="data location folder storage">
			<code style={{ display: "block", wordBreak: "break-all", marginBottom: 8 }}>
				{loc?.path ?? "..."}
			</code>
			<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
				<Button onClick={pick}>{t("settings.changeFolder")}</Button>
				<Button onClick={() => cmd.openDataFolder()}>{t("settings.openDataFolder")}</Button>
				{loc?.is_custom && (
					<Button onClick={() => setPending(null)}>{t("common.resetToDefault")}</Button>
				)}
			</div>

			<Dialog open={pending !== undefined} onOpenChange={(o) => !o && setPending(undefined)}>
				<DialogContent title={t("dialog.changeDataFolder")}>
					<p>{t("settings.dataFolderPrompt")}</p>
					<code style={{ display: "block", wordBreak: "break-all", margin: "8px 0" }}>
						{target}
					</code>
					<p className="text-muted">{t("settings.dataFolderWarning")}</p>
					<div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
						<Button onClick={() => setPending(undefined)} disabled={busy}>
							{t("common.cancel")}
						</Button>
						<Button variant="primary" onClick={apply} disabled={busy}>
							{t("settings.relaunchNow")}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</Aux>
	);
}

function AdvancedBody() {
	const { t } = useT();
	return (
		<>
			<GroupHeading>{t("settings.group.customCss")}</GroupHeading>
			<CustomCssBlock />

			<GroupHeading>{t("settings.group.debug")}</GroupHeading>
			<SettingRow setting="showFps" label={t("settings.showFps")} />
			<Aux match="log file logs diagnostics">
				<div style={{ display: "flex", gap: 8 }}>
					<Button onClick={() => cmd.openLogFile()}>{t("settings.openLogFile")}</Button>
				</div>
			</Aux>
		</>
	);
}

type Section = {
	id: string;
	titleKey: MessageKey;
	Body: () => ReactNode;
};

const SECTIONS: Section[] = [
	{ id: "keyboard", titleKey: "settings.section.keyboard", Body: KeyboardBody },
	{ id: "streetview", titleKey: "settings.section.streetView", Body: StreetViewBody },
	{ id: "map", titleKey: "settings.section.map", Body: MarkersBody },
	{ id: "tags", titleKey: "settings.section.tags", Body: TagsBody },
	{ id: "editing", titleKey: "settings.section.editing", Body: EditingBody },
	{ id: "application", titleKey: "settings.section.application", Body: ApplicationBody },
	{ id: "integrations", titleKey: "settings.section.integrations", Body: IntegrationsBody },
	{ id: "advanced", titleKey: "settings.section.advanced", Body: AdvancedBody },
];

function SectionShell({
	section,
	mode,
	query,
	hidden,
}: {
	section: Section;
	mode: "single" | "search";
	query: string;
	hidden?: boolean;
}) {
	const { t } = useT();
	const title = t(section.titleKey);
	const sectionMatched =
		mode === "single" || query === "" || title.toLowerCase().includes(query);
	const Body = section.Body;
	return (
		<SettingsSearchContext.Provider value={{ query, searching: mode === "search", sectionMatched }}>
			<section
				className={`settings-section${mode === "search" ? " settings-section--search" : ""}`}
				data-qa={`settings-section-${section.id}`}
				style={hidden ? { display: "none" } : undefined}
			>
				<div className="settings-section__head">
					<h2 className="settings-section__title">{title}</h2>
				</div>
				<Body />
			</section>
		</SettingsSearchContext.Provider>
	);
}

export function SettingsPage({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useT();
	const [selected, setSelected] = useState<string>(SECTIONS[0].id);
	const [query, setQuery] = useState("");
	const q = query.trim().toLowerCase();
	const searching = q !== "";

	useEffect(() => {
		if (open) setQuery("");
	}, [open]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent title={t("dialog.settings")} className="settings-page">
				<nav className="settings-rail">
					<TextInput
						type="text"
						className="settings-rail__search"
						placeholder={t("settings.searchPlaceholder")}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape" && query) {
								e.stopPropagation();
								setQuery("");
							}
						}}
					/>
					<div className="settings-nav-list">
						{SECTIONS.map((s) => (
							<button
								key={s.id}
								type="button"
								data-qa={`settings-nav-${s.id}`}
								className={`settings-nav-item${!searching && s.id === selected ? " settings-nav-item--active" : ""}`}
								onClick={() => {
									setSelected(s.id);
									setQuery("");
								}}
							>
								{t(s.titleKey)}
							</button>
						))}
					</div>
				</nav>
				<div className={`settings-content${searching ? " settings-content--search" : ""}`}>
					{/* All sections stay mounted so search-mode transitions and section
					    switches never reset body state (hotkey recording, IPC-backed status). */}
					{SECTIONS.map((s) => (
						<SectionShell
							key={s.id}
							section={s}
							mode={searching ? "search" : "single"}
							query={searching ? q : ""}
							hidden={!searching && s.id !== selected}
						/>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
