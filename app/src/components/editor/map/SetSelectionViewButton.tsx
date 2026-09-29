import { useState } from "react";
import { mdiCameraControl } from "@mdi/js";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { Button } from "@/components/primitives/Button";
import { TextInput } from "@/components/primitives/TextInput";
import { Icon } from "@/components/primitives/Icon";
import { Tooltip } from "@/components/primitives/Tooltip";
import { t } from "@/lib/i18n";
import { useEventValue } from "@/lib/events";
import { formatBinding } from "@/lib/hooks/useHotkey";
import { getBinding } from "@/lib/util/hotkeys";
import { toast } from "@/lib/util/toast";
import { planFieldSet } from "@/lib/data/fieldOps";
import { selectionViewPatch } from "@/lib/data/selectionView";
import { fetchLocations, getMapState, updateLocations, useMapState } from "@/store/useMapStore";

const LABEL = "Set heading, pitch, and zoom";

/** Toolbar icon for the batch camera edit. Hidden until a location is selected. */
export function SetSelectionViewButton({ onOpen }: { onOpen: () => void }) {
	const hasSelection = useMapState((s) => s.selectedLocationIds.size > 0);
	const binding = useEventValue("hotkeys:changed", () => getBinding("set-selection-view"));
	if (!hasSelection) return null;
	const tip = binding ? `${t(LABEL)} (${formatBinding(binding)})` : t(LABEL);
	return (
		<Tooltip content={tip} side="bottom">
			<button type="button" className="icon-button" aria-label={t(LABEL)} onClick={onOpen}>
				<Icon path={mdiCameraControl} />
			</button>
		</Tooltip>
	);
}

/** Write heading, pitch, and zoom onto every location in the current selection. */
export function SetSelectionViewDialog({ onClose }: { onClose: () => void }) {
	const count = useMapState((s) => s.selectedLocationIds.size);
	const [heading, setHeading] = useState("");
	const [pitch, setPitch] = useState("");
	const [zoom, setZoom] = useState("");
	const [busy, setBusy] = useState(false);
	const parsed = selectionViewPatch({ heading, pitch, zoom });

	const apply = async () => {
		if (!parsed.ok || busy) return;
		const ids = [...getMapState().selectedLocationIds];
		if (ids.length === 0) return;
		setBusy(true);
		try {
			const locs = await fetchLocations({ type: "Locations", locations: ids, name: null });
			const updates = planFieldSet(locs, parsed.patch);
			if (updates.length === 0) {
				toast(t("No locations needed a change."));
			} else {
				await updateLocations(updates);
				toast(
					t(
						{ one: "Updated {n} location.", other: "Updated {n} locations." },
						{ n: updates.length },
					),
				);
			}
			onClose();
		} catch (e) {
			toast(e instanceof Error ? e.message : t("Save failed"));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent title={t(LABEL)} className="bulk-operation-modal">
				<div className="bulk-operation">
					<p className="expand-sv-links-dialog__hint">
						{t(
							"Blank fields stay unchanged. Heading wraps to 0–360. Pitch is -90 to 90. Zoom is -3 to 4.",
						)}
					</p>
					<label className="bulk-operation__option">
						{t("Heading (°)")}
						<TextInput
							type="number"
							step="any"
							value={heading}
							disabled={busy}
							onChange={(e) => setHeading(e.target.value)}
							style={{ width: "6rem" }}
						/>
					</label>
					<label className="bulk-operation__option">
						{t("Pitch (°)")}
						<TextInput
							type="number"
							step="any"
							min={-90}
							max={90}
							value={pitch}
							disabled={busy}
							onChange={(e) => setPitch(e.target.value)}
							style={{ width: "6rem" }}
						/>
					</label>
					<label className="bulk-operation__option">
						{t("Zoom")}
						<TextInput
							type="number"
							step="any"
							min={-3}
							max={4}
							value={zoom}
							disabled={busy}
							onChange={(e) => setZoom(e.target.value)}
							style={{ width: "6rem" }}
						/>
					</label>
					{parsed.ok === false && parsed.reason === "heading" && (
						<div className="bulk-operation__status">{t("Heading must be a number.")}</div>
					)}
					{parsed.ok === false && parsed.reason === "pitch" && (
						<div className="bulk-operation__status">{t("Pitch must be between -90 and 90.")}</div>
					)}
					{parsed.ok === false && parsed.reason === "zoom" && (
						<div className="bulk-operation__status">{t("Zoom must be between -3 and 4.")}</div>
					)}
					<div className="bulk-operation__actions">
						<Button variant="primary" disabled={!parsed.ok || count === 0 || busy} onClick={() => void apply()}>
							{t("Apply")}
						</Button>
						<Button onClick={onClose}>{t("Close")}</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
