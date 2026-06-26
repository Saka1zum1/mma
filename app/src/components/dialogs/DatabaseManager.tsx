import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { cmd } from "@/lib/commands";

type Risk = "safe" | "moderate" | "dangerous" | "unknown";

interface TableInfo {
	name: string;
	rows: number;
	description: string;
	risk: Risk;
}

const KNOWN_TABLES: Record<string, { description: string; risk: Risk }> = {
	edit_history: { description: "Undo/redo stacks per map", risk: "safe" },
	commits: { description: "Version history snapshots", risk: "moderate" },
	review_sessions: { description: "Map review session data", risk: "safe" },
	tags: { description: "Map tags", risk: "dangerous" },
	maps: { description: "Map metadata", risk: "dangerous" },
	seen: { description: "Viewed pano history", risk: "safe" },
};

const RISK_ORDER: Record<Risk, number> = { safe: 0, unknown: 1, moderate: 2, dangerous: 3 };

const RISK_LABELS: Record<Risk, string> = {
	safe: "Safe to clear",
	moderate: "Will lose history",
	dangerous: "WILL DESTROY DATA",
	unknown: "Unknown",
};

const RISK_COLORS: Record<Risk, string> = {
	safe: "#4a4",
	moderate: "#c90",
	dangerous: "#d33",
	unknown: "#888",
};

async function fetchTableInfo(): Promise<TableInfo[]> {
	const rows = await cmd.storeDbTableInfo();
	const results: TableInfo[] = rows.map((r) => {
		const known = KNOWN_TABLES[r.name];
		return {
			name: r.name,
			rows: r.rows,
			description: known?.description ?? "",
			risk: known?.risk ?? "unknown",
		};
	});
	results.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);
	return results;
}

function ConfirmClearDialog({
	table,
	onConfirm,
	onCancel,
}: {
	table: TableInfo;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	const [typed, setTyped] = useState("");
	const expected = table.name;

	return (
		<div
			className="dbm-confirm-overlay"
			onClick={(e) => {
				if (e.target === e.currentTarget) onCancel();
			}}
		>
			<div className="dbm-confirm-box">
				<div className="dbm-confirm-title">Clear "{table.name}"?</div>
				<p>
					This will permanently delete <strong>{table.rows.toLocaleString()}</strong> row
					{table.rows !== 1 ? "s" : ""} from <code>{table.name}</code>.
				</p>
				{table.risk !== "safe" && (
					<p style={{ color: RISK_COLORS[table.risk], fontWeight: 600 }}>
						{table.risk === "dangerous"
							? "WARNING: This table contains critical application data. Clearing it may break your maps."
							: table.risk === "unknown"
								? "This table has no known safety classification. Proceed with extreme caution."
								: "This will erase version history. You will not be able to restore previous versions."}
					</p>
				)}
				<p>
					Type <code>{expected}</code> to confirm:
				</p>
				<input
					className="dbm-confirm-input"
					value={typed}
					onChange={(e) => setTyped(e.target.value)}
					placeholder={expected}
					autoFocus
					spellCheck={false}
				/>
				<div className="dbm-confirm-actions">
					<button className="button" onClick={onCancel}>
						Cancel
					</button>
					<button
						className="button dbm-clear-btn"
						disabled={typed !== expected}
						onClick={onConfirm}
						style={{ background: typed === expected ? "#d33" : undefined }}
					>
						Clear table
					</button>
				</div>
			</div>
		</div>
	);
}

export function DatabaseManager({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [tables, setTables] = useState<TableInfo[] | null>(null);
	const [clearing, setClearing] = useState<TableInfo | null>(null);
	const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);

	const refresh = useCallback(() => {
		fetchTableInfo().then(setTables);
	}, []);

	const ready = open && tables !== null;

	useEffect(() => {
		if (open) {
			setStatus(null);
			refresh();
		} else {
			setTables(null);
		}
	}, [open, refresh]);

	async function handleClear(table: TableInfo) {
		setClearing(null);
		try {
			const deleted = await cmd.storeDbClearTable(table.name);
			setStatus({
				msg: `Cleared ${table.name} (${deleted.toLocaleString()} rows deleted)`,
				ok: true,
			});
			refresh();
		} catch (e) {
			setStatus({ msg: `Failed to clear ${table.name}: ${e}`, ok: false });
		}
	}

	return (
		<Dialog open={ready} onOpenChange={onOpenChange}>
			<DialogContent title="Database management" className="dbm-page">
				<div className="dbm-warning-banner">
					<div className="dbm-warning-title">DO NOT TOUCH UNLESS YOU KNOW WHAT YOU ARE DOING</div>
					<div className="dbm-warning-text">
						Direct table operations can permanently destroy your data. There is no undo.
					</div>
				</div>

				{status && (
					<div className="dbm-status" style={{ color: status.ok ? "#4a4" : "#d33" }}>
						{status.msg}
					</div>
				)}

				<table className="dbm-table">
					<thead>
						<tr>
							<th>Table</th>
							<th>Rows</th>
							<th>Risk</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{tables?.map((t) => (
							<tr key={t.name} className={`dbm-row--${t.risk}`}>
								<td>
									<code>{t.name}</code>
									<div className="dbm-table-desc">{t.description}</div>
								</td>
								<td className="dbm-rows-cell">{t.rows < 0 ? "err" : t.rows.toLocaleString()}</td>
								<td>
									<span className="dbm-risk-badge" style={{ color: RISK_COLORS[t.risk] }}>
										{RISK_LABELS[t.risk]}
									</span>
								</td>
								<td>
									<button
										className="button dbm-clear-btn"
										disabled={t.rows <= 0}
										onClick={() => setClearing(t)}
									>
										Clear
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{clearing && (
					<ConfirmClearDialog
						table={clearing}
						onConfirm={() => handleClear(clearing)}
						onCancel={() => setClearing(null)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
