import { useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { useCurrentMap, updateTags } from "@/store/useMapStore";
import { parseDoclink, loadOutline, type DocRef } from "@/lib/doclink";
import { useAsync } from "@/lib/hooks/useAsync";
import { textColorFor } from "@/lib/util/color";
import type { Tag } from "@/bindings.gen";

function headingUrl(docId: string, anchor: string): string {
	return `https://docs.google.com/document/d/${docId}/edit#heading=${anchor}`;
}

/** Anchors a tag's doclinks point at, within the given doc only. */
function anchorsInDoc(tag: Tag, docId: string): Set<string> {
	const out = new Set<string>();
	for (const url of tag.doclinks ?? []) {
		const ref = parseDoclink(url);
		if (ref?.docId === docId && ref.anchor) out.add(ref.anchor);
	}
	return out;
}

export function DoclinkAssignDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
}) {
	const map = useCurrentMap();
	const tags: Tag[] = useMemo(
		() =>
			Object.values(map?.meta.tags ?? {}).sort((a, b) =>
				a.name.localeCompare(b.name, undefined, { numeric: true }),
			),
		[map?.meta.tags],
	);

	// Doc identity: pasted URL, prefilled from the map's first existing doclink.
	const inferred = tags.flatMap((t) => t.doclinks ?? [])[0] ?? "";
	const [urlInput, setUrlInput] = useState<string | null>(null);
	const url = urlInput ?? inferred;
	const docRef: DocRef | null = url ? parseDoclink(url) : null;

	const [armedId, setArmedId] = useState<number | null>(null);
	const armed = tags.find((t) => t.id === armedId) ?? null;

	const {
		data: outline,
		loading,
		error,
	} = useAsync(() => (docRef && open ? loadOutline(docRef) : null), [docRef?.docId, open]);

	// anchor -> tags assigned to it (for this doc), recomputed from live tag data.
	const assignments = useMemo(() => {
		const byAnchor = new Map<string, Tag[]>();
		if (!docRef) return byAnchor;
		for (const tag of tags) {
			for (const anchor of anchorsInDoc(tag, docRef.docId)) {
				const list = byAnchor.get(anchor) ?? [];
				list.push(tag);
				byAnchor.set(anchor, list);
			}
		}
		return byAnchor;
	}, [tags, docRef]);

	// Refresh path for reimports: import only adopts doclinks onto tags that
	// have none, so clearing this doc's links first lets a reimport repopulate.
	const clearDoc = async () => {
		if (!docRef) return;
		const updates = tags
			.filter((t) => anchorsInDoc(t, docRef.docId).size > 0)
			.map((t) => ({
				id: t.id,
				patch: {
					doclinks: (t.doclinks ?? []).filter((u) => parseDoclink(u)?.docId !== docRef.docId),
				},
			}));
		if (updates.length > 0) await updateTags(updates);
	};

	const toggle = async (tag: Tag, anchor: string) => {
		if (!docRef) return;
		const target = headingUrl(docRef.docId, anchor);
		const existing = tag.doclinks ?? [];
		const has = existing.some((u) => {
			const r = parseDoclink(u);
			return r?.docId === docRef.docId && r.anchor === anchor;
		});
		const doclinks = has
			? existing.filter((u) => {
					const r = parseDoclink(u);
					return !(r?.docId === docRef.docId && r.anchor === anchor);
				})
			: [...existing, target];
		await updateTags([{ id: tag.id, patch: { doclinks } }]);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent title="Assign document links" className="doclink-assign">
				<div className="doclink-assign__url">
					<input
						className="input"
						type="text"
						placeholder="Paste a Google Docs link..."
						value={url}
						onChange={(e) => setUrlInput(e.target.value)}
					/>
					<button
						type="button"
						className="button"
						disabled={!docRef || assignments.size === 0}
						title="Remove this document's links from every tag (undoable)"
						onClick={() => void clearDoc()}
					>
						Clear doc links
					</button>
				</div>
				{!docRef ? (
					<p className="doclink-assign__hint">Paste a link to a Google Doc to load its headings.</p>
				) : (
					<div className="doclink-assign__panes">
						<div className="doclink-assign__tags">
							<div className="doclink-assign__pane-title">
								Tags {armed ? "" : "(pick one to arm)"}
							</div>
							{tags.map((tag) => {
								const n = anchorsInDoc(tag, docRef.docId).size;
								return (
									<span
										key={tag.id}
										className={`tag is-small doclink-assign__tag${tag.id === armedId ? " is-armed" : ""}`}
										style={{ backgroundColor: tag.color, color: textColorFor(tag.color) }}
										onClick={() => setArmedId(tag.id === armedId ? null : tag.id)}
									>
										<span className="tag__text">
											{tag.name}
											{n > 0 && <span className="doclink-assign__count">{n}</span>}
										</span>
									</span>
								);
							})}
							{tags.length === 0 && <p className="doclink-assign__hint">This map has no tags.</p>}
						</div>
						<div className="doclink-assign__outline">
							<div className="doclink-assign__pane-title">
								{outline?.title ?? "Document"}
								{armed ? ` — click a heading to assign "${armed.name}"` : ""}
							</div>
							{loading && <p className="doclink-assign__hint">Loading document...</p>}
							{error && <p className="doclink-assign__hint">Couldn't load: {error.message}</p>}
							{outline?.headings.map((h) => {
								const assigned = assignments.get(h.anchor) ?? [];
								const armedHere = armed !== null && assigned.some((t) => t.id === armed.id);
								return (
									<div
										key={h.anchor}
										className={`doclink-assign__heading${armed ? " is-assignable" : ""}${armedHere ? " is-active" : ""}`}
										style={{ paddingLeft: `${(h.level - 1) * 14 + 8}px` }}
										onClick={() => armed && void toggle(armed, h.anchor)}
									>
										<span className="doclink-assign__heading-text">{h.text}</span>
										{assigned.map((t) => (
											<span
												key={t.id}
												className="doclink-assign__chip"
												style={{ background: t.color, color: textColorFor(t.color) }}
												title={`Assigned to ${t.name} (click heading with this tag armed to remove)`}
											>
												{t.name}
											</span>
										))}
									</div>
								);
							})}
							{outline && outline.headings.length === 0 && (
								<p className="doclink-assign__hint">No linkable headings found in this doc.</p>
							)}
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
