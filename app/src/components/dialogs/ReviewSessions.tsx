import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { Icon } from "@/components/primitives/Icon";
import { mdiCheckCircleOutline, mdiCircleOutline } from "@mdi/js";
import {
	listSessions,
	resumeReview,
	deleteSession,
	selectReviewSet,
	type ReviewSession,
} from "@/lib/review/review";

function ProgressBar({ done, total }: { done: number; total: number }) {
	const pct = total > 0 ? Math.round((done / total) * 100) : 0;
	return (
		<div
			style={{
				height: 6,
				borderRadius: 3,
				background: "rgba(255,255,255,0.12)",
				overflow: "hidden",
				marginTop: 4,
			}}
		>
			<div style={{ width: `${pct}%`, height: "100%", background: "#3fb950" }} />
		</div>
	);
}

export function ReviewSessionsModal({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [filter, setFilter] = useState<"active" | "done">("active");
	const [sessions, setSessions] = useState<ReviewSession[]>([]);
	const [loading, setLoading] = useState(false);

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			setSessions(await listSessions(filter));
		} finally {
			setLoading(false);
		}
	}, [filter]);

	useEffect(() => {
		if (open) reload();
	}, [open, reload]);

	const handleResume = (s: ReviewSession) => {
		resumeReview(s);
		onOpenChange(false);
	};

	const handleDelete = async (id: string) => {
		await deleteSession(id);
		reload();
	};

	const handleSelect = (s: ReviewSession, mode: "reviewed" | "unreviewed") => {
		selectReviewSet(s, mode);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent title="Review sessions" className="review-sessions-modal">
				<div style={{ display: "flex", gap: ".5rem", marginBottom: ".75rem" }}>
					<button
						className={`button ${filter === "active" ? "button--primary" : ""}`}
						onClick={() => setFilter("active")}
					>
						In progress
					</button>
					<button
						className={`button ${filter === "done" ? "button--primary" : ""}`}
						onClick={() => setFilter("done")}
					>
						Completed
					</button>
				</div>

				{loading ? (
					<p>Loading...</p>
				) : sessions.length === 0 ? (
					<p style={{ opacity: 0.7 }}>
						{filter === "active" ? "No reviews in progress." : "No completed reviews."}
					</p>
				) : (
					<ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: ".5rem" }}>
						{sessions.map((s) => (
							<li
								key={s.id}
								style={{
									border: "1px solid rgba(255,255,255,0.12)",
									borderRadius: 6,
									padding: ".6rem .75rem",
									display: "flex",
									alignItems: "center",
									gap: ".75rem",
								}}
							>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div
										style={{
											fontWeight: 600,
											whiteSpace: "nowrap",
											overflow: "hidden",
											textOverflow: "ellipsis",
										}}
									>
										{s.name || "Review"}
									</div>
									<div style={{ fontSize: ".85em", opacity: 0.75 }}>
										{s.reviewed.length} / {s.order.length} reviewed
									</div>
									<ProgressBar done={s.reviewed.length} total={s.order.length} />
								</div>
								<button
									className="icon-button"
									style={{ color: "#666" }}
									title="Select reviewed"
									aria-label="Select reviewed"
									onClick={() => handleSelect(s, "reviewed")}
									data-qa="review-select-reviewed"
								>
									<Icon path={mdiCheckCircleOutline} size={20} />
								</button>
								<button
									className="icon-button"
									style={{ color: "#666" }}
									title="Select unreviewed"
									aria-label="Select unreviewed"
									onClick={() => handleSelect(s, "unreviewed")}
									data-qa="review-select-unreviewed"
								>
									<Icon path={mdiCircleOutline} size={20} />
								</button>
								{filter === "active" && (
									<button
										className="button button--primary"
										onClick={() => handleResume(s)}
										data-qa="review-resume"
									>
										Resume
									</button>
								)}
								<button
									className="button button--destructive"
									onClick={() => handleDelete(s.id)}
									data-qa="review-session-delete"
								>
									Delete
								</button>
							</li>
						))}
					</ul>
				)}
			</DialogContent>
		</Dialog>
	);
}
