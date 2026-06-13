import { useState, useMemo } from "react";
import type { ExtraFieldDef } from "@/bindings.gen";
import { cmd } from "@/lib/commands";
import { getFieldDef } from "@/lib/data/fieldDefRegistry";
import { groupByField, projectionsForType } from "@/lib/data/fieldOps";
import {
	useKnownFieldKeys,
	fetchLocationsByIds,
	createTags,
	batchUpdateLocations,
} from "@/store/useMapStore";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";

export function ApplyFieldAsTagsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
}) {
	const [field, setField] = useState("");
	const [projectionId, setProjectionId] = useState("");
	const [width, setWidth] = useState("");
	const [tzLocal, setTzLocal] = useState(false);
	const keys = useKnownFieldKeys();
	const fields = useMemo(() => {
		const entries: { key: string; label: string; type: ExtraFieldDef["type"] }[] = [];
		for (const key of keys) {
			const def = getFieldDef(key);
			entries.push({ key, label: def?.label ?? key, type: def?.type ?? "string" });
		}
		return entries;
	}, [keys]);

	const fieldType = fields.find((f) => f.key === field)?.type ?? "string";
	const projections = projectionsForType(fieldType);
	const projection = projections.find((p) => p.id === projectionId) ?? projections[0];
	const showTz = projection?.needsTz === true && fieldType === "date";
	const showWidth = projection?.needsWidth === true;
	const widthValid = !showWidth || Number(width) > 0;

	const handleFieldChange = (key: string) => {
		setField(key);
		const type = fields.find((f) => f.key === key)?.type ?? "string";
		setProjectionId(projectionsForType(type)[0]?.id ?? "");
		setWidth("");
		setTzLocal(false);
	};

	const handleApply = async () => {
		if (!field || !projection || !widthValid) return;
		const ids = await cmd.storeResolveSelection({ type: "Everything" });
		if (ids.length === 0) return;
		const locs = await fetchLocationsByIds(ids);
		const groups = groupByField(locs, field, (v, loc) =>
			projection.key(v, { fieldType, loc, tzLocal, width: Number(width) }),
		);
		if (groups.size === 0) return;
		const created = await createTags([...groups.keys()]);
		const tagIdByName = new Map(created.map((t) => [t.name.toLowerCase(), t.id]));
		const locById = new Map(locs.map((l) => [l.id, l]));
		const updates: { id: number; patch: { tags: number[] } }[] = [];
		for (const [name, locIds] of groups) {
			const tagId = tagIdByName.get(name.toLowerCase());
			if (tagId == null) continue;
			for (const id of locIds) {
				const l = locById.get(id);
				if (l && !l.tags.includes(tagId)) updates.push({ id, patch: { tags: [...l.tags, tagId] } });
			}
		}
		if (updates.length > 0) await batchUpdateLocations(updates);
		onOpenChange(false);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				onOpenChange(v);
				if (!v) {
					setField("");
					setProjectionId("");
					setWidth("");
					setTzLocal(false);
				}
			}}
		>
			<DialogContent title="Apply metadata as tags">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						handleApply();
					}}
					style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: 4 }}
				>
					<select
						className="input"
						value={field}
						onChange={(e) => handleFieldChange(e.target.value)}
						autoFocus
					>
						<option value="">Select a field...</option>
						{fields.map((f) => (
							<option key={f.key} value={f.key}>
								{f.label}
							</option>
						))}
					</select>
					{field && projections.length > 1 && (
						<select
							className="input"
							value={projection?.id ?? ""}
							onChange={(e) => setProjectionId(e.target.value)}
						>
							{projections.map((p) => (
								<option key={p.id} value={p.id}>
									{p.label}
								</option>
							))}
						</select>
					)}
					{showWidth && (
						<input
							className="input"
							type="number"
							min="0"
							value={width}
							onChange={(e) => setWidth(e.target.value)}
							placeholder="Bucket width..."
						/>
					)}
					{showTz && (
						<label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
							<input
								type="checkbox"
								checked={tzLocal}
								onChange={(e) => setTzLocal(e.target.checked)}
							/>
							Location timezone
						</label>
					)}
					<div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
						<button className="button" type="button" onClick={() => onOpenChange(false)}>
							Cancel
						</button>
						<button
							className="button button--primary"
							type="submit"
							disabled={!field || !widthValid}
						>
							Apply
						</button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
