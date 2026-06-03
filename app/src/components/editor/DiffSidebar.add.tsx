import { mdiArrowLeft } from "@mdi/js";
import { Icon } from "@/components/primitives/Icon";
import { useCommitDiffPreview, endCommitDiffPreview } from "@/store/useMapStore";
import { fmt } from "@/lib/util/format";

/** Sidebar shown while viewing a commit diff on the map. The colored markers
 *  temporarily replace the regular markers; this panel labels them. The back
 *  arrow restores the regular markers. */
export function DiffSidebar() {
	const diff = useCommitDiffPreview();
	if (!diff) return null;
	const { counts } = diff;

	return (
		<section className="import-sidebar">
			<header className="import-sidebar__header">
				<div className="diff-sidebar__title-group">
					<button
						className="diff-sidebar__back"
						onClick={endCommitDiffPreview}
						title="Back to map"
						aria-label="Back to map"
					>
						<Icon path={mdiArrowLeft} size={18} />
					</button>
					<h2 className="import-sidebar__title">Changes</h2>
				</div>
				<span className="import-sidebar__count" style={{ fontFamily: "monospace" }}>
					{diff.hash}
				</span>
			</header>

			<div className="import-sidebar__section">
				<ul className="diff-legend">
					<li>
						<span className="diff-legend__dot" style={{ background: "rgb(34,197,94)" }} />
						Added
						<span className="diff-legend__count">{fmt.format(counts.added)}</span>
					</li>
					<li>
						<span className="diff-legend__dot" style={{ background: "rgb(239,68,68)" }} />
						Removed
						<span className="diff-legend__count">{fmt.format(counts.removed)}</span>
					</li>
					<li>
						<span className="diff-legend__dot" style={{ background: "rgb(245,158,11)" }} />
						Modified
						<span className="diff-legend__count">{fmt.format(counts.modified)}</span>
					</li>
				</ul>
			</div>
		</section>
	);
}
