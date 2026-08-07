import { memo, useRef, useCallback } from "react";
import { useSetting } from "@/store/settings";
import { dateFmt, panoDayFmt } from "@/lib/util/format";
import { type PanoReference } from "@/lib/sv/lookup";
import { findPanoProvider, type PanoCameraBadge } from "@/lib/sv/panoProvider";
import { getLocationProvider } from "@/lib/sv/providers/types";
import { useCameraType, type DisplayCameraBadge, type BuiltinCameraType } from "./useCameraType";
import { usePanoViewer } from "./PanoViewerContext";
import { NSelect } from "@/components/primitives/NSelect";
import { useMapState } from "@/store/useMapStore";
import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/locales/en";

function BuiltinBadge({ type }: { type: BuiltinCameraType }) {
	const { t } = useT();
	const badgeKeys: Record<BuiltinCameraType, MessageKey | null> = {
		unofficial: "editor.badgeUnofficial",
		gen1: "editor.badgeGen1",
		gen2: "editor.badgeGen2",
		gen4: "editor.badgeGen4",
		badcam: "editor.badgeBadcam",
		tripod: "editor.badgeTripod",
		trekker: "editor.badgeTrekker",
	};
	const key = badgeKeys[type];
	if (!key) return null;
	const className =
		type === "unofficial"
			? "badge--unofficial"
			: type === "gen1"
				? "badge--gen1"
				: type === "gen2"
					? "badge--gen2"
					: type === "gen4"
						? "badge--gen4"
						: type === "badcam"
							? "badge--badcam"
							: type === "tripod"
								? "badge--tripod"
								: "badge--rb";
	return <span className={`pano-option__badge badge ${className}`}>{t(key)}</span>;
}

function ProviderBadge({ badge }: { badge: PanoCameraBadge }) {
	return (
		<span className={`pano-option__badge badge ${badge.className ?? "badge--provider"}`}>
			{badge.label}
		</span>
	);
}

function PanoBadge({ camera }: { camera: DisplayCameraBadge | null }) {
	if (!camera) return null;
	if (camera.source === "provider") return <ProviderBadge badge={camera.badge} />;
	return <BuiltinBadge type={camera.type} />;
}

function shouldShowBadge(
	camera: DisplayCameraBadge | null,
	showBadges: boolean,
): boolean {
	if (!camera) return false;
	if (camera.source === "provider") return true;
	return camera.type === "unofficial" || showBadges;
}

function PanoOption({
	pano,
	dayLevel,
}: {
	pano: PanoReference;
	dayLevel: boolean;
}) {
	const showBadges = useSetting("showCameraBadges");
	const camera = useCameraType(pano.pano);
	const fmt = dayLevel ? panoDayFmt : dateFmt;
	return (
		<option value={pano.pano} className="pano-option">
			<span className="pano-option__name">{fmt.format(pano.date)}</span>
			{shouldShowBadge(camera, showBadges) && <PanoBadge camera={camera} />}
		</option>
	);
}

export const PanoDatePicker = memo(function PanoDatePicker({
	onChange,
}: {
	onChange: (panoId: string | null) => void;
}) {
	const { t } = useT();
	const location = useMapState((s) => s.activeLocation);
	const provider = location ? findPanoProvider(location) : null;
	// Baidu uses native Google SV lifecycle (no MMA PanoProvider) but has day-level dates.
	const dayLevel =
		provider?.dateGranularity === "day" ||
		getLocationProvider(location) === "baidu" ||
		getLocationProvider(location) === "tencent" ||
		getLocationProvider(location) === "yandex";
	const { selectedPanoId, dateState, exactDate, resolvedTz } = usePanoViewer();
	const { defaultEntry, sorted, isDefault, displayDate, triggerPanoId } = dateState;
	const prevLabelRef = useRef("");

	const fmt = dayLevel ? panoDayFmt : dateFmt;
	const displayLabel = displayDate
		? isDefault
			? t("editor.defaultWithDate", { date: fmt.format(displayDate) })
			: fmt.format(displayDate)
		: prevLabelRef.current;
	if (displayLabel) prevLabelRef.current = displayLabel;

	const handleValueChange = useCallback(
		(value: string) => {
			if (value === "default") onChange(null);
			else onChange(value);
		},
		[onChange],
	);

	const showBadges = useSetting("showCameraBadges");
	const exactDateFormat = useSetting("exactDateFormat");
	const dateTimezone = useSetting("dateTimezone");
	const triggerCamera = useCameraType(triggerPanoId);
	const tzOption = dateTimezone === "utc" ? "UTC" : (resolvedTz ?? undefined);
	const locale = dayLevel ? "en-GB" : "en-US";
	const exactLabel = exactDate.ts
		? exactDateFormat === "datetime"
			? new Date(exactDate.ts * 1000).toLocaleString(locale, {
					year: "numeric",
					month: "short",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit",
					timeZone: tzOption,
				})
			: new Date(exactDate.ts * 1000).toLocaleDateString(locale, {
					year: "numeric",
					month: "short",
					day: "numeric",
					timeZone: tzOption,
				})
		: null;

	const triggerLabel = exactDate.loading ? displayLabel : (exactLabel ?? displayLabel);
	const hasAnything = Boolean(triggerLabel) || sorted.length > 0;

	if (!hasAnything) {
		return (
			<NSelect className="pano-date-select" disabled>
				<button type="button" className="pano-date-select__trigger">
					<span className="pano-value">{t("editor.noDates")}</span>
				</button>
			</NSelect>
		);
	}

	// Alt provider with only the current capture: still show Default + camera badge.
	if (sorted.length === 0) {
		return (
			<NSelect className="pano-date-select" disabled value="default">
				<button type="button" className="pano-date-select__trigger">
					<span className="pano-value">
						{triggerLabel ?? t("editor.defaultLabel")}
						<span style={{ display: "flex", gap: 4, alignItems: "center" }}>
							{shouldShowBadge(triggerCamera, showBadges) && (
								<PanoBadge camera={triggerCamera} />
							)}
						</span>
					</span>
				</button>
			</NSelect>
		);
	}

	const defaultDate =
		defaultEntry?.date ??
		(exactDate.ts != null ? new Date(exactDate.ts * 1000) : displayDate);

	return (
		<NSelect
			className="pano-date-select"
			data-side="top"
			value={selectedPanoId ?? "default"}
			onChange={(e) => {
				const select = e.currentTarget;
				handleValueChange(e.target.value);
				requestAnimationFrame(() => select.blur());
			}}
		>
			<button type="button" className="pano-date-select__trigger">
				<span className="pano-value">
					{triggerLabel}
					<span style={{ display: "flex", gap: 4, alignItems: "center" }}>
						{exactDate.loading && <span className="badge badge--loading">...</span>}
						{shouldShowBadge(triggerCamera, showBadges) && (
							<PanoBadge camera={triggerCamera} />
						)}
					</span>
					<span className="badge badge--number">{sorted.length}</span>
				</span>
			</button>
			<optgroup label={t("editor.specificPanorama")}>
				{sorted.map((d) => (
					<PanoOption key={d.pano} pano={d} dayLevel={dayLevel} />
				))}
			</optgroup>
			<optgroup label={t("editor.defaultAutoUpdating")}>
				<option value="default" className="pano-option">
					<span className="pano-option__name">
						{t("editor.defaultLabel")}
						{defaultDate ? ` (${fmt.format(defaultDate)})` : ""}
					</span>
				</option>
			</optgroup>
		</NSelect>
	);
});
