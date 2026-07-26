import { useState } from "react";
import { getVisibleTags, updateTags } from "@/store/useMapStore";
import { TagPill } from "@/components/primitives/TagPill";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { Button } from "@/components/primitives/Button";
import { TextInput } from "@/components/primitives/TextInput";
import { useT } from "@/lib/i18n";

export function TagFindReplaceDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
}) {
	const { t, tp } = useT();
	const [find, setFind] = useState("");
	const [replace, setReplace] = useState("");
	const [applied, setApplied] = useState(false);

	const tags = getVisibleTags();
	const matches = find ? tags.filter((t) => t.name.toLowerCase().includes(find.toLowerCase())) : [];

	const handleApply = async () => {
		if (!find || matches.length === 0) return;
		const patches = matches.map((t) => ({
			id: t.id,
			patch: {
				name: t.name.replaceAll(
					new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
					replace,
				),
			},
		}));
		await updateTags(patches);
		setApplied(true);
	};

	const handleOpenChange = (v: boolean) => {
		if (!v) {
			setFind("");
			setReplace("");
			setApplied(false);
		}
		onOpenChange(v);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent title={t("dialog.findReplaceTags")} className="tag-find-replace-modal">
				<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: 4 }}>
					<label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
						<span style={{ width: 60 }}>{t("common.find")}</span>
						<TextInput
							style={{ flex: 1 }}
							value={find}
							onChange={(e) => {
								setFind(e.target.value);
								setApplied(false);
							}}
							placeholder={t("editor.findPlaceholder")}
							autoFocus
						/>
					</label>
					<label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
						<span style={{ width: 60 }}>{t("common.replace")}</span>
						<TextInput
							style={{ flex: 1 }}
							value={replace}
							onChange={(e) => {
								setReplace(e.target.value);
								setApplied(false);
							}}
							placeholder={t("editor.replacePlaceholder")}
						/>
					</label>
					{find && (
						<div>
							<p style={{ margin: "0 0 0.25rem", fontSize: "0.85rem", color: "var(--text-2)" }}>
								{tp("editor.tagsAffected", matches.length, { count: String(matches.length) })}
							</p>
							<ul
								style={{
									margin: 0,
									padding: 0,
									listStyle: "none",
									maxHeight: 320,
									overflowY: "auto",
									fontSize: "0.85rem",
								}}
							>
								{matches.map((t) => {
									const newName = t.name.replaceAll(
										new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
										replace,
									);
									return (
										<li
											key={t.id}
											style={{ padding: "1px 0", display: "flex", alignItems: "center", gap: 6 }}
										>
											<TagPill small color={t.color} label={t.name} />
											<span style={{ opacity: 0.5 }}>&rarr;</span>
											<TagPill small color={t.color} label={newName} />
										</li>
									);
								})}
							</ul>
						</div>
					)}
					<p style={{ margin: 0, fontSize: "0.8rem", color: "var(--accent)" }}>
						{t("editor.tagRenamesIrreversible")}
					</p>
					<div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
						<Button onClick={() => handleOpenChange(false)}>
							{applied ? t("common.close") : t("common.cancel")}
						</Button>
						{!applied && (
							<Button
								variant="primary"
								disabled={!find || matches.length === 0}
								onClick={handleApply}
							>
								{tp("editor.replaceTags", matches.length, { count: String(matches.length) })}
							</Button>
						)}
						{applied && (
							<span
								style={{ alignSelf: "center", color: "var(--constructive)", fontSize: "0.85rem" }}
							>
								{t("editor.done")}
							</span>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
