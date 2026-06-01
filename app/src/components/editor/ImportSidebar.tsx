import { useState } from "react";
import {
	useImportStaging,
	confirmImport,
	cancelImport,
	getVisibleTags,
} from "@/store/useMapStore";
import { fmt } from "@/lib/util/format";
import { log } from "@/lib/util/log";
import { trace } from "@/lib/util/debug";
import { textColorFor } from "@/lib/util/color";

const FIELD_PREFS_KEY = "import-field-prefs";

function loadDroppedFields(): Set<string> {
	try {
		const stored = localStorage.getItem(FIELD_PREFS_KEY);
		if (stored) return new Set(JSON.parse(stored));
	} catch {
		// ignored
	}
	return new Set();
}

/** Placeholder pill color for a not-yet-created tag; Rust assigns the real one on commit. */
function previewColor(name: string): string {
	let h = 0;
	for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
	return `hsl(${h % 360} 60% 55%)`;
}

/** Import staging sidebar: field picker, file tags, bulk tag, and warnings. */
export function ImportSidebar() {
	const staging = useImportStaging();
	const [droppedFields, setDroppedFields] = useState(loadDroppedFields);
	const [bulkTag, setBulkTag] = useState<string | null>(null);
	const [tagInput, setTagInput] = useState("");
	const [importing, setImporting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!staging) return null;
	const { preview } = staging;

	const toggleField = (key: string) => {
		setDroppedFields((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			localStorage.setItem(FIELD_PREFS_KEY, JSON.stringify([...next]));
			return next;
		});
	};

	const commitBulkTag = (e: React.FormEvent) => {
		e.preventDefault();
		const name = tagInput.trim();
		if (!name) return;
		setBulkTag(name);
		setTagInput("");
	};

	const handleImport = async () => {
		setImporting(true);
		setError(null);
		const t = trace("import");
		try {
			const r = await confirmImport([...droppedFields], bulkTag ?? undefined);
			t.end({ imported: r?.importedCount ?? 0 });
		} catch (e: unknown) {
			log.error("[import] failed:", e);
			setError(e instanceof Error ? e.message : String(e));
			setImporting(false);
		}
	};

	const sortedFields = [...preview.fields].sort((a, b) => a.key.localeCompare(b.key));

	// Reuse an existing tag's color if the name matches; else a placeholder.
	const existing = bulkTag
		? getVisibleTags().find((t) => t.name.toLowerCase() === bulkTag.toLowerCase())
		: undefined;
	const bulkColor = existing?.color ?? (bulkTag ? previewColor(bulkTag) : "");

	return (
		<section className="importer import-sidebar">
			<header className="import-sidebar__header">
				<h2 className="import-sidebar__title">Import</h2>
				<span className="import-sidebar__count">
					{fmt.format(preview.locationCount)} location{preview.locationCount !== 1 ? "s" : ""}
				</span>
			</header>

			{preview.tags.length > 0 && (
				<div className="import-sidebar__section">
					<span className="import-sidebar__label">Tags in file</span>
					<ul className="tag-list">
						{preview.tags.map((t) => (
							<li
								key={t.id}
								className="tag is-small"
								style={{ backgroundColor: t.color, color: textColorFor(t.color) }}
							>
								<span className="tag__text">{t.name}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{sortedFields.length > 0 && (
				<div className="import-sidebar__section">
					<span className="import-sidebar__label">Fields</span>
					<div className="importer__fields">
						{sortedFields.map((f) => (
							<label key={f.key} className="importer__field">
								<input
									type="checkbox"
									checked={!droppedFields.has(f.key)}
									onChange={() => toggleField(f.key)}
								/>
								{f.key.startsWith("extra.") ? f.key.slice(6) : f.key}
								<small>({fmt.format(f.count)})</small>
							</label>
						))}
					</div>
				</div>
			)}

			<div className="import-sidebar__section">
				<span className="import-sidebar__label">Tag all imported locations</span>
				<ul className="tag-list">
					{bulkTag ? (
						<li
							className="tag is-small has-button"
							style={{ backgroundColor: bulkColor, color: textColorFor(bulkColor) }}
						>
							<button
								className="button tag__button tag__button--delete"
								onClick={() => setBulkTag(null)}
								type="button"
							>
								<svg height="16" width="16" viewBox="0 0 24 24" fill="currentColor">
									<path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
								</svg>
							</button>
							<span className="tag__text">{bulkTag}</span>
						</li>
					) : (
						<li>
							<form className="form-add-tag" onSubmit={commitBulkTag}>
								<input
									className="form-add-tag__input"
									type="text"
									placeholder="Add a tag…"
									value={tagInput}
									onChange={(e) => setTagInput(e.target.value)}
								/>
							</form>
						</li>
					)}
				</ul>
			</div>

			{preview.warnings.length > 0 && (
				<details className="import-sidebar__section">
					<summary>{preview.warnings.length} warning(s)</summary>
					<ul>
						{preview.warnings.map((w, i) => (
							<li key={i}>{w}</li>
						))}
					</ul>
				</details>
			)}

			{error && <p className="importer__error">Error: {error}</p>}

			<div className="import-sidebar__actions">
				<button className="button button--primary" onClick={handleImport} disabled={importing}>
					{importing ? "Importing…" : "Import"}
				</button>
				<button className="button" onClick={cancelImport} disabled={importing}>
					Discard
				</button>
			</div>
		</section>
	);
}
