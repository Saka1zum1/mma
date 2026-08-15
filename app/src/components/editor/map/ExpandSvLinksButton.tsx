import { useState } from "react";
import clsx from "clsx";
import { useEvent } from "@/lib/events";
import { Icon } from "@/components/primitives/Icon";
import { Tooltip } from "@/components/primitives/Tooltip";
import { Button } from "@/components/primitives/Button";
import { TextInput } from "@/components/primitives/TextInput";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { useT } from "@/lib/i18n";
import { mdiGraphOutline, mdiStopCircleOutline } from "@mdi/js";
import {
	isExpandingSvLinks,
	startExpandSvLinks,
	stopExpandSvLinks,
	type ExpandProgress,
} from "@/lib/sv/expandLinks";
import { useMapState } from "@/store/useMapStore";
import { useDialog } from "@/store/dialogBus";
import { toast } from "@/lib/util/toast";

const DEFAULT_MAX = 200;

/** icon-button in selection-manager__bar; dialog asks for max count + shows progress. */
export function ExpandSvLinksButton() {
	const { t } = useT();
	useEvent("plugins:changed");
	const hasSelection = useMapState((s) => s.selectedLocationIds.size > 0);
	const running = isExpandingSvLinks();
	const [open, setOpen] = useState(false);
	const [maxCount, setMaxCount] = useState(String(DEFAULT_MAX));
	const [progress, setProgress] = useState<ExpandProgress | null>(null);

	const openDialogUi = () => {
		if (!hasSelection) {
			toast(t("Select at least one Google / Baidu / Tencent / Yandex location"));
			return;
		}
		setProgress(null);
		setOpen(true);
	};

	useDialog("expand-sv-links", () => {
		if (isExpandingSvLinks()) {
			stopExpandSvLinks();
			setProgress(null);
			return;
		}
		openDialogUi();
	});

	const onToolbarClick = () => {
		if (running) {
			stopExpandSvLinks();
			setProgress(null);
			return;
		}
		openDialogUi();
	};

	const start = async () => {
		const max = Math.max(1, Math.floor(Number(maxCount) || DEFAULT_MAX));
		setMaxCount(String(max));
		setProgress({ added: 0, max, queued: 0, done: false });
		try {
			const added = await startExpandSvLinks({
				maxCount: max,
				onProgress: setProgress,
			});
			toast(t("Added {count} linked panoramas", { count: added }));
			setOpen(false);
			setProgress(null);
		} catch (e) {
			const err = e as Error;
			if (err?.name === "AbortError") {
				toast(t("Link expansion stopped"));
			} else if (err?.message === "no-selection") {
				toast(t("Select at least one Google / Baidu / Tencent / Yandex location"));
			} else if (err?.message === "no-provider") {
				toast(t("Selection has no Google / Baidu / Tencent / Yandex panoramas"));
			} else if (err?.message === "already-running") {
				toast(t("Expanding Street View links…"));
			} else {
				toast(String(err?.message ?? e));
			}
			setProgress(null);
		}
	};

	const closeDialog = () => {
		if (isExpandingSvLinks()) stopExpandSvLinks();
		setOpen(false);
		setProgress(null);
	};

	const pct =
		progress && progress.max > 0
			? Math.min(1, progress.added / progress.max)
			: 0;

	return (
		<>
			<Tooltip
				content={running ? t("Stop expanding links") : t("Expand Street View links")}
				side="bottom"
			>
				<button
					type="button"
					className={clsx("icon-button", {
						"is-active": running || open,
						"is-disabled": !running && !hasSelection,
					})}
					aria-label={
						running ? t("Stop expanding links") : t("Expand Street View links")
					}
					aria-pressed={running}
					onClick={onToolbarClick}
				>
					<Icon path={running ? mdiStopCircleOutline : mdiGraphOutline} />
				</button>
			</Tooltip>

			<Dialog
				open={open}
				onOpenChange={(v) => {
					if (!v) closeDialog();
				}}
			>
				<DialogContent title={t("Expand Street View links")} className="expand-sv-links-dialog">
					<p className="expand-sv-links-dialog__hint">{t("Crawl linked panoramas from the selection (Google, Baidu, Tencent, Yandex) and add them as new locations.")}</p>
					<label className="expand-sv-links-dialog__field">
						<span>{t("Maximum locations to add")}</span>
						<TextInput
							type="number"
							min={1}
							max={5000}
							value={maxCount}
							disabled={running}
							onChange={(e) => setMaxCount(e.target.value)}
						/>
					</label>
					{progress && (
						<div className="expand-sv-links-dialog__progress">
							<progress className="bulk-operation__bar" value={pct} max={1} />
							<span>
								{t("{added} / {max} added · {queued} queued", {
									added: progress.added,
									max: progress.max,
									queued: progress.queued,
								})}
							</span>
						</div>
					)}
					<div className="expand-sv-links-dialog__actions">
						{running ? (
							<Button variant="destructive" onClick={() => stopExpandSvLinks()}>
								{t("Stop expanding links")}
							</Button>
						) : (
							<Button variant="primary" onClick={() => void start()}>
								{t("Start")}
							</Button>
						)}
						<Button onClick={closeDialog}>{t("Close")}</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
