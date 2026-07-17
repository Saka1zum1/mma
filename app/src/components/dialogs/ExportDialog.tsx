import { useState, useEffect, useId } from "react";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { Button } from "@/components/primitives/Button";
import { Checkbox } from "@/components/primitives/Checkbox";
import { Radio } from "@/components/primitives/Radio";
import { TextInput } from "@/components/primitives/TextInput";
import { useCurrentMap, useSelectedLocationIds, getVisibleTags } from "@/store/useMapStore";
import { useMapSetting } from "@/store/useMapSetting";
import { cmd } from "@/lib/commands";
import { mmaBufUrl, saveExportTempFile } from "@/lib/util/util";
import { getAllFieldDefs } from "@/lib/data/fieldDefRegistry";
import { fmt } from "@/lib/util/format";
import { toast } from "@/lib/util/toast";
import { log } from "@/lib/util/log";

interface Props {
	onClose: () => void;
}

enum ExportScope {
	All = 0,
	Selection = 1,
}

async function fetchExportFile(path: string): Promise<string> {
	const res = await fetch(mmaBufUrl(path));
	return res.text();
}

export function ExportDialog({ onClose }: Props) {
	const map = useCurrentMap();
	const selectedIds = useSelectedLocationIds();
	const uid = useId();

	const [locationCount, setLocationCount] = useState(0);
	const [scope, setScope] = useState(ExportScope.All);
	const [saveZoom, setSaveZoom] = useMapSetting("exportZoom");
	const [saveExtras, setSaveExtras] = useMapSetting("exportExtras");
	const [bypassUnpanned, setBypassUnpanned] = useMapSetting("exportUnpanned");
	const [fileName, setFileName] = useState(map?.meta.name ?? "");
	const selCount = selectedIds.size;
	useEffect(() => {
		if (map) cmd.storeLocationCount().then(setLocationCount);
	}, [map]);

	if (!map) return null;

	const baseName = fileName || map.meta.name || "export";
	const scopeIds = scope === ExportScope.Selection ? [...selectedIds] : undefined;
	// Visible tags only — raw meta.tags holds soft-deleted ghosts kept for undo,
	// which must not resurrect through an export/import round-trip.
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
			toast("Export failed");
		}
	};

	const copyJson = withFeedback(
		async () => navigator.clipboard.writeText(await fetchExportFile(await jsonPath())),
		"Copied JSON to clipboard",
	);
	const downloadJson = withFeedback(
		async () => saveToFile(await jsonPath(), "json"),
		`Downloaded ${baseName}.json`,
	);

	const copyCsv = withFeedback(
		async () => navigator.clipboard.writeText(await fetchExportFile(await csvPath())),
		"Copied CSV to clipboard",
	);
	const downloadCsv = withFeedback(
		async () => saveToFile(await csvPath(), "csv"),
		`Downloaded ${baseName}.csv`,
	);

	const downloadGeoJson = withFeedback(
		async () => saveToFile(await geojsonPath(), "geojson"),
		`Downloaded ${baseName}.geojson`,
	);

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent title="Export" className="export-modal">
				<div className="export-modal__settings">
					<div className="export-modal__filename">
						<label htmlFor={`${uid}name`}>File name:</label>
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
								value={ExportScope.All}
								checked={scope === ExportScope.All}
								onChange={(e) => setScope(Number(e.target.value))}
							/>
							Export everything ({fmt.format(locationCount)} locations)
						</label>
						<label>
							<Radio
								name="selection"
								value={ExportScope.Selection}
								checked={scope === ExportScope.Selection}
								onChange={(e) => setScope(Number(e.target.value))}
								disabled={selCount === 0}
							/>
							<span style={selCount === 0 ? { opacity: 0.7 } : undefined}>
								Export selection ({fmt.format(selCount)} locations)
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
							Save zoom levels
						</label>
						<label>
							<Checkbox
								name="extras"
								checked={saveExtras}
								onChange={(e) => setSaveExtras(e.target.checked)}
							/>
							Save app data
							<br />
							<small className="export-modal__help">
								Include app-specific data like tags. Not including this makes the file smaller,
								which can help when uploading maps with 100K+ locations to GeoGuessr.
							</small>
						</label>
						<label>
							<Checkbox
								name="unpanned"
								checked={bypassUnpanned}
								onChange={(e) => setBypassUnpanned(e.target.checked)}
							/>
							Bypass GeoGuessr auto-panning for locations with 0 heading
							<br />
							<small className="export-modal__help">
								GeoGuessr auto-pans locations that point straight north along the road. To keep your
								unpanned locations unpanned, enable this option.
							</small>
						</label>
					</div>
				</div>
				<div className="export-modal__formats">
					<div className="export-modal__format export-modal__format--json">
						<h3 className="export-modal__subhead">As JSON (recommended)</h3>
						<div className="export-modal__export-buttons">
							<Button onClick={copyJson} disabled={!navigator.clipboard} data-qa="json-copy">
								Copy
							</Button>
							<Button onClick={downloadJson} data-qa="json-dl">
								Download
							</Button>
						</div>
					</div>
					<div className="export-modal__format export-modal__format--csv">
						<h3 className="export-modal__subhead">As CSV</h3>
						<p>
							CSV exports do <em>not</em> retain camera orientation and pano&nbsp;IDs.
						</p>
						<div className="export-modal__export-buttons">
							<Button onClick={copyCsv} disabled={!navigator.clipboard} data-qa="csv-copy">
								Copy
							</Button>
							<Button onClick={downloadCsv} data-qa="csv-dl">
								Download
							</Button>
						</div>
					</div>
					<div className="export-format export-modal__format--geojson">
						<h3 className="export-modal__subhead">As GeoJSON</h3>
						<p>For use in non-GeoGuessr mapping tools.</p>
						<div className="export-modal__export-buttons">
							<Button onClick={downloadGeoJson} data-qa="geojson-download">
								Download
							</Button>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
