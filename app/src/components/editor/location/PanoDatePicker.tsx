import { useEffect, useRef, useCallback, useMemo } from "react";
import { useActiveLocation, useCurrentMap, getActiveLocation, getCurrentMap, patchLocationExtra } from "@/store/useMapStore";
import { useSetting } from "@/store/settings";
import { useTimezone } from "@/lib/util/timezone";
import { isFieldEnabled } from "@/lib/data/fieldDefs";
import { dateFmt } from "@/lib/util/format";
import { type PanoReference, parsePanoDate } from "@/lib/sv/lookup";
import { useCameraType } from "./useCameraType";
import { useExactDate } from "./useExactDate";
import { usePanoViewer } from "./PanoViewerContext";
import * as Select from "@radix-ui/react-select";

function PanoBadge({ cameraType }: { cameraType: FullCameraType | null }) {
	switch (cameraType) {
		case "unofficial":
			return <span className="pano-option__badge badge badge--unofficial">unofficial</span>;
		case "gen1":
			return <span className="pano-option__badge badge badge--gen1">Gen1</span>;
		case "gen2":
			return <span className="pano-option__badge badge badge--gen2">Gen2/3</span>;
		case "gen4":
			return <span className="pano-option__badge badge badge--gen4">Gen4</span>;
		case "badcam":
			return <span className="pano-option__badge badge badge--badcam">Badcam</span>;
		case "tripod":
			return <span className="pano-option__badge badge badge--tripod">Tripod</span>;
		case "trekker":
			return <span className="pano-option__badge badge badge--rb">Trekker</span>;
		default:
			return null;
	}
}

function PanoOption({ pano }: { pano: PanoReference }) {
	const showBadges = useSetting("showCameraBadges");
	const cameraType = useCameraType(pano.pano);
	return (
		<Select.Item value={pano.pano} className="select__option pano-option">
			<Select.ItemText>
				<span className="pano-option__name">{dateFmt.format(pano.date)}</span>
				{(cameraType === "unofficial" || showBadges) && <PanoBadge cameraType={cameraType} />}
			</Select.ItemText>
		</Select.Item>
	);
}

export function PanoDatePicker({
	defaultPanoId,
	onChange,
}: {
	defaultPanoId: string | null;
	onChange: (panoId: string | null) => void;
}) {
	const { currentPano, panoDates, selectedPanoId } = usePanoViewer();
	const location = useActiveLocation();
	const lat = currentPano?.location?.latLng?.lat() ?? location?.lat ?? 0;
	const lng = currentPano?.location?.latLng?.lng() ?? location?.lng ?? 0;
	const defaultEntry = panoDates.find((d) => d.pano === defaultPanoId);
	const resolvedEntry = currentPano?.location
		? panoDates.find((d) => d.pano === currentPano.location!.pano)
		: undefined;
	const sorted = useMemo(
		() => [...panoDates].sort((a, b) => a.date.getTime() - b.date.getTime()),
		[panoDates],
	);
	const currentEntry =
		selectedPanoId == null
			? (defaultEntry ?? resolvedEntry)
			: sorted.find((d) => d.pano === selectedPanoId);
	const isDefault = selectedPanoId == null;
	const displayDate =
		currentEntry?.date ??
		(isDefault && currentPano?.imageDate ? parsePanoDate(currentPano.imageDate) : null);
	const prevLabelRef = useRef("");
	const displayLabel = displayDate
		? isDefault
			? `Default (${dateFmt.format(displayDate)})`
			: dateFmt.format(displayDate)
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
	const currentMap = useCurrentMap();
	const datetimeEnabled = isFieldEnabled(
		currentMap?.meta.settings.enrichFields ?? null,
		"datetime",
	);
	const exactDateFormat = useSetting("exactDateFormat");
	const dateTimezone = useSetting("dateTimezone");
	const triggerPanoId =
		currentEntry?.pano ??
		currentPano?.location?.pano ??
		sorted[sorted.length - 1]?.pano ??
		defaultPanoId;
	const triggerCameraType = useCameraType(triggerPanoId);

	const yearMonth = displayDate
		? `${displayDate.getFullYear()}-${String(displayDate.getMonth() + 1).padStart(2, "0")}`
		: null;
	const exactDate = useExactDate(triggerPanoId, lat, lng, yearMonth, datetimeEnabled);
	const resolvedTz = useTimezone(lat, lng, datetimeEnabled && dateTimezone === "location");
	const tzOption = dateTimezone === "utc" ? "UTC" : (resolvedTz ?? undefined);
	const exactLabel = exactDate.ts
		? exactDateFormat === "datetime"
			? new Date(exactDate.ts * 1000).toLocaleString("en-US", {
					year: "numeric",
					month: "short",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit",
					timeZone: tzOption,
				})
			: new Date(exactDate.ts * 1000).toLocaleDateString("en-US", {
					year: "numeric",
					month: "short",
					day: "numeric",
					timeZone: tzOption,
				})
		: null;

	useEffect(() => {
		if (exactDate.ts == null) return;
		if (!(getCurrentMap()?.meta.settings.enrichMetadata ?? true)) return;
		const loc = getActiveLocation();
		if (!loc || loc.extra?.datetime != null) return;
		patchLocationExtra(loc, { datetime: exactDate.ts, timezone: resolvedTz });
	}, [exactDate.ts, resolvedTz]);

	if (sorted.length === 0) {
		return (
			<Select.Root disabled>
				<Select.Trigger className="select__input">
					<Select.Value placeholder="No dates" />
				</Select.Trigger>
			</Select.Root>
		);
	}

	return (
		<Select.Root value={selectedPanoId ?? "default"} onValueChange={handleValueChange}>
			<Select.Trigger className="select__input">
				<Select.Value>
					<span className="pano-value">
						{exactDate.loading ? displayLabel : (exactLabel ?? displayLabel)}
						<span style={{ display: "flex", gap: 4, alignItems: "center" }}>
							{exactDate.loading && <span className="badge badge--loading">...</span>}
							{(triggerCameraType === "unofficial" || showBadges) && (
								<PanoBadge cameraType={triggerCameraType} />
							)}
						</span>
						<span className="badge badge--number">{sorted.length}</span>
					</span>
				</Select.Value>
			</Select.Trigger>
			<Select.Portal>
				<Select.Content
					className="select__content"
					position="popper"
					side="top"
				>
					<Select.Viewport>
						<Select.Group>
							<Select.Label className="select__group-header">Specific Panorama</Select.Label>
							{sorted.map((d) => (
								<PanoOption key={d.pano} pano={d} />
							))}
						</Select.Group>
						<Select.Group>
							<Select.Label className="select__group-header">Default / auto-updating</Select.Label>
							<Select.Item value="default" className="select__option pano-option">
								<Select.ItemText>
									<span className="pano-option__name">
										Default
										{(defaultEntry?.date ?? sorted[sorted.length - 1]?.date)
											? ` (${dateFmt.format((defaultEntry?.date ?? sorted[sorted.length - 1]?.date)!)})`
											: ""}
									</span>
								</Select.ItemText>
							</Select.Item>
						</Select.Group>
					</Select.Viewport>
				</Select.Content>
			</Select.Portal>
		</Select.Root>
	);
}
