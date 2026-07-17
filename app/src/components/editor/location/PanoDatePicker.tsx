import { memo, useRef, useCallback } from "react";
import { useSetting } from "@/store/settings";
import { dateFmt } from "@/lib/util/format";
import { type PanoReference } from "@/lib/sv/lookup";
import { useCameraType } from "./useCameraType";
import { usePanoViewer } from "./PanoViewerContext";
import { NSelect } from "@/components/primitives/NSelect";

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
		<option value={pano.pano} className="pano-option">
			<span className="pano-option__name">{dateFmt.format(pano.date)}</span>
			{(cameraType === "unofficial" || showBadges) && <PanoBadge cameraType={cameraType} />}
		</option>
	);
}

export const PanoDatePicker = memo(function PanoDatePicker({
	onChange,
}: {
	onChange: (panoId: string | null) => void;
}) {
	const { selectedPanoId, dateState, exactDate, resolvedTz } = usePanoViewer();
	const { defaultEntry, sorted, isDefault, displayDate, triggerPanoId } = dateState;
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
	const exactDateFormat = useSetting("exactDateFormat");
	const dateTimezone = useSetting("dateTimezone");
	const triggerCameraType = useCameraType(triggerPanoId);
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

	if (sorted.length === 0) {
		return (
			<NSelect className="pano-date-select" disabled>
				<button type="button" className="pano-date-select__trigger">
					<span className="pano-value">No dates</span>
				</button>
			</NSelect>
		);
	}

	return (
		<NSelect
			className="pano-date-select"
			data-side="top"
			value={selectedPanoId ?? "default"}
			onChange={(e) => handleValueChange(e.target.value)}
		>
			<button type="button" className="pano-date-select__trigger">
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
			</button>
			<optgroup label="Specific Panorama">
				{sorted.map((d) => (
					<PanoOption key={d.pano} pano={d} />
				))}
			</optgroup>
			<optgroup label="Default / auto-updating">
				<option value="default" className="pano-option">
					<span className="pano-option__name">
						Default
						{(defaultEntry?.date ?? sorted[sorted.length - 1]?.date)
							? ` (${dateFmt.format((defaultEntry?.date ?? sorted[sorted.length - 1]?.date)!)})`
							: ""}
					</span>
				</option>
			</optgroup>
		</NSelect>
	);
});
