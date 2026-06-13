import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@/components/primitives/Icon";
import { mdiArrowLeft } from "@mdi/js";
import type { ExtraFieldDef } from "@/bindings.gen";
import { getFieldDef } from "@/lib/data/fieldDefRegistry";
import { compareNatural, bucketize } from "@/lib/util/util";
import { gradientColor, isNumericField, fieldScale } from "./gradientMath";
import { fetchAllLocations } from "@/store/useMapStore";
import "./gradient.css";

interface GradientPreset {
	name: string;
	stops: [number, number, number][];
}

const PRESETS: GradientPreset[] = [
	{
		name: "Blue-Red",
		stops: [
			[66, 133, 244],
			[234, 67, 53],
		],
	},
	{
		name: "Green-Yellow-Red",
		stops: [
			[52, 168, 83],
			[251, 188, 4],
			[234, 67, 53],
		],
	},
	{
		name: "Purple-Orange",
		stops: [
			[136, 84, 208],
			[255, 152, 0],
		],
	},
	{
		name: "Cool-Warm",
		stops: [
			[33, 150, 243],
			[200, 200, 200],
			[244, 67, 54],
		],
	},
	{
		name: "Viridis",
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

interface FieldOption {
	key: string;
	label: string;
	def: ExtraFieldDef | undefined;
	numeric: boolean;
}

export function GradientSidebar({ onClose }: { onClose: () => void }) {
	const [fieldKey, setFieldKey] = useState("");
	const [presetIdx, setPresetIdx] = useState(0);
	const [bucketCount, setBucketCount] = useState(10);
	const [applying, setApplying] = useState(false);

	const map = MMA.getCurrentMap();

	const knownKeys = MMA.getKnownFieldKeys();
	const fields = useMemo((): FieldOption[] => {
		const result: FieldOption[] = [];
		for (const key of knownKeys) {
			const def = getFieldDef(key);
			const numeric = isNumericField(def);
			if (!def || numeric || def.type === "enum" || def.type === "string" || def.type === "month") {
				result.push({ key, label: def?.label ?? key, def, numeric });
			}
		}
		return result;
	}, [knownKeys]);

	useEffect(() => {
		if (fieldKey || fields.length === 0) return;
		const alt = fields.find((f) => f.key === "altitude");
		setFieldKey(alt ? alt.key : fields[0].key);
	}, [fields, fieldKey]);

	const preset = PRESETS[presetIdx];
	const fieldOpt = fields.find((f) => f.key === fieldKey);

	const applyGradient = useCallback(async () => {
		if (!fieldOpt || !map) return;
		setApplying(true);
		try {
			const locs = await fetchAllLocations();

			// Collect values
			const values: { id: number; raw: unknown }[] = [];
			for (const loc of locs) {
				const v = loc.extra?.[fieldKey];
				if (v != null) values.push({ id: loc.id, raw: v });
			}
			if (values.length === 0) return;

			// Clear existing selections first
			await MMA.resetSelections();

			if (fieldOpt.numeric) {
				// Numeric: split the range into equal-width "between" buckets, colored by position
				const buckets = bucketize(values.map((v) => Number(v.raw)), bucketCount);
				if (!buckets) return;

				const props = buckets.bounds.map(([lo, hi]) => ({
					type: "Filter" as const,
					field: fieldKey,
					op: "between" as const,
					value: lo,
					value2: hi,
				}));
				const colors = buckets.bounds.map(([lo, hi], i) => ({
					key: `filter:${fieldKey}:between:${lo}:${hi}`,
					color: gradientColor(preset.stops, i / (bucketCount - 1)),
				}));
				await MMA.addSelections(props);
				MMA.setSelectionColors(colors);
			} else {
				// Enum/string/month: one bucket per distinct value, ordered naturally
				const distinct = [...new Set(values.map((v) => String(v.raw)))].sort(compareNatural);
				// If the values are numeric/date-parseable, place colors proportional to the
				// actual value (so e.g. 2023 sits far from 2010). Otherwise space them evenly.
				const fieldType = fieldOpt.def?.type;
				const scales = distinct.map((v) => fieldScale(v, fieldType));
				const proportional = distinct.length > 1 && scales.every((s) => s !== null);
				const lo = proportional ? Math.min(...(scales as number[])) : 0;
				const hi = proportional ? Math.max(...(scales as number[])) : 0;
				const props = distinct.map((v) => ({
					type: "Filter" as const,
					field: fieldKey,
					op: "eq" as const,
					value: v,
					value2: null,
				}));
				const colors = distinct.map((v, i) => ({
					key: `filter:${fieldKey}:eq:${v}`,
					color: gradientColor(
						preset.stops,
						proportional && hi > lo
							? ((scales[i] as number) - lo) / (hi - lo)
							: distinct.length === 1
								? 0.5
								: i / (distinct.length - 1),
					),
				}));
				await MMA.addSelections(props);
				MMA.setSelectionColors(colors);
			}
		} finally {
			setApplying(false);
		}
	}, [fieldKey, fieldOpt, map, bucketCount, preset]);

	return (
		<section className="map-sidebar gradient-sidebar">
			<header className="gradient-sidebar__header">
				<button className="icon-button" onClick={onClose}>
					<Icon path={mdiArrowLeft} />
				</button>
				<h2 className="gradient-sidebar__title">Gradient</h2>
			</header>

			<div className="gradient-sidebar__body">
				{fields.length === 0 ? (
					<div className="gradient-sidebar__empty">
						No extra fields on this map. Enrich locations first.
					</div>
				) : (
					<>
						<label className="gradient-sidebar__control">
							<span className="gradient-sidebar__control-label">Field</span>
							<select
								className="nselect"
								value={fieldKey}
								onChange={(e) => {
									setFieldKey(e.target.value);
								}}
							>
								{fields.map((f) => (
									<option key={f.key} value={f.key}>
										{f.label}
									</option>
								))}
							</select>
						</label>

						<label className="gradient-sidebar__control">
							<span className="gradient-sidebar__control-label">Gradient</span>
							<div className="gradient-sidebar__presets">
								{PRESETS.map((p, i) => (
									<button
										key={p.name}
										className={`gradient-sidebar__preset ${i === presetIdx ? "gradient-sidebar__preset--active" : ""}`}
										onClick={() => {
											setPresetIdx(i);
										}}
										title={p.name}
									>
										<div
											className="gradient-sidebar__preset-bar"
											style={{
												background: `linear-gradient(to right, ${p.stops
													.map(
														(s, si) =>
															`rgb(${s[0]},${s[1]},${s[2]}) ${(si / (p.stops.length - 1)) * 100}%`,
													)
													.join(", ")})`,
											}}
										/>
									</button>
								))}
							</div>
						</label>

						{fieldOpt?.numeric && (
							<label className="gradient-sidebar__control">
								<span className="gradient-sidebar__control-label">Buckets</span>
								<div className="gradient-sidebar__bucket-options">
									{BUCKET_COUNTS.map((n) => (
										<button
											key={n}
											className={`gradient-sidebar__bucket-btn ${n === bucketCount ? "gradient-sidebar__bucket-btn--active" : ""}`}
											onClick={() => {
												setBucketCount(n);
											}}
										>
											{n}
										</button>
									))}
								</div>
							</label>
						)}

						<div className="gradient-sidebar__preview">
							<span className="gradient-sidebar__control-label">Preview</span>
							<div
								className="gradient-sidebar__preview-bar"
								style={{
									background: `linear-gradient(to right, ${preset.stops
										.map(
											(s, i) =>
												`rgb(${s[0]},${s[1]},${s[2]}) ${(i / (preset.stops.length - 1)) * 100}%`,
										)
										.join(", ")})`,
								}}
							/>
							<div className="gradient-sidebar__preview-labels">
								<span>Low</span>
								<span>High</span>
							</div>
						</div>

						<button
							className="button button--primary gradient-sidebar__apply"
							onClick={applyGradient}
							disabled={applying || !fieldKey}
						>
							Apply
						</button>
					</>
				)}
			</div>
		</section>
	);
}
