import { useState, useMemo, useCallback, useEffect } from "react";
import { Sidebar, Field, EmptyState, SegmentedControl } from "@/components/primitives/Sidebar";
import { NSelect } from "@/components/primitives/NSelect";
import { Checkbox } from "@/components/primitives/Checkbox";
import { ScopeSelector } from "@/components/primitives/ScopeSelector";
import type { ExtraFieldType, KeySpec, DatePart } from "@/bindings.gen";
import { getFieldDef, fieldLabel } from "@/lib/data/fieldDefRegistry";
import type { FieldEntry } from "@/components/editor/map/FilterBuilder";
import { partitionKeyOptions, RANGE_ID } from "@/lib/data/fieldOps";
import { isNumericField, colorPartition } from "./gradientMath";
import { partition, useScope } from "@/store/scope";
import { usePluginState } from "@/plugins/registry";
import { useSetting } from "@/store/settings";
import { useT, type MessageKey } from "@/lib/i18n";
import "./gradient.css";

interface GradientPreset {
	id: MessageKey;
	stops: [number, number, number][];
}

const PRESETS: GradientPreset[] = [
	{
		id: "plugin.gradient.preset.blueRed",
		stops: [
			[66, 133, 244],
			[234, 67, 53],
		],
	},
	{
		id: "plugin.gradient.preset.greenYellowRed",
		stops: [
			[52, 168, 83],
			[251, 188, 4],
			[234, 67, 53],
		],
	},
	{
		id: "plugin.gradient.preset.purpleOrange",
		stops: [
			[136, 84, 208],
			[255, 152, 0],
		],
	},
	{
		id: "plugin.gradient.preset.coolWarm",
		stops: [
			[33, 150, 243],
			[200, 200, 200],
			[244, 67, 54],
		],
	},
	{
		id: "plugin.gradient.preset.viridis",
		stops: [
			[68, 1, 84],
			[59, 82, 139],
			[33, 145, 140],
			[94, 201, 98],
			[253, 231, 37],
		],
	},
];

const BUCKET_COUNTS = [5, 10, 15, 20];

// Refuse to color a partition into more groups than a human can distinguish.
const MAX_GROUPS = 100;

const gradientCss = (stops: [number, number, number][]) =>
	`linear-gradient(to right, ${stops
		.map((s, i) => `rgb(${s[0]},${s[1]},${s[2]}) ${(i / (stops.length - 1)) * 100}%`)
		.join(", ")})`;

// Gradient offers Range for numbers and dates (count bins); numeric defaults to Range.
const gradientOptions = (type: ExtraFieldType) => partitionKeyOptions(type, true);
function defaultProjection(type: ExtraFieldType): string {
	return type === "number" || type === "date"
		? RANGE_ID
		: (gradientOptions(type)[0]?.id ?? "value");
}

function buildGradientFields(knownKeys: ReadonlySet<string>): FieldEntry[] {
	const result: FieldEntry[] = [];
	for (const key of knownKeys) {
		const def = getFieldDef(key);
		if (
			!def ||
			isNumericField(def) ||
			def.type === "enum" ||
			def.type === "string" ||
			def.type === "month"
		) {
			if (def) result.push({ key, label: fieldLabel(key), def });
		}
	}
	return result;
}

function defaultGradientField(fields: FieldEntry[]): string {
	return (fields.find((f) => f.key === "altitude") ?? fields[0])?.key ?? "";
}

const PROJECTION_KEYS: Record<string, MessageKey> = {
	[RANGE_ID]: "plugin.gradient.projection.range",
	value: "plugin.gradient.projection.value",
	year: "plugin.gradient.projection.year",
	yearMonth: "plugin.gradient.projection.yearMonth",
	day: "plugin.gradient.projection.day",
	monthOfYear: "plugin.gradient.projection.monthOfYear",
	hourOfDay: "plugin.gradient.projection.hourOfDay",
};

