import { useState, useEffect, useId } from "react";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { useCurrentMap, useSelectedLocationIds } from "@/store/useMapStore";
import { invoke } from "@tauri-apps/api/core";
import { mmaBufUrl } from "@/lib/util/util";
import { fmt } from "@/lib/util/format";

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

function downloadBlob(content: string, filename: string) {
	const blob = new Blob([content]);
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

export function ExportDialog({ onClose }: Props) {
	const map = useCurrentMap();
	const selectedIds = useSelectedLocationIds();
	const uid = useId();

	const [locationCount, setLocationCount] = useState(0);
	const [scope, setScope] = useState(ExportScope.All);
	const [saveZoom, setSaveZoom] = useState(map?.meta.settings.exportZoom ?? false);
	const [saveExtras, setSaveExtras] = useState(true);
	const [bypassUnpanned, setBypassUnpanned] = useState(map?.meta.settings.exportUnpanned ?? false);
	const [fileName, setFileName] = useState(map?.meta.name ?? "");
	const selCount = selectedIds.size;
	useEffect(() => {
		if (map) invoke<number>("store_location_count").then(setLocationCount);
	}, [map]);

	if (!map) return null;

	const baseName = fileName || map.meta.name || "export";
	const scopeIds = scope === ExportScope.Selection ? [...selectedIds] : undefined;

	const exportJson = async () => {
		const path: string = await invoke("store_export_json", {
			opts: {
				exportZoom: saveZoom,
				exportUnpanned: bypassUnpanned,
				exportExtras: saveExtras,
				scope: scopeIds ?? null,
				mapName: map.meta.name,
				tagsJson: JSON.stringify(map.meta.tags),
				extraFieldsJson: map.meta.extra?.fields ? JSON.stringify(map.meta.extra.fields) : null,
			},
		});
		return fetchExportFile(path);
	};

	const copyJson = async () => navigator.clipboard.writeText(await exportJson());
	const downloadJson = async () => downloadBlob(await exportJson(), `${baseName}.json`);

	const exportCsv = async () => {
		const path: string = await invoke("store_export_csv", { scope: scopeIds ?? null });
		return fetchExportFile(path);
	};
	const copyCsv = async () => navigator.clipboard.writeText(await exportCsv());
	const downloadCsv = async () => downloadBlob(await exportCsv(), `${baseName}.csv`);

	const downloadGeoJson = async () => {
		const path: string = await invoke("store_export_geojson", {
			scope: scopeIds ?? null,
			tagsJson: JSON.stringify(map.meta.tags),
		});
		downloadBlob(await fetchExportFile(path), `${baseName}.geojson`);
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent title="Export" className="export-modal">
				<div className="export-modal__settings">
					<div className="export-modal__filename">
						<label htmlFor={`${uid}name`}>File name:</label>
						<input
							id={`${uid}name`}
							className="input"
							type="text"
							name="name"
							value={fileName}
							onChange={(e) => setFileName(e.target.value)}
						/>
					</div>
					<div className="export-modal__fieldset">
						<label>
							<input
								type="radio"
								name="selection"
								value={ExportScope.All}
								checked={scope === ExportScope.All}
								onChange={(e) => setScope(Number(e.target.value))}
							/>
							Export everything ({fmt.format(locationCount)} locations)
						</label>
						<label>
							<input
								type="radio"
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
							<input
								type="checkbox"
								name="zoom"
								checked={saveZoom}
								onChange={(e) => setSaveZoom(e.target.checked)}
							/>
							Save zoom levels
						</label>
						<label>
							<input
								type="checkbox"
								name="extras"
								checked={saveExtras}
								onChange={(e) => setSaveExtras(e.target.checked)}
							/>
							Save MMA data
							<br />
							<small className="export-modal__help">
								Include MMA specific data like tags. Not including this makes the file smaller,
								which can help when uploading maps with 100K+ locations to GeoGuessr.
							</small>
						</label>
						<label>
							<input
								type="checkbox"
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
							<button
								className="button"
								onClick={copyJson}
								disabled={!navigator.clipboard}
								data-qa="json-copy"
							>
								Copy
							</button>
							<button className="button" onClick={downloadJson} data-qa="json-dl">
								Download
							</button>
						</div>
					</div>
					<details>
						<summary>Other formats</summary>
						<div className="export-modal__format export-modal__format--csv">
							<h3 className="export-modal__subhead">As CSV</h3>
							<p>
								CSV exports do <em>not</em> retain camera orientation and pano&nbsp;IDs.
							</p>
							<div className="export-modal__export-buttons">
								<button
									className="button"
									onClick={copyCsv}
									disabled={!navigator.clipboard}
									data-qa="csv-copy"
								>
									Copy
								</button>
								<button className="button" onClick={downloadCsv} data-qa="csv-dl">
									Download
								</button>
							</div>
						</div>
						<div className="export-format export-modal__format--geojson">
							<h3 className="export-modal__subhead">As GeoJSON</h3>
							<p>For use in non-GeoGuessr mapping tools.</p>
							<div className="export-modal__export-buttons">
								<button className="button" onClick={downloadGeoJson} data-qa="geojson-download">
									Download
								</button>
							</div>
						</div>
					</details>
				</div>
			</DialogContent>
		</Dialog>
	);
}
