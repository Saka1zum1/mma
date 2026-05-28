import { useState } from "react";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { setMapExtraFields, getKnownFieldKeys } from "@/store/useMapStore";
import type { ExtraFieldDef } from "@/types";
import { getFieldDef, getAllFieldDefs } from "@/lib/data/fieldDefRegistry";
const FIELD_TYPES: ExtraFieldDef["type"][] = ["string", "number", "date", "month", "enum"];
const TYPE_LABELS: Record<ExtraFieldDef["type"], string> = {
	string: "Text",
	number: "Number",
	date: "Date/time",
	month: "Month (YYYY-MM)",
	enum: "Enum",
};

interface FieldRow {
	key: string;
	label: string;
	type: ExtraFieldDef["type"];
	hasData: boolean;
}

export function ManageFieldsModal({ onClose }: { onClose: () => void }) {
	const knownKeys = getKnownFieldKeys();
	const allDefs = getAllFieldDefs();

	const allKeys = new Set<string>(knownKeys);
	for (const k of Object.keys(allDefs)) allKeys.add(k);

	const initialRows: FieldRow[] = [...allKeys].sort().map((key) => {
		const def = getFieldDef(key);
		return {
			key,
			label: def?.label ?? key,
			type: def?.type ?? "string",
			hasData: knownKeys.has(key),
		};
	});

	const [rows, setRows] = useState(initialRows);

	const updateRow = (key: string, patch: Partial<FieldRow>) => {
		setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
	};

	const handleSave = async () => {
		const fields: Record<string, ExtraFieldDef> = {};
		for (const row of rows) {
			const entry: ExtraFieldDef = { type: row.type, label: row.label };
			const existing = getFieldDef(row.key);
			if (existing?.values) entry.values = existing.values;
			if (existing?.labels) entry.labels = existing.labels;
			fields[row.key] = entry;
		}
		await setMapExtraFields(fields);
		onClose();
	};

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent title="Manage metadata fields" className="manage-fields-modal">
				{rows.length === 0 ? (
					<p>No metadata fields found on this map.</p>
				) : (
					<table className="manage-fields-table">
						<thead>
							<tr>
								<th>Field</th>
								<th>Label</th>
								<th>Type</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row.key}>
									<td className="manage-fields-table__key">
										{row.key}
										{!row.hasData && (
											<span className="manage-fields-table__no-data"> (no data)</span>
										)}
									</td>
									<td>
										<input
											className="input"
											value={row.label}
											onChange={(e) => updateRow(row.key, { label: e.target.value })}
										/>
									</td>
									<td>
										<select
											className="nselect"
											value={row.type}
											onChange={(e) =>
												updateRow(row.key, { type: e.target.value as ExtraFieldDef["type"] })
											}
										>
											{FIELD_TYPES.map((t) => (
												<option key={t} value={t}>
													{TYPE_LABELS[t]}
												</option>
											))}
										</select>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
				<div className="manage-fields-modal__actions">
					<button className="button button--primary" type="button" onClick={handleSave}>
						Save
					</button>
					<button className="button" type="button" onClick={onClose}>
						Cancel
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
