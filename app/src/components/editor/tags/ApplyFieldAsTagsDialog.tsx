import { useState, useEffect, useMemo, type ReactNode } from "react";
import clsx from "clsx";
import { NSelect } from "@/components/primitives/NSelect";
import type {
	KeySpec,
	DatePart,
	Update,
	LocationPatch_Deserialize as LocationPatch,
	Selector,
} from "@/bindings.gen";
import { getProviderForField } from "@/lib/data/fieldDefs";
import { projectionsForType, partitionKeyOptions, RANGE_ID } from "@/lib/data/fieldOps";
import { useExtraFieldKeys } from "@/components/editor/map/FilterBuilder";
import {
	fetchLocations,
	createTags,
	partition,
	updateLocations,
	resolveIds,
	countBy,
	countIn,
} from "@/store/useMapStore";
import { buildSelection } from "@/store/selections";
import { useSelectorPick } from "@/store/selectorPick";
import { SelectorPicker } from "@/components/primitives/SelectorPicker";
import { useSetting } from "@/store/settings";
import { Dialog, DialogContent, type DialogProps } from "@/components/primitives/Dialog";
import { Button } from "@/components/primitives/Button";
import { TextInput } from "@/components/primitives/TextInput";
import { Checkbox } from "@/components/primitives/Checkbox";
import { t } from "@/lib/i18n";
import { fillTemplate } from "@/lib/util/format";
import { countMissingTimezone, missingTimezoneMessage } from "@/lib/util/timezone";
import { applyCounts, type Preview } from "./applyCounts";

/** `{value}` alone keeps today's names; a prefix such as `Camera/{value}` files them in a folder. */
const DEFAULT_TEMPLATE = "{value}";
const MANY_TAGS = 100;

function andHas(selector: Selector, field: string): Selector {
	return {
		type: "Intersection",
		selections: [
			buildSelection(selector),
			buildSelection({ type: "Filter", field, op: "has", value: true }),
		],
	};
}

