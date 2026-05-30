import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { useCurrentMap, checkoutCommit } from "@/store/useMapStore";
import { cmd } from "@/lib/commands";
import type { CommitInfo, CommitDelta } from "@/bindings.gen";

const fmt = new Intl.NumberFormat("en");
const dateFmt = new Intl.DateTimeFormat("en", {
	dateStyle: "medium",
	timeStyle: "short",
});

const MAX_ROWS = 50;
type DeltaLoc = CommitDelta["created"][number];

function diffLabel(c: CommitInfo): ReactNode | null {
	const parts: ReactNode[] = [];
	if (c.added > 0)
		parts.push(
			<span key="a" style={{ color: "var(--green-11)" }}>
				+{c.added}
			</span>,
		);
	if (c.removed > 0)
		parts.push(
			<span key="r" style={{ color: "var(--red-11)" }}>
				-{c.removed}
			</span>,
		);
	if (c.modified > 0)
		parts.push(
			<span key="m" style={{ color: "var(--amber-11)" }}>
				~{c.modified}
			</span>,
		);
	return parts.length > 0 ? (
		<span style={{ display: "inline-flex", gap: 6, fontFamily: "monospace" }}>{parts}</span>
	) : null;
}

/** Split a delta into added / removed / modified. An updated location appears in
 * both `created` (new) and `removed` (old), keyed by id. */
function categorize(delta: CommitDelta) {
	const removedIds = new Set(delta.removed.map((l) => l.id));
	const createdIds = new Set(delta.created.map((l) => l.id));
	return {
		added: delta.created.filter((l) => !removedIds.has(l.id)),
		deleted: delta.removed.filter((l) => !createdIds.has(l.id)),
		modified: delta.created.filter((l) => removedIds.has(l.id)),
	};
}

function LocList({ label, color, locs }: { label: string; color: string; locs: DeltaLoc[] }) {
	if (locs.length === 0) return null;
	return (
		<div style={{ marginBottom: 8 }}>
			<div style={{ color, fontWeight: 600, marginBottom: 2 }}>
				{label} ({fmt.format(locs.length)})
			</div>
			<div style={{ fontFamily: "monospace", fontSize: "0.8em", color: "var(--stone-10)" }}>
				{locs.slice(0, MAX_ROWS).map((l) => (
					<div key={l.id}>
						#{l.id} &middot; {l.lat.toFixed(5)}, {l.lng.toFixed(5)}
					</div>
				))}
				{locs.length > MAX_ROWS && <div>+{fmt.format(locs.length - MAX_ROWS)} more</div>}
			</div>
		</div>
	);
}

function CommitDetail({ delta, loading }: { delta: CommitDelta | null; loading: boolean }) {
	if (loading) return <span style={{ color: "var(--stone-9)" }}>Loading...</span>;
	if (!delta) return null;
	const { added, deleted, modified } = categorize(delta);
	if (added.length === 0 && deleted.length === 0 && modified.length === 0) {
		return <span style={{ color: "var(--stone-9)" }}>No changes.</span>;
	}
	return (
		<>
			<LocList label="Added" color="var(--green-11)" locs={added} />
			<LocList label="Removed" color="var(--red-11)" locs={deleted} />
			<LocList label="Modified" color="var(--amber-11)" locs={modified} />
		</>
	);
}

export function VersionHistory({ onClose }: { onClose: () => void }) {
	const map = useCurrentMap();
	const [commits, setCommits] = useState<CommitInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [restoring, setRestoring] = useState<string | null>(null);
	const [confirmingId, setConfirmingId] = useState<string | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [delta, setDelta] = useState<CommitDelta | null>(null);
	const [deltaLoading, setDeltaLoading] = useState(false);

	useEffect(() => {
		if (!map) return;
		cmd.storeListCommits(map.meta.id).then((c) => {
			setCommits(c);
			setLoading(false);
		});
	}, [map?.meta.id]);

	if (!map || loading) return null;

	const toggleExpand = async (commit: CommitInfo) => {
		if (expandedId === commit.id) {
			setExpandedId(null);
			setDelta(null);
			return;
		}
		setExpandedId(commit.id);
		setDelta(null);
		setDeltaLoading(true);
		try {
			const d = await cmd.storeGetCommitDelta(commit.mapId, commit.id);
			// Ignore if the user expanded a different row meanwhile.
			setExpandedId((cur) => {
				if (cur === commit.id) setDelta(d);
				return cur;
			});
		} finally {
			setDeltaLoading(false);
		}
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
			<DialogContent title="Version history" className="version-history-modal">
				{commits.length === 0 && (
					<p style={{ color: "var(--stone-9)" }}>
						No commits yet. Press Commit to create your first version.
					</p>
				)}
				{commits.length > 0 && (
					<div style={{ maxHeight: 400, overflowY: "auto" }}>
						<table style={{ width: "100%", borderCollapse: "collapse" }}>
							<thead>
								<tr
									style={{
										textAlign: "left",
										borderBottom: "1px solid var(--stone-5)",
									}}
								>
									<th style={{ padding: "6px 8px" }}>Date</th>
									<th style={{ padding: "6px 8px" }}>Hash</th>
									<th style={{ padding: "6px 8px" }}>Changes</th>
									<th style={{ padding: "6px 8px", textAlign: "right" }}>Locations</th>
									<th style={{ padding: "6px 8px" }}></th>
								</tr>
							</thead>
							<tbody>
								{commits.map((c, i) => {
									const diff = diffLabel(c);
									const msg = c.message;
									const expanded = expandedId === c.id;
									return (
										<Fragment key={c.id}>
											<tr
												onClick={() => toggleExpand(c)}
												style={{
													borderBottom: "1px solid var(--stone-3)",
													cursor: "pointer",
													background: expanded ? "var(--stone-2)" : undefined,
												}}
											>
												<td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
													{dateFmt.format(new Date(c.createdAt))}
												</td>
												<td
													style={{
														padding: "6px 8px",
														fontFamily: "monospace",
														fontSize: "0.85em",
														color: "var(--stone-9)",
													}}
												>
													{c.id.slice(0, 7)}
												</td>
												<td
													style={{
														padding: "6px 8px",
														color: diff ? undefined : msg ? undefined : "var(--stone-7)",
													}}
												>
													{diff ?? msg ?? (i === 0 ? "(latest)" : "(no changes)")}
												</td>
												<td style={{ padding: "6px 8px", textAlign: "right" }}>
													{fmt.format(c.locationCount)}
												</td>
												<td style={{ padding: "6px 8px" }}>
													<button
														className={`button${confirmingId === c.id ? " button--destructive" : ""}`}
														disabled={restoring !== null}
														onClick={(e) => {
															e.stopPropagation();
															handleRestore(c);
														}}
														onBlur={() => confirmingId === c.id && setConfirmingId(null)}
													>
														{restoring === c.id
															? "Restoring..."
															: confirmingId === c.id
																? "Are you sure?"
																: i === 0
																	? "Revert"
																	: "Restore"}
													</button>
												</td>
											</tr>
											{expanded && (
												<tr>
													<td colSpan={5} style={{ padding: "8px 12px", background: "var(--stone-1)" }}>
														<CommitDetail delta={delta} loading={deltaLoading} />
													</td>
												</tr>
											)}
										</Fragment>
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
