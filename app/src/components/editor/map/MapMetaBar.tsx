import { useState, useEffect } from "react";
import { Tooltip } from "@/components/primitives/Tooltip";
import {
	useCurrentMap,
	useUndoRedo,
	useCommitDiff,
	hasCommitDiff,
	undo,
	redo,
	commitMap,
	beginImportFile,
} from "@/store/useMapStore";
import { ExportDialog } from "@/components/dialogs/ExportDialog";
import { VersionHistory } from "@/components/dialogs/VersionHistory";
import { SeenDialog } from "@/components/dialogs/SeenDialog";
import { CopyToMapDialog } from "@/components/editor/CopyToMapDialog";
import { QuickCopyToMapDialog } from "@/components/editor/QuickCopyToMapDialog";
import { loadSeenPano } from "@/components/editor/location/panoSingleton";
import { Icon } from "@/components/primitives/Icon";
import { mdiUndo, mdiRedo } from "@mdi/js";
import { fmt } from "@/lib/util/format";

export function MapMetaBar() {
	const map = useCurrentMap();
	const { canUndo, canRedo } = useUndoRedo();
	const diff = useCommitDiff();
	const hasDiff = hasCommitDiff();
	const [showExport, setShowExport] = useState(false);
	const [showHistory, setShowHistory] = useState(false);
	const [showSeen, setShowSeen] = useState(false);
	const [showCopyToMap, setShowCopyToMap] = useState(false);
	const [showQuickCopy, setShowQuickCopy] = useState(false);

	useEffect(() => {
		const onExport = () => setShowExport(true);
		const onImport = () => beginImportFile();
		const onHistory = () => setShowHistory(true);
		const onSeen = () => setShowSeen(true);
		const onCopyToMap = () => setShowCopyToMap(true);
		const onQuickCopy = () => setShowQuickCopy(true);
		document.addEventListener("open-export", onExport);
		document.addEventListener("open-import", onImport);
		document.addEventListener("open-history", onHistory);
		document.addEventListener("open-seen", onSeen);
		document.addEventListener("open-copy-to-map", onCopyToMap);
		document.addEventListener("open-quick-copy-to-map", onQuickCopy);
		return () => {
			document.removeEventListener("open-export", onExport);
			document.removeEventListener("open-import", onImport);
			document.removeEventListener("open-history", onHistory);
			document.removeEventListener("open-seen", onSeen);
			document.removeEventListener("open-copy-to-map", onCopyToMap);
			document.removeEventListener("open-quick-copy-to-map", onQuickCopy);
		};
	}, []);

	if (!map) return null;

	return (
		<>
			<span className="map-meta__total">{fmt.format(map.meta.locationCount)} locations</span>
			<span className="map-meta__actions">
				<button
					className="button button--primary"
					type="button"
					disabled={!hasDiff}
					onClick={() => commitMap()}
				>
					Commit
				</button>
				{hasDiff && (
					<span className="map-meta__count">
						<span className="map-meta__count--added">+{fmt.format(diff.added)}</span>{" "}
						<span className="map-meta__count--removed">-{fmt.format(diff.removed)}</span>{" "}
						<span className="map-meta__count--updated">&plusmn;{fmt.format(diff.modified)}</span>
					</span>
				)}
				<Tooltip content="Undo">
					<button
						type="button"
						className="icon-button"
						disabled={!canUndo}
						style={{ color: canUndo ? undefined : "var(--stone-7)" }}
						aria-label="Undo"
						onClick={undo}
					>
						<Icon path={mdiUndo} />
					</button>
				</Tooltip>
				<Tooltip content="Redo">
					<button
						type="button"
						className="icon-button"
						disabled={!canRedo}
						style={{ color: canRedo ? undefined : "var(--stone-7)" }}
						aria-label="Redo"
						onClick={redo}
					>
						<Icon path={mdiRedo} />
					</button>
				</Tooltip>
			</span>
			<span className="map-meta__spacer"></span>
			<div className="map-meta__import">
				<button className="button" type="button" onClick={() => setShowSeen(true)}>
					Seen
				</button>
				<button className="button" type="button" onClick={() => setShowHistory(true)}>
					History
				</button>
				<button className="button" type="button" onClick={() => beginImportFile()}>
					Import file
				</button>
				<button className="button" type="button" onClick={() => setShowExport(true)}>
					Export
				</button>
			</div>
			{showExport && <ExportDialog onClose={() => setShowExport(false)} />}
			{showHistory && <VersionHistory onClose={() => setShowHistory(false)} />}
			<SeenDialog open={showSeen} onOpenChange={setShowSeen} onLoadPano={loadSeenPano} />
			{showCopyToMap && <CopyToMapDialog onClose={() => setShowCopyToMap(false)} />}
			{showQuickCopy && <QuickCopyToMapDialog onClose={() => setShowQuickCopy(false)} />}
		</>
	);
}
