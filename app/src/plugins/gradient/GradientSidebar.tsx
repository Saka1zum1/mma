import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@/components/primitives/Icon";
import { mdiArrowLeft } from "@mdi/js";
import type { ExtraFieldDef } from "@/types";
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

function lerp(
	a: [number, number, number],
	b: [number, number, number],
	t: number,
): [number, number, number] {
	return [
		Math.round(a[0] + (b[0] - a[0]) * t),
		Math.round(a[1] + (b[1] - a[1]) * t),
		Math.round(a[2] + (b[2] - a[2]) * t),
	];
}

function gradientColor(stops: [number, number, number][], t: number): [number, number, number] {
	if (t <= 0) return stops[0];
	if (t >= 1) return stops[stops.length - 1];
	const segment = t * (stops.length - 1);
	const i = Math.floor(segment);
	return lerp(stops[i], stops[Math.min(i + 1, stops.length - 1)], segment - i);
}

interface FieldOption {
	key: string;
	label: string;
	def: ExtraFieldDef | undefined;
	numeric: boolean;
}

function isNumericField(def: ExtraFieldDef | undefined): boolean {
	if (!def) return false;
	return def.type === "number" || def.type === "date";
}

function isDateLikeField(def: ExtraFieldDef | undefined, key: string): boolean {
	if (def?.type === "date" || def?.type === "month") return true;
	return key === "imageDate" || key === "datetime";
}

export function GradientSidebar({ onClose }: { onClose: () => void }) {
	const [fieldKey, setFieldKey] = useState("");
	const [presetIdx, setPresetIdx] = useState(0);
	const [bucketCount, setBucketCount] = useState(10);
	const [applying, setApplying] = useState(false);
	const [applied, setApplied] = useState(false);

	const map = MMA.getCurrentMap();

	const fields = useMemo((): FieldOption[] => {
		const result: FieldOption[] = [];
		if (!map?.meta.extra?.fields) return result;
		for (const [key, raw] of Object.entries(map.meta.extra.fields)) {
			const def = raw as ExtraFieldDef;
			const numeric = isNumericField(def) || isDateLikeField(def, key);
			if (numeric || def.type === "enum" || def.type === "string") {
				result.push({ key, label: def.label ?? key, def, numeric });
			}
		}
		return result;
	}, [map?.meta.extra?.fields]);

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
		setApplied(false);
		try {
			const { fetchAllLocations } = await import("@/store/useMapStore");
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
				// Numeric: compute range, create "between" filter buckets
				let nums: number[];
				if (isDateLikeField(fieldOpt.def, fieldKey)) {
					nums = values
						.map((v) => {
							const s = String(v.raw);
							const ts = Date.parse(s);
							return isNaN(ts) ? Number(v.raw) : ts / 1000;
						})
						.filter((n) => !isNaN(n));
				} else {
					nums = values.map((v) => Number(v.raw)).filter((n) => !isNaN(n));
				}
				if (nums.length === 0) return;

				const min = Math.min(...nums);
				const max = Math.max(...nums);
				if (min === max) return;

				const step = (max - min) / bucketCount;
				const props = [];
				const colors: { key: string; color: [number, number, number] }[] = [];
				for (let i = 0; i < bucketCount; i++) {
					const lo = min + step * i;
					const hi = i === bucketCount - 1 ? max : min + step * (i + 1);
					props.push({
						type: "Filter" as const,
						field: fieldKey,
						op: "between" as const,
						value: lo,
						value2: hi,
					});
					colors.push({
						key: `filter:${fieldKey}:between:${lo}:${hi}`,
						color: gradientColor(preset.stops, i / (bucketCount - 1)),
					});
				}
				await MMA.addSelection(props);
				MMA.setSelectionColor(colors);
			} else {
				// Enum/string: one bucket per distinct value
				const distinct = [...new Set(values.map((v) => String(v.raw)))].sort();
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
						distinct.length === 1 ? 0.5 : i / (distinct.length - 1),
					),
				}));
				await MMA.addSelection(props);
				MMA.setSelectionColor(colors);
			}
			setApplied(true);
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
									setApplied(false);
								}}
							>
								{fields.map((f) => (
									<option key={f.key} value={f.key}>
										{f.label}
										{f.numeric ? "" : " (categorical)"}
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
											setApplied(false);
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
												setApplied(false);
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
							{applying ? "Applying..." : applied ? "Reapply" : "Apply"}
						</button>

						{applied && (
							<div className="gradient-sidebar__hint">
								Selections created. You can intersect these with other selections.
							</div>
						)}
					</>
				)}
			</div>
		</section>
	);
}