export function GradientSidebar({ onClose }: { onClose: () => void }) {
	const { t, tp } = useT();
	const [fieldKeyRaw, setFieldKey] = usePluginState<string>("gradient", "fieldKey", () =>
		defaultGradientField(buildGradientFields(MMA.getMapState().knownFieldKeys)),
	);
	const [projectionIdRaw, setProjectionId] = usePluginState("gradient", "projectionId", RANGE_ID);
	const [presetIdxRaw, setPresetIdx] = usePluginState("gradient", "presetIdx", 0);
	const [bucketCount, setBucketCount] = usePluginState("gradient", "bucketCount", 10);
	const [reversed, setReversed] = usePluginState("gradient", "reversed", false);
	const [applying, setApplying] = useState(false);
	const [lastResult, setLastResult] = useState<{ groups: number; applied: boolean } | null>(null);
	const scopeCtl = useScope();
	const dateTimezone = useSetting("dateTimezone");

	const map = MMA.getMapState().map;

	const knownKeys = MMA.getMapState().knownFieldKeys;
	const fields = useMemo(() => buildGradientFields(knownKeys), [knownKeys]);

	// Persisted values are global; fall back when they don't resolve on this map.
	const fieldKey = fields.some((f) => f.key === fieldKeyRaw)
		? fieldKeyRaw
		: defaultGradientField(fields);
	const presetIdx = presetIdxRaw < PRESETS.length ? presetIdxRaw : 0;
	const preset = PRESETS[presetIdx];
	const stops = reversed ? [...preset.stops].reverse() : preset.stops;
	const fieldOpt = fields.find((f) => f.key === fieldKey);
	const fieldType = (fieldOpt?.def?.type ?? "string") as ExtraFieldType;
	const projOptions = useMemo(() => gradientOptions(fieldType), [fieldType]);
	const projectionId = projOptions.some((p) => p.id === projectionIdRaw)
		? projectionIdRaw
		: defaultProjection(fieldType);

	const applyGradient = useCallback(async () => {
		if (!fieldOpt || !map) return;
		setApplying(true);
		try {
			const key: KeySpec =
				projectionId === RANGE_ID
					? { kind: "numericBin", binning: { by: "count", n: bucketCount } }
					: projectionId === "value"
						? { kind: "value" }
						: {
								kind: "datePart",
								part: projectionId as DatePart,
								tzLocal: dateTimezone === "location",
							};

			const groups = await partition(fieldKey, key, scopeCtl.scope);
			if (groups.length > MAX_GROUPS) {
				setLastResult({ groups: groups.length, applied: false });
				return;
			}
			setLastResult({ groups: groups.length, applied: true });
			if (groups.length === 0) return;

			const sels = colorPartition(groups, {
				fieldKey: fieldKey,
				fieldType,
				stops,
				scoped: scopeCtl.scope.kind === "selected",
				ordinal: projectionId === RANGE_ID,
				eqFilter: projectionId === "value",
			});
			if (sels.length === 0) return;

			await MMA.resetSelections();
			await MMA.addSelections(sels.map((s) => s.props));
			MMA.setSelectionColors(sels.map((s) => ({ key: s.key, color: s.color })));
		} finally {
			setApplying(false);
		}
	}, [
		fieldKey,
		fieldOpt,
		fieldType,
		projectionId,
		map,
		bucketCount,
		stops,
		scopeCtl.scope,
		dateTimezone,
	]);

	// The result line describes the last apply; stale once any input changes.
	useEffect(() => {
		setLastResult(null);
	}, [fieldKey, projectionId, presetIdx, bucketCount, reversed, scopeCtl.scope]);

	return (
		<Sidebar title={t("plugin.gradient.title")} onBack={onClose} className="gradient-sidebar">
			{fields.length === 0 ? (
				<EmptyState>{t("plugin.gradient.emptyNoFields")}</EmptyState>
			) : (
				<>
					<Field label={t("plugin.gradient.applyTo")}>
						<ScopeSelector ctl={scopeCtl} />
					</Field>
					<div className="gradient-sidebar__row">
						<Field label={t("plugin.gradient.field")}>
							<NSelect
								value={fieldKey}
								onChange={(e) => {
									const key = e.target.value;
									setFieldKey(key);
									const ft = (fields.find((f) => f.key === key)?.def?.type ??
										"string") as ExtraFieldType;
									const opts = gradientOptions(ft);
									if (!opts.some((p) => p.id === projectionId))
										setProjectionId(defaultProjection(ft));
								}}
							>
								{fields.map((f) => (
									<option key={f.key} value={f.key}>
										{f.label}
									</option>
								))}
							</NSelect>
						</Field>
						<Field label={t("plugin.gradient.groupBy")}>
							<NSelect
								value={projectionId}
								disabled={projOptions.length <= 1}
								onChange={(e) => {
									setProjectionId(e.target.value);
								}}
							>
								{projOptions.map((p) => (
									<option key={p.id} value={p.id}>
										{t(PROJECTION_KEYS[p.id] ?? "plugin.gradient.projection.value")}
									</option>
								))}
							</NSelect>
						</Field>
					</div>

					<Field label={t("plugin.gradient.buckets")}>
						<SegmentedControl
							value={bucketCount}
							onChange={setBucketCount}
							options={BUCKET_COUNTS.map((n) => ({
								value: n,
								label: String(n),
								disabled: projectionId !== RANGE_ID,
								title:
									projectionId !== RANGE_ID ? t("plugin.gradient.bucketRangeOnly") : undefined,
							}))}
						/>
					</Field>

					<Field label={t("plugin.gradient.gradient")}>
						<div className="gradient-sidebar__presets">
							{PRESETS.map((p, i) => (
								<button
									key={p.id}
									className={`gradient-sidebar__preset ${i === presetIdx ? "gradient-sidebar__preset--active" : ""}`}
									onClick={() => {
										setPresetIdx(i);
									}}
									title={t(p.id)}
								>
									<div
										className="gradient-sidebar__preset-bar"
										style={{
											background: gradientCss(reversed ? [...p.stops].reverse() : p.stops),
										}}
									/>
								</button>
							))}
						</div>
						<div className="gradient-sidebar__preview-labels">
							<span>{t("plugin.gradient.low")}</span>
							<span>{t("plugin.gradient.high")}</span>
						</div>
						<label className="gradient-sidebar__check">
							<Checkbox checked={reversed} onChange={(e) => setReversed(e.target.checked)} />
							{t("plugin.gradient.reverse")}
						</label>
					</Field>

					<div className="gradient-sidebar__apply-row">
						<button
							className="button button--primary gradient-sidebar__apply"
							onClick={applyGradient}
							disabled={applying || !fieldKey}
						>
							{t("plugin.gradient.apply")}
						</button>
						{lastResult != null && (
							<span className="gradient-sidebar__result">
								{!lastResult.applied
									? t("plugin.gradient.resultTooMany", {
											groups: lastResult.groups,
											max: MAX_GROUPS,
										})
									: lastResult.groups === 0
										? t("plugin.gradient.resultNoGroups")
										: tp("plugin.gradient.resultApplied", lastResult.groups, {
												count: lastResult.groups,
											})}
							</span>
						)}
					</div>
				</>
			)}
		</Sidebar>
	);
}
