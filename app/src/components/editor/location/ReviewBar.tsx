import { memo } from "react";
import {
	useReviewSession,
	reviewIndex,
	isCurrentReviewed,
	cancelReview,
} from "@/lib/review/review";
import { Icon } from "@/components/primitives/Icon";
import { Tooltip } from "@/components/primitives/Tooltip";
import { mdiClose } from "@mdi/js";
import { useT } from "@/lib/i18n";

/** Header shown above the pano during a review pass. Single point of review-UI in the
 *  preview; the rest of LocationPreview only calls reviewNext/Prev/Delete. */
export const ReviewBar = memo(function ReviewBar() {
	const { t } = useT();
	const s = useReviewSession();
	if (!s) return null;

	const pos = reviewIndex(s) + 1;
	const reviewedHere = isCurrentReviewed(s);
	const progress = t("editor.reviewProgress", {
		pos: String(pos),
		total: String(s.order.length),
		reviewed: String(s.reviewed.length),
	});
	const [beforePos, afterPos] = progress.split(String(pos), 2);

	return (
		<div className="review-header">
			<span>
				{beforePos}
				<span
					className="mono"
					style={{ color: reviewedHere ? "var(--constructive)" : undefined, fontWeight: 600 }}
				>
					{pos}
				</span>
				{afterPos}
			</span>
			<span style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
				<Tooltip content={t("editor.exitReview")} side="bottom">
					<button
						className="icon-button"
						aria-label={t("editor.exitReview")}
						onClick={cancelReview}
						data-qa="review-cancel"
					>
						<Icon path={mdiClose} size={16} />
					</button>
				</Tooltip>
			</span>
		</div>
	);
});
