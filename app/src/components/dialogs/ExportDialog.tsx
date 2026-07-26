import { useState, useId } from "react";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { Button } from "@/components/primitives/Button";
import { Checkbox } from "@/components/primitives/Checkbox";
import { Radio } from "@/components/primitives/Radio";
import { TextInput } from "@/components/primitives/TextInput";
import { useMapState, getVisibleTags } from "@/store/useMapStore";
import type { Scope } from "@/bindings.gen";
import { useMapSetting } from "@/store/useMapSetting";
import { cmd } from "@/lib/commands";
import { mmaBufUrl, saveExportTempFile } from "@/lib/util/util";
import { getAllFieldDefs } from "@/lib/data/fieldDefRegistry";
import { fmt } from "@/lib/util/format";
import { toast } from "@/lib/util/toast";
import { log } from "@/lib/util/log";
import { useT } from "@/lib/i18n";

interface Props {
	onClose: () => void;
}

export function ExportDialog({ onClose }: Props) {
	const { t } = useT();
	const map = useMapState((s) => s.map);
	const selectedIds = useMapState((s) => s.selectedLocationIds);
	const locationCount = useMapState((s) => s.locationCount);
	const uid = useId();

	const [scope, setScope] = useState<Scope>({ kind: "all" });
	const [saveZoom, setSaveZoom] = useMapSetting("exportZoom");
	const [saveExtras, setSaveExtras] = useMapSetting("exportExtras");
	const [bypassUnpanned, setBypassUnpanned] = useMapSetting("exportUnpanned");
	const [fileName, setFileName] = useState(map?.meta.name ?? "");
	const selCount = selectedIds.size;

	if (!map) return null;

	const baseName = fileName || map.meta.name || "export";
	const scopeIds = scope.kind === "all" ? undefined : [...selectedIds];

	const tagsJson = () => JSON.stringify(Object.fromEntries(getVisibleTags().map((t) => [t.id, t])));

	const jsonPath = () =>
		cmd.storeExportJson({
			exportZoom: saveZoom,
			exportUnpanned: bypassUnpanned,
			exportExtras: saveExtras,
			scope: scopeIds ?? null,
			mapName: map.meta.name,
			tagsJson: tagsJson(),
			extraFieldsJson: JSON.stringify(getAllFieldDefs()),
		});
	const csvPath = () => cmd.storeExportCsv(scopeIds ?? null);
	const geojsonPath = () => cmd.storeExportGeojson(scopeIds ?? null, tagsJson());

	const saveToFile = (srcPath: string, ext: string) =>
		saveExportTempFile(srcPath, `${baseName}.${ext}`);

	const withFeedback = (run: () => Promise<boolean | void>, success: string) => async () => {
		try {
			const ok = await run();
			if (ok !== false) toast(success);
		} catch (e) {
			log.error("[export] failed:", e);
			toast(t("toast.exportFailed"));
		}
	};

	const copyJson = withFeedback(
		async () =>
			navigator.clipboard.writeText(await (await fetch(mmaBufUrl(await jsonPath()))).text()),
		t("toast.copiedJson"),
	);
	const downloadJson = withFeedback(
		async () => saveToFile(await jsonPath(), "json"),
		t("toast.downloadedFile", { name: `${baseName}.json` }),
	);

	const copyCsv = withFeedback(
		async () =>
			navigator.clipboard.writeText(await (await fetch(mmaBufUrl(await csvPath()))).text()),
		t("toast.copiedCsv"),
	);
	const downloadCsv = withFeedback(
		async () => saveToFile(await csvPath(), "csv"),
		t("toast.downloadedFile", { name: `${baseName}.csv` }),
	);

	const downloadGeoJson = withFeedback(
		async () => saveToFile(await geojsonPath(), "geojson"),
		t("toast.downloadedFile", { name: `${baseName}.geojson` }),
	);

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent title={t("dialog.export")} className="export-modal">
				<div className="export-modal__settings">
					<div className="export-modal__filename">
						<label htmlFor={`${uid}name`}>{t("export.fileName")}</label>
						<TextInput
							id={`${uid}name`}
							type="text"
							name="name"
							value={fileName}
							onChange={(e) => setFileName(e.target.value)}
							autoFocus
						/>
					</div>
					<div className="export-modal__fieldset">
						<label>
							<Radio
								name="selection"
								value="all"
								checked={scope.kind === "all"}
								onChange={() => setScope({ kind: "all" })}
							/>
							{t("editor.exportEverything", { count: fmt.format(locationCount) })}
						</label>
						<label>
							<Radio
								name="selection"
								value="selected"
								checked={scope.kind === "selected"}
								onChange={() => setScope({ kind: "selected" })}
								disabled={selCount === 0}
							/>
							<span style={selCount === 0 ? { opacity: 0.7 } : undefined}>
								{t("editor.exportSelection", { count: fmt.format(selCount) })}
							</span>
						</label>
					</div>
					<div className="export-modal__fieldset">
						<label>
							<Checkbox
								name="zoom"
								checked={saveZoom}
								onChange={(e) => setSaveZoom(e.target.checked)}
							/>
							{t("export.saveZoomLevels")}
						</label>
						<label>
							<Checkbox
								name="extras"
								checked={saveExtras}
								onChange={(e) => setSaveExtras(e.target.checked)}
							/>
							{t("export.saveAppData")}
							<br />
							<small className="export-modal__help">{t("export.saveAppDataHelp")}</small>
						</label>
						<label>
							<Checkbox
								name="unpanned"
								checked={bypassUnpanned}
								onChange={(e) => setBypassUnpanned(e.target.checked)}
							/>
							{t("export.bypassUnpanned")}
							<br />
							<small className="export-modal__help">{t("export.bypassUnpannedHelp")}</small>
						</label>
					</div>
				</div>
				<div className="export-modal__formats">
					<div className="export-modal__format export-modal__format--json">
						<h3 className="export-modal__subhead">{t("export.asJson")}</h3>
						<div className="export-modal__export-buttons">
							<Button onClick={copyJson} disabled={!navigator.clipboard} data-qa="json-copy">
								{t("common.copy")}
							</Button>
							<Button onClick={downloadJson} data-qa="json-dl">
								{t("common.download")}
							</Button>
						</div>
					</div>
					<div className="export-modal__format export-modal__format--csv">
						<h3 className="export-modal__subhead">{t("export.asCsv")}</h3>
						<p>{t("export.csvNote")}</p>
						<div className="export-modal__export-buttons">
							<Button onClick={copyCsv} disabled={!navigator.clipboard} data-qa="csv-copy">
								{t("common.copy")}
							</Button>
							<Button onClick={downloadCsv} data-qa="csv-dl">
								{t("common.download")}
							</Button>
						</div>
					</div>
					<div className="export-format export-modal__format--geojson">
						<h3 className="export-modal__subhead">{t("export.asGeoJson")}</h3>
						<p>{t("export.geoJsonNote")}</p>
						<div className="export-modal__export-buttons">
							<Button onClick={downloadGeoJson} data-qa="geojson-download">
								{t("common.download")}
							</Button>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
