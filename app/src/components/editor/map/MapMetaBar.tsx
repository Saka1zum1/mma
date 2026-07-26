import { useState, useCallback } from "react";
import { useDialog } from "@/store/dialogBus";
import { Tooltip } from "@/components/primitives/Tooltip";
import { useMapState, undo, redo, commitMap } from "@/store/useMapStore";
import { useCommitDiff, hasCommitDiff } from "@/store/commitDiff";
import { beginImportFromPath } from "@/store/importStaging";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
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
import { useT } from "@/lib/i18n";

function LocationTotal() {
	const { t } = useT();
	const locationCount = useMapState((s) => s.locationCount);
	return (
		<span className="map-meta__total">
			{t("editor.locationsCount", { count: fmt.format(locationCount) })}
		</span>
	);
}

function CommitControls() {
	const { t } = useT();
	const diff = useCommitDiff();
	const hasDiff = hasCommitDiff();
	return (
		<>
			<Button variant="primary" disabled={!hasDiff} onClick={() => commitMap()}>
				{t("editor.commit")}
			</Button>
			{hasDiff && (
				<span className="map-meta__count mono">
					<span className="map-meta__count--added">+{fmt.format(diff.added)}</span>{" "}
					<span className="map-meta__count--removed">-{fmt.format(diff.removed)}</span>{" "}
					<span className="map-meta__count--updated">&plusmn;{fmt.format(diff.modified)}</span>
				</span>
			)}
		</>
	);
}

function UndoRedoControls() {
	const { t } = useT();
	const canUndo = useMapState((s) => s.canUndo);
	const canRedo = useMapState((s) => s.canRedo);
	return (
		<>
			<Tooltip content={t("common.undo")}>
				<button
					type="button"
					className="icon-button"
					disabled={!canUndo}
					style={{ color: canUndo ? undefined : "var(--text-3)" }}
					aria-label={t("common.undo")}
					onClick={undo}
				>
					<Icon path={mdiUndo} />
				</button>
			</Tooltip>
			<Tooltip content={t("common.redo")}>
				<button
					type="button"
					className="icon-button"
					disabled={!canRedo}
					style={{ color: canRedo ? undefined : "var(--text-3)" }}
					aria-label={t("common.redo")}
					onClick={redo}
				>
					<Icon path={mdiRedo} />
				</button>
			</Tooltip>
		</>
	);
}

export function MapMetaBar() {
	const { t } = useT();
	const map = useMapState((s) => s.map);
	const [showExport, setShowExport] = useState(false);
	const [showHistory, setShowHistory] = useState(false);
	const [showSeen, setShowSeen] = useState(false);
	const [showCopyToMap, setShowCopyToMap] = useState(false);
	const [showQuickCopy, setShowQuickCopy] = useState(false);

	useDialog("export", () => setShowExport(true));
	const importFile = useCallback(async () => {
		const path = await openFileDialog({
			multiple: false,
			filters: [{ name: t("editor.importFilterName"), extensions: ["json", "csv"] }],
		});
		if (!path || typeof path !== "string") return;
		await beginImportFromPath(path);
	}, [t]);
	useDialog("import", importFile);
	useDialog("history", () => setShowHistory(true));
	useDialog("seen", () => setShowSeen(true));
	useDialog("copy-to-map", () => setShowCopyToMap(true));
	useDialog("quick-copy-to-map", () => setShowQuickCopy(true));

	if (!map) return null;

	return (
		<>
			<LocationTotal />
			<span className="map-meta__actions">
				<CommitControls />
				<UndoRedoControls />
			</span>
			<span className="map-meta__spacer"></span>
			<div className="map-meta__import">
				<Button onClick={() => setShowSeen(true)}>{t("editor.seen")}</Button>
				<Button onClick={() => setShowHistory(true)}>{t("common.history")}</Button>
				<Button onClick={importFile}>{t("editor.importFile")}</Button>
				<Button onClick={() => setShowExport(true)}>{t("common.export")}</Button>
			</div>
			{showExport && <ExportDialog onClose={() => setShowExport(false)} />}
			{showHistory && <VersionHistory onClose={() => setShowHistory(false)} />}
			{showSeen && <SeenDialog open onOpenChange={setShowSeen} onLoadPano={loadSeenPano} />}
			{showCopyToMap && <CopyToMapDialog onClose={() => setShowCopyToMap(false)} />}
			{showQuickCopy && <QuickCopyToMapDialog onClose={() => setShowQuickCopy(false)} />}
		</>
	);
}
