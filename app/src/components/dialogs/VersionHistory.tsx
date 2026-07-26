import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { Button } from "@/components/primitives/Button";
import { useMapState, checkoutCommit } from "@/store/useMapStore";
import { beginCommitDiffPreview } from "@/store/commitDiff";
import { cmd } from "@/lib/commands";
import type { CommitInfo } from "@/bindings.gen";
import { useT } from "@/lib/i18n";
import { fmt } from "@/lib/util/format";

function diffLabel(c: CommitInfo): ReactNode | null {
	const parts: ReactNode[] = [];
	if (c.added > 0)
		parts.push(
			<span key="a" style={{ color: "var(--constructive)" }}>
				+{c.added}
			</span>,
		);
	if (c.removed > 0)
		parts.push(
			<span key="r" style={{ color: "var(--destructive)" }}>
				-{c.removed}
			</span>,
		);
	if (c.modified > 0)
		parts.push(
			<span key="m" style={{ color: "var(--accent)" }}>
				~{c.modified}
			</span>,
		);
	return parts.length > 0 ? (
		<span className="mono" style={{ display: "inline-flex", gap: 6 }}>
			{parts}
		</span>
	) : null;
}

export function VersionHistory({ onClose }: { onClose: () => void }) {
	const { t, locale } = useT();
	const map = useMapState((s) => s.map);
	const [commits, setCommits] = useState<CommitInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [restoring, setRestoring] = useState<string | null>(null);
	const [confirmingId, setConfirmingId] = useState<string | null>(null);

	const dateFmt = new Intl.DateTimeFormat(locale === "zh-Hans" ? "zh-CN" : "en", {
		dateStyle: "medium",
		timeStyle: "short",
	});

	useEffect(() => {
		if (!map) return;
		cmd.storeListCommits(map.meta.id).then((c) => {
			setCommits(c);
			setLoading(false);
		});
	}, [map?.meta.id]);

	if (!map || loading) return null;

	const viewDiff = async (commit: CommitInfo) => {
		await beginCommitDiffPreview(commit);
		onClose();
	};

	const handleRestore = async (commit: CommitInfo) => {
		if (confirmingId !== commit.id) {
			setConfirmingId(commit.id);
			return;
		}
		setConfirmingId(null);
		setRestoring(commit.id);
		await checkoutCommit(commit.id);
		setRestoring(null);
		onClose();
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent title={t("dialog.versionHistory")} className="version-history-modal">
				{commits.length === 0 && (
					<p className="text-muted">{t("versionHistory.noCommits")}</p>
				)}
				{commits.length > 0 && (
					<div style={{ maxHeight: 400, overflowY: "auto" }}>
						<table style={{ width: "100%", borderCollapse: "collapse" }}>
							<thead>
								<tr
									style={{
										textAlign: "left",
										borderBottom: "1px solid var(--border-subtle)",
									}}
								>
									<th style={{ padding: "6px 8px" }}>{t("versionHistory.date")}</th>
									<th style={{ padding: "6px 8px" }}>{t("versionHistory.hash")}</th>
									<th style={{ padding: "6px 8px" }}>{t("common.changes")}</th>
									<th style={{ padding: "6px 8px", textAlign: "right" }}>
										{t("versionHistory.locations")}
									</th>
									<th style={{ padding: "6px 8px" }}></th>
								</tr>
							</thead>
							<tbody>
								{commits.map((c, i) => {
									const diff = diffLabel(c);
									const msg = c.message;
									const hasDiff = c.added > 0 || c.removed > 0 || c.modified > 0;
									return (
										<tr
											key={c.id}
											onClick={() => hasDiff && viewDiff(c)}
											title={hasDiff ? t("versionHistory.viewChanges") : undefined}
											style={{
												borderBottom: "1px solid var(--border-subtle)",
												cursor: hasDiff ? "pointer" : "default",
											}}
										>
											<td className="mono" style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
												{dateFmt.format(new Date(c.createdAt))}
											</td>
											<td
												className="mono"
												style={{
													padding: "6px 8px",
													color: "var(--text-2)",
												}}
											>
												{c.id.slice(0, 7)}
											</td>
											<td
												style={{
													padding: "6px 8px",
													color: diff ? undefined : msg ? undefined : "var(--text-3)",
												}}
											>
												{diff ??
													msg ??
													(i === 0 ? t("versionHistory.latest") : t("versionHistory.noChanges"))}
											</td>
											<td className="mono" style={{ padding: "6px 8px", textAlign: "right" }}>
												{fmt.format(c.locationCount)}
											</td>
											<td style={{ padding: "6px 8px" }}>
												<Button
													variant={confirmingId === c.id ? "destructive" : undefined}
													disabled={restoring !== null}
													onClick={(e) => {
														e.stopPropagation();
														handleRestore(c);
													}}
													onBlur={() => confirmingId === c.id && setConfirmingId(null)}
												>
													{restoring === c.id
														? t("versionHistory.restoring")
														: confirmingId === c.id
															? t("versionHistory.areYouSure")
															: i === 0
																? t("versionHistory.revert")
																: t("versionHistory.restore")}
												</Button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
