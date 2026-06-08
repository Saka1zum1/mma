import {
	useReviewSession,
	reviewIndex,
	isCurrentReviewed,
	cancelReview,
} from "@/lib/review/review";

/** Header shown above the pano during a review pass. Single point of review-UI in the
 *  preview; the rest of LocationPreview only calls reviewNext/Prev/Delete. */
export function ReviewBar() {
	const s = useReviewSession();
	if (!s) return null;

	const pos = reviewIndex(s) + 1;
	const reviewedHere = isCurrentReviewed(s);

	return (
		<div className="review-header">
			<span>
				Reviewing{" "}
				<span style={{ color: reviewedHere ? "#3fb950" : undefined, fontWeight: 600 }}>
					{pos} / {s.order.length}
				</span>{" "}
				&middot; {s.reviewed.length} reviewed
			</span>
			<span style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
				<button
					className="icon-button"
					role="tooltip"
					aria-label="Exit review"
					data-microtip-position="bottom"
					onClick={cancelReview}
					data-qa="review-cancel"
				>
					<svg height="16" width="16" viewBox="0 0 24 24" fill="currentColor">
						<path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
					</svg>
				</button>
			</span>
		</div>
	);
}
