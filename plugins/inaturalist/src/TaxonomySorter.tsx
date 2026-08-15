import { useState, useCallback, type ReactNode } from "react";
import {
	sortTagsByTaxonomy,
	clearTaxonomyCache,
	type SortOptions,
	type SortProgress,
	type SortResult,
} from "./taxonomy";

const LANGUAGES = [
	{ code: "en", label: "EN" },
	{ code: "fr", label: "FR" },
	{ code: "es", label: "ES" },
	{ code: "de", label: "DE" },
	{ code: "ja", label: "JA" },
] as const;

const INFO_PATH = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z";

function Label({ children, info }: { children: ReactNode; info: string }) {
	return (
		<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
			{children}
			<svg
				width={13} height={13} viewBox="0 0 24 24" fill="currentColor"
				style={{ opacity: 0.35, cursor: "help", flexShrink: 0 }}
				aria-label={info}
			>
				<title>{info}</title>
				<path d={INFO_PATH} />
			</svg>
		</span>
	);
}

const { Section, Field, SegmentedControl } = MMA.ui;

export function TaxonomySorter() {
	const storage = MMA.storage("inaturalist");
	const [lang, setLang] = useState<string>(() => storage.get("taxo_lang", "en"));
	const [deep, setDeep] = useState(true);
	const [commonNames, setCommonNames] = useState(true);
	const [running, setRunning] = useState(false);
	const [progress, setProgress] = useState<SortProgress | null>(null);
	const [result, setResult] = useState<SortResult | null>(null);
	const [abortCtl, setAbortCtl] = useState<AbortController | null>(null);

	const handleLangChange = useCallback((code: string) => {
		setLang(code);
		storage.set("taxo_lang", code);
	}, [storage]);

	const handleSort = useCallback(async () => {
		setRunning(true);
		setResult(null);
		setProgress(null);
		const ctl = new AbortController();
		setAbortCtl(ctl);
		try {
			const opts: SortOptions = { lang, deep, commonNames };
			const r = await sortTagsByTaxonomy(opts, setProgress, ctl.signal);
			setResult(r);
			if (r.sorted > 0) {
				MMA.toast(MMA.t(
					{ one: "Sorted {n} tag into taxonomy folders", other: "Sorted {n} tags into taxonomy folders" },
					{ n: r.sorted },
				));
			} else {
				MMA.toast(MMA.t("No tags needed sorting"));
			}
		} catch (e) {
			if (e instanceof DOMException && e.name === "AbortError") {
				MMA.toast(MMA.t("Taxonomy sort cancelled"));
			} else {
				MMA.toast(MMA.t("Taxonomy sort failed"));
			}
		}
		setRunning(false);
		setAbortCtl(null);
		setProgress(null);
	}, [lang, deep, commonNames]);

	const handleCancel = useCallback(() => {
		abortCtl?.abort();
	}, [abortCtl]);

	const handleClearCache = useCallback(() => {
		clearTaxonomyCache();
		MMA.toast(MMA.t("Taxonomy cache cleared"));
	}, []);

	return (
		<Section title={MMA.t("Taxonomy Sorter")} defaultOpen={false}>
			<Field label={MMA.t("Language")} row>
				<SegmentedControl
					options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
					value={lang}
					onChange={handleLangChange}
				/>
			</Field>

			<Field
				label={
					<Label info={MMA.t("Deep = all taxonomic ranks. Flat = order + family only.")}>
						{MMA.t("Depth")}
					</Label>
				}
				row
			>
				<SegmentedControl
					options={[
						{ value: "deep", label: `\u00a0${MMA.t("Deep")}\u00a0` },
						{ value: "flat", label: `\u00a0${MMA.t("Flat")}\u00a0` },
					]}
					value={deep ? "deep" : "flat"}
					onChange={(v) => setDeep(v === "deep")}
				/>
			</Field>

			<Field
				label={
					<Label info={MMA.t("Include translated common names from iNaturalist")}>
						{MMA.t("Common names")}
					</Label>
				}
				row
			>
				<input
					type="checkbox"
					checked={commonNames}
					onChange={(e) => setCommonNames(e.target.checked)}
				/>
			</Field>

			<div style={{ display: "flex", gap: 6, marginTop: 4 }}>
				{running ? (
					<button className="button button--danger" onClick={handleCancel} style={{ flex: 1 }}>
						{MMA.t("Cancel")}
					</button>
				) : (
					<button className="button button--primary" onClick={handleSort} style={{ flex: 1 }}>
						{MMA.t("Sort Tags")}
					</button>
				)}
				<button
					className="button"
					onClick={handleClearCache}
					disabled={running}
					title={MMA.t("Clear cached API results")}
				>
					{MMA.t("Clear Cache")}
				</button>
			</div>

			{progress && (
				<div style={{ fontSize: 11, color: "var(--text-secondary, #999)", marginTop: 6 }}>
					{progress.phase} ({progress.current}/{progress.total})
					{progress.detail && <div style={{ opacity: 0.7 }}>{progress.detail}</div>}
				</div>
			)}

			{result && !running && (
				<div style={{ fontSize: 11, color: "var(--text-secondary, #999)", marginTop: 6 }}>
					{MMA.t("{sorted} sorted, {skipped} skipped", {
						sorted: result.sorted,
						skipped: result.skipped,
					})}
				</div>
			)}
		</Section>
	);
}
