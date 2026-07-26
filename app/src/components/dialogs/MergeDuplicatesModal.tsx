import { useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { Button } from "@/components/primitives/Button";
import { previewDuplicateGroups, mergeDuplicates } from "@/store/useMapStore";
import { toast } from "@/lib/util/toast";
import { fmt } from "@/lib/util/format";
import { log } from "@/lib/util/log";
import { useAsync } from "@/lib/hooks/useAsync";
import { useT } from "@/lib/i18n";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	distance: number;
}

interface Preview {
	groups: number;
	mergedAway: number;
	largest: number;
}

export function MergeDuplicatesModal({ open, onOpenChange, distance }: Props) {
	const { t } = useT();
	const [merging, setMerging] = useState(false);

	const { data: preview, loading } = useAsync<Preview | null>(async () => {
		if (!open) return null;
		try {
			const groups = await previewDuplicateGroups(distance);
			const total = groups.reduce((n, g) => n + g.length, 0);
			const largest = groups.reduce((m, g) => Math.max(m, g.length), 0);
			return { groups: groups.length, mergedAway: total - groups.length, largest };
		} catch (e) {
			log.error("[merge] preview failed:", e);
			return null;
		}
	}, [open, distance]);

	const handleMerge = useCallback(async () => {
		setMerging(true);
		try {
			await mergeDuplicates(distance);
			toast(
				t("toast.mergedDuplicates", {
					mergedAway: fmt.format(preview?.mergedAway ?? 0),
					groups: fmt.format(preview?.groups ?? 0),
				}),
			);
			onOpenChange(false);
		} catch (e) {
			log.error("[merge] failed:", e);
		} finally {
			setMerging(false);
		}
	}, [distance, preview, onOpenChange, t]);

	const nothing = !loading && preview != null && preview.groups === 0;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent title={t("dialog.mergeDuplicates")} className="merge-duplicates">
				{loading && (
					<div className="merge-duplicates__loading">
						<div className="merge-duplicates__spinner" />
					</div>
				)}
				{nothing && (
					<p className="merge-duplicates__status">
						{t("merge.noGroups", { distance: String(distance) })}
					</p>
				)}
				{!loading && preview != null && preview.groups > 0 && (
					<>
						<p className="merge-duplicates__status">
							{t("merge.preview", {
								groups: fmt.format(preview.groups),
								distance: String(distance),
								mergedAway: fmt.format(preview.mergedAway),
								largest: fmt.format(preview.largest),
							})}
						</p>
						<div className="merge-duplicates__actions">
							<Button onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
							<Button variant="primary" onClick={handleMerge} disabled={merging}>
								{merging ? t("merge.merging") : t("common.merge")}
							</Button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