export function ApplyFieldAsTagsDialog({ open, onOpenChange }: DialogProps) {
	const tzDefault = useSetting("dateTimezone") === "location";
	const [field, setField] = useState("");
	const [projectionId, setProjectionId] = useState("");
	const [width, setWidth] = useState("");
	const [tzLocal, setTzLocal] = useState(tzDefault);
	const [tagMissing, setTagMissing] = useState(false);
	const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
	const scopeCtl = useSelectorPick();
	const fields = useExtraFieldKeys();

	const fieldType = fields.find((f) => f.key === field)?.def.type ?? "string";
	const projOptions = partitionKeyOptions(fieldType, false);
	const isRange = projectionId === RANGE_ID;
	const selectedProj = projectionsForType(fieldType).find((p) => p.id === projectionId);
	const hasTzData = fields.some((f) => f.key === "timezone");
	const showTz = !isRange && selectedProj?.needsTz === true && fieldType === "date";
	const useRowTz = showTz && tzLocal && hasTzData;
	const [tzGap, setTzGap] = useState(0);

	useEffect(() => {
		let live = true;
		void countMissingTimezone(scopeCtl.selector, field, fieldType, useRowTz).then((n) => {
			if (live) setTzGap(n);
		});
		return () => {
			live = false;
		};
	}, [scopeCtl.selector, field, fieldType, useRowTz]);
	const showWidth = isRange;
	const widthValid = !showWidth || Number(width) > 0;

	const key = useMemo((): KeySpec | null => {
		if (!field || !widthValid) return null;
		if (isRange) return { kind: "numericBin", binning: { by: "width", w: Number(width) } };
		if (projectionId === "value") return { kind: "value" };
		return { kind: "datePart", part: projectionId as DatePart, tzLocal: tzLocal && hasTzData };
	}, [field, widthValid, isRange, width, projectionId, tzLocal, hasTzData]);

	const [loaded, setLoaded] = useState<{
		field: string;
		key: KeySpec | null;
		preview: Preview;
	} | null>(null);
	useEffect(() => {
		if (!field) return;
		let live = true;
		const selector = scopeCtl.selector;
		void Promise.all([
			countIn(selector),
			countIn(andHas(selector, field)),
			key ? countBy(selector, field, key) : Promise.resolve<[string, number][]>([]),
		]).then(([total, have, grouped]) => {
			if (!live) return;
			setLoaded({
				field,
				key,
				preview: {
					total,
					have,
					groups: grouped.length,
					covered: grouped.reduce((sum, [, n]) => sum + n, 0),
				},
			});
		});
		return () => {
			live = false;
		};
	}, [scopeCtl.selector, field, key]);

	const preview = field ? (loaded?.preview ?? null) : null;
	const pending = !!field && (loaded?.field !== field || loaded.key !== key);
	const counts = preview ? applyCounts(preview, tagMissing) : null;

	const handleFieldChange = (next: string) => {
		setField(next);
		const type = fields.find((f) => f.key === next)?.def.type ?? "string";
		setProjectionId(projectionsForType(type)[0]?.id ?? "");
		setWidth("");
		setTzLocal(tzDefault);
	};

	const fieldLabel = fields.find((f) => f.key === field)?.label ?? field;
	const missingName = t("No {field} data", { field: t(fieldLabel) });
	const tagName = (value: string) => fillTemplate(template, { value, field: t(fieldLabel) });

	const handleApply = async () => {
		if (!field || !key) return;

		const groups = await partition(field, key, scopeCtl.selector);

		// Rust drops rows whose key does not resolve, so whatever the groups miss is exactly
		// the set with no value for this field.
		let missing: number[] = [];
		if (tagMissing) {
			const grouped = new Set(groups.flatMap((g) => g.ids));
			missing = (await resolveIds(scopeCtl.selector)).filter((id) => !grouped.has(id));
		}
		if (groups.length === 0 && missing.length === 0) return;

		const transform = getProviderForField(field)?.transform;
		const locs = await fetchLocations({
			type: "Locations",
			locations: [...groups.flatMap((g) => g.ids), ...missing],
			name: null,
		});
		const locById = new Map(locs.map((l) => [l.id, l]));

		const tagNames = new Set<string>();
		if (missing.length > 0) tagNames.add(tagName(missingName));
		for (const g of groups) {
			if (transform) {
				for (const id of g.ids) {
					const l = locById.get(id);
					if (!l) continue;
					const name = transform(field, g.key, l);
					if (name != null) tagNames.add(tagName(name));
				}
			} else {
				tagNames.add(tagName(g.key));
			}
		}

		const created = await createTags([...tagNames]);
		const tagIdByName = new Map(created.map((tg) => [tg.name.toLowerCase(), tg.id]));
		const updates: Update<LocationPatch>[] = [];
		for (const g of groups) {
			for (const id of g.ids) {
				const l = locById.get(id);
				if (!l) continue;
				const raw = transform ? transform(field, g.key, l) : g.key;
				if (raw == null) continue;
				const name = tagName(raw);
				const tagId = tagIdByName.get(name.toLowerCase());
				if (tagId != null && !l.tags.includes(tagId))
					updates.push({ id, patch: { tags: [...l.tags, tagId] } });
			}
		}
		const missingTagId = tagIdByName.get(tagName(missingName).toLowerCase());
		if (missingTagId != null) {
			for (const id of missing) {
				const l = locById.get(id);
				if (l && !l.tags.includes(missingTagId))
					updates.push({ id, patch: { tags: [...l.tags, missingTagId] } });
			}
		}
		if (updates.length > 0) await updateLocations(updates);
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
					setTzLocal(tzDefault);
					setTagMissing(false);
					setTemplate(DEFAULT_TEMPLATE);
					setLoaded(null);
					setTzGap(0);
				}
			}}
		>
			<DialogContent title={t("Apply metadata as tags")}>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						void handleApply();
					}}
					style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: 4 }}
				>
					<SelectorPicker ctl={scopeCtl} />
					<div style={{ display: "flex", gap: "0.5rem" }}>
						<NSelect
							className="nselect--compact"
							value={field}
							onChange={(e) => handleFieldChange(e.target.value)}
							style={{ flex: 1 }}
							autoFocus
						>
							<option value="">{t("Select a field...")}</option>
							{fields.map((f) => (
								<option key={f.key} value={f.key}>
									{t(f.label)}
								</option>
							))}
						</NSelect>
						{field && projOptions.length > 1 && (
							<NSelect
								className="nselect--compact"
								value={projectionId}
								onChange={(e) => setProjectionId(e.target.value)}
							>
								{projOptions.map((p) => (
									<option key={p.id} value={p.id}>
										{t(p.label)}
									</option>
								))}
							</NSelect>
						)}
					</div>
					{showWidth && (
						<TextInput
							type="number"
							min="0"
							value={width}
							onChange={(e) => setWidth(e.target.value)}
							placeholder={t("Bucket width...")}
						/>
					)}
					{showTz && (
						<label
							style={{
								display: "flex",
								alignItems: "center",
								gap: "0.5rem",
								opacity: hasTzData ? 1 : 0.5,
							}}
							title={hasTzData ? undefined : t("No locations have timezone data")}
						>
							<Checkbox
								checked={tzLocal && hasTzData}
								disabled={!hasTzData}
								onChange={(e) => setTzLocal(e.target.checked)}
							/>
							{t("Location timezone")}
						</label>
					)}
					{tzGap > 0 && <p className="apply-tags__hint">{missingTimezoneMessage(tzGap)}</p>}
					{field && (
						<div className={clsx("apply-tags__coverage", pending && "is-pending")}>
							<span className="apply-tags__coverage-label">
								{t("Locations with {field}", { field: t(fieldLabel) })}
							</span>
							<FieldCoverageBar
								ratio={preview && preview.total > 0 ? preview.have / preview.total : 0}
							/>
						</div>
					)}
					{field && (
						<label className="bulk-operation__option">
							{t("Tag name")}
							<TextInput
								value={template}
								onChange={(e) => setTemplate(e.target.value)}
								placeholder={DEFAULT_TEMPLATE}
								title={t("{value} is the projected value, {field} the field label. A / makes a folder.")}
							/>
						</label>
					)}
					{field && (
						<label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
							<Checkbox
								checked={tagMissing}
								onChange={(e) => setTagMissing(e.target.checked)}
							/>
							{t("Tag locations with no value as “{name}”", { name: missingName })}
						</label>
					)}
					<div className="apply-tags__footer">
						<ApplySummary
							preview={preview}
							pending={pending}
							needsWidth={!!field && !key}
							tags={counts?.tags ?? 0}
							locations={counts?.locations ?? 0}
							fieldLabel={t(fieldLabel)}
							suggestRange={fieldType === "number" && !isRange}
						/>
						<div className="apply-tags__actions">
							<Button onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
							<Button variant="primary" type="submit" disabled={!key || !counts?.tags}>
								{t("Apply")}
							</Button>
						</div>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function FieldCoverageBar({ ratio }: { ratio: number }) {
	const complete = ratio >= 1;
	// An incomplete share never reads as 100%.
	const pct = complete ? 100 : Math.min(99, Math.round(Math.max(ratio, 0) * 100));
	return (
		<span
			className={clsx("coverage-bar", "coverage-bar--wide", !complete && "coverage-bar--incomplete")}
			title={t("{pct}% of locations", { pct })}
		>
			<span className="coverage-bar__track">
				<span className="coverage-bar__fill" style={{ width: `${pct}%` }} />
			</span>
			<span className="coverage-bar__pct mono">{pct}%</span>
		</span>
	);
}

