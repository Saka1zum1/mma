import { useState } from "react";
import { useDomEvent } from "@/lib/hooks/useDomEvent";
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
import { loadSeenPano } from "@/lib/sv/panoSingleton";
import { Icon } from "@/components/primitives/Icon";
import { Button } from "@/components/primitives/Button";
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

	useDomEvent("open-export", () => setShowExport(true));
	useDomEvent("open-import", beginImportFile);
	useDomEvent("open-history", () => setShowHistory(true));
	useDomEvent("open-seen", () => setShowSeen(true));
	useDomEvent("open-copy-to-map", () => setShowCopyToMap(true));
	useDomEvent("open-quick-copy-to-map", () => setShowQuickCopy(true));

	if (!map) return null;

	return (
		<>
			<span className="map-meta__total">
				<span className="mono">{fmt.format(map.meta.locationCount)}</span> locations
			</span>
			<span className="map-meta__actions">
				<Button variant="primary" disabled={!hasDiff} onClick={() => commitMap()}>
					Commit
				</Button>
				{hasDiff && (
					<span className="map-meta__count mono">
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
						style={{ color: canUndo ? undefined : "var(--text-3)" }}
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
						style={{ color: canRedo ? undefined : "var(--text-3)" }}
						aria-label="Redo"
						onClick={redo}
					>
						<Icon path={mdiRedo} />
					</button>
				</Tooltip>
			</span>
			<span className="map-meta__spacer"></span>
			<div className="map-meta__import">
				<Button onClick={() => setShowSeen(true)}>Seen</Button>
				<Button onClick={() => setShowHistory(true)}>History</Button>
				<Button onClick={() => beginImportFile()}>Import file</Button>
				<Button onClick={() => setShowExport(true)}>Export</Button>
			</div>
			{showExport && <ExportDialog onClose={() => setShowExport(false)} />}
			{showHistory && <VersionHistory onClose={() => setShowHistory(false)} />}
			<SeenDialog open={showSeen} onOpenChange={setShowSeen} onLoadPano={loadSeenPano} />
			{showCopyToMap && <CopyToMapDialog onClose={() => setShowCopyToMap(false)} />}
			{showQuickCopy && <QuickCopyToMapDialog onClose={() => setShowQuickCopy(false)} />}
		</>
	);
}
