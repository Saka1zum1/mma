import { useState } from "react";
import { getVisibleTags, updateTags } from "@/store/useMapStore";
import { textColorFor } from "@/lib/util/color";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";

export function TagFindReplaceDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
}) {
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
			<DialogContent title="Find and replace in tag names" className="tag-find-replace-modal">
				<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: 4 }}>
					<label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
						<span style={{ width: 60 }}>Find</span>
						<input
							className="input"
							style={{ flex: 1 }}
							value={find}
							onChange={(e) => {
								setFind(e.target.value);
								setApplied(false);
							}}
							placeholder="Text to find..."
							autoFocus
						/>
					</label>
					<label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
						<span style={{ width: 60 }}>Replace</span>
						<input
							className="input"
							style={{ flex: 1 }}
							value={replace}
							onChange={(e) => {
								setReplace(e.target.value);
								setApplied(false);
							}}
							placeholder="Replace with..."
						/>
					</label>
					{find && (
						<div>
							<p style={{ margin: "0 0 0.25rem", fontSize: "0.85rem", color: "#888" }}>
								{matches.length} tag{matches.length !== 1 ? "s" : ""} will be affected:
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
											<span
												className="tag is-small"
												style={{ backgroundColor: t.color, color: textColorFor(t.color) }}
											>
												<span className="tag__text">{t.name}</span>
											</span>
											<span style={{ opacity: 0.5 }}>&rarr;</span>
											<span
												className="tag is-small"
												style={{ backgroundColor: t.color, color: textColorFor(t.color) }}
											>
												<span className="tag__text">{newName}</span>
											</span>
										</li>
									);
								})}
							</ul>
						</div>
					)}
					<p style={{ margin: 0, fontSize: "0.8rem", color: "#e5a33e" }}>
						Tag renames cannot be undone.
					</p>
					<div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
						<button className="button" type="button" onClick={() => handleOpenChange(false)}>
							{applied ? "Close" : "Cancel"}
						</button>
						{!applied && (
							<button
								className="button button--primary"
								type="button"
								disabled={!find || matches.length === 0}
								onClick={handleApply}
							>
								Replace {matches.length} tag{matches.length !== 1 ? "s" : ""}
							</button>
						)}
						{applied && (
							<span style={{ alignSelf: "center", color: "#2fcc8b", fontSize: "0.85rem" }}>
								Done!
							</span>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
