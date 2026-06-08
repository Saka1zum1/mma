import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { previewDuplicateGroups, mergeDuplicates } from "@/store/useMapStore";
import { toast } from "@/lib/util/toast";
import { fmt } from "@/lib/util/format";
import { log } from "@/lib/util/log";

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
	const [preview, setPreview] = useState<Preview | null>(null);
	const [loading, setLoading] = useState(false);
	const [merging, setMerging] = useState(false);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setPreview(null);
		setLoading(true);
		previewDuplicateGroups(distance)
			.then((groups) => {
				if (cancelled) return;
				const total = groups.reduce((n, g) => n + g.length, 0);
				const largest = groups.reduce((m, g) => Math.max(m, g.length), 0);
				setPreview({ groups: groups.length, mergedAway: total - groups.length, largest });
			})
			.catch((e) => {
				if (!cancelled) log.error("[merge] preview failed:", e);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [open, distance]);

	const handleMerge = useCallback(async () => {
		setMerging(true);
		try {
			await mergeDuplicates(distance);
			toast(`Merged ${fmt.format(preview?.mergedAway ?? 0)} duplicates into ${fmt.format(preview?.groups ?? 0)} locations`);
			onOpenChange(false);
		} catch (e) {
			log.error("[merge] failed:", e);
		} finally {
			setMerging(false);
		}
	}, [distance, preview, onOpenChange]);

	const nothing = !loading && preview != null && preview.groups === 0;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent title="Merge duplicates" className="merge-duplicates">
				{loading && (
					<div className="merge-duplicates__loading">
						<div className="merge-duplicates__spinner" />
					</div>
				)}
				{nothing && (
					<p className="merge-duplicates__status">
						No duplicate groups within {distance}m.
					</p>
				)}
				{!loading && preview != null && preview.groups > 0 && (
					<>
						<p className="merge-duplicates__status">
							{fmt.format(preview.groups)} group{preview.groups !== 1 ? "s" : ""} within {distance}m.
							Merging removes {fmt.format(preview.mergedAway)} location
							{preview.mergedAway !== 1 ? "s" : ""}, keeping one survivor each (tags
							combined). Largest group: {fmt.format(preview.largest)}.
						</p>
						<div className="merge-duplicates__actions">
							<button className="button" type="button" onClick={() => onOpenChange(false)}>
								Cancel
							</button>
							<button
								className="button button--primary"
								type="button"
								onClick={handleMerge}
								disabled={merging}
							>
								{merging ? "Merging..." : "Merge"}
							</button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