function ApplySummary({
	preview,
	pending,
	needsWidth,
	tags,
	locations,
	fieldLabel,
	suggestRange,
}: {
	preview: Preview | null;
	pending: boolean;
	needsWidth: boolean;
	tags: number;
	locations: number;
	fieldLabel: string;
	suggestRange: boolean;
}) {
	let state: "blank" | "empty" | "warning" | "ready" = "ready";
	let head: ReactNode = null;
	let note: ReactNode = null;
	if (needsWidth) {
		state = "empty";
		head = t("Enter a bucket width");
	} else if (!preview) {
		state = "blank";
	} else if (tags === 0) {
		state = "empty";
		head = t("No tags to create");
		note =
			preview.total === 0
				? t("No locations to tag")
				: preview.have === 0
					? t(
							{
								one: "The {n} location has no {field}",
								other: "None of the {n} locations have {field}",
							},
							{ n: preview.total, field: fieldLabel },
						)
					: t("No values could be grouped");
	} else {
		head = (
			<>
				{t({ one: "{n} tag", other: "{n} tags" }, { n: tags })}
				<span className="apply-tags__summary-sep" aria-hidden>
					·
				</span>
				{t({ one: "{n} location", other: "{n} locations" }, { n: locations })}
			</>
		);
		if (tags > MANY_TAGS) {
			state = "warning";
			note = suggestRange
				? t("That's a lot of tags. Range groups numbers into buckets.")
				: t("That's a lot of tags. Try a coarser grouping.");
		}
	}
	// Both lines always render so the footer keeps one height through every state.
	return (
		<div
			className={clsx("apply-tags__summary", `is-${state}`, pending && "is-pending")}
			aria-live="polite"
		>
			<span className="apply-tags__summary-head">{head ?? "\u00a0"}</span>
			<span className="apply-tags__summary-note">{note ?? "\u00a0"}</span>
		</div>
	);
}
