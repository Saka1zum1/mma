import { useState } from "react";
import type { GeneratorSettings } from "../engine/types";
import { DatePicker } from "@/components/primitives/DatePicker";

function Section({
	title,
	children,
	defaultOpen = true,
}: {
	title: string;
	children: React.ReactNode;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="generator-settings__section">
			<h4 className="generator-settings__section-title" onClick={() => setOpen(!open)}>
				{open ? "▾" : "▸"} {title}
			</h4>
			{open && <div className="generator-settings__section-body">{children}</div>}
		</div>
	);
}

function Check({
	label,
	checked,
	onChange,
	title,
}: {
	label: string;
	checked: boolean;
	onChange: (v: boolean) => void;
	title?: string;
}) {
	return (
		<label className="generator-settings__check" title={title}>
			<input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
			{label}
		</label>
	);
}

function NumberInput({
	label,
	value,
	onChange,
	min,
	max,
	step,
	indent,
}: {
	label: string;
	value: number;
	onChange: (v: number) => void;
	min?: number;
	max?: number;
	step?: number;
	indent?: boolean;
}) {
	return (
		<label className={`generator-settings__number ${indent ? "generator-settings__indent" : ""}`}>
			{label}
			<input
				type="number"
				className="input"
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				min={min}
				max={max}
				step={step}
			/>
		</label>
	);
}

function RadioGroup({
	name,
	options,
	value,
	onChange,
	indent,
}: {
	name: string;
	options: { value: string; label: string }[];
	value: string;
	onChange: (v: string) => void;
	indent?: boolean;
}) {
	return (
		<div className={`generator-settings__radios ${indent ? "generator-settings__indent" : ""}`}>
			{options.map((opt) => (
				<label key={opt.value} className="generator-settings__radio">
					<input
						type="radio"
						name={name}
						checked={value === opt.value}
						onChange={() => onChange(opt.value)}
					/>
					{opt.label}
				</label>
			))}
		</div>
	);
}

export function SettingsPanel({
	settings,
	onChange,
}: {
	settings: GeneratorSettings;
	onChange: (patch: Partial<GeneratorSettings>) => void;
}) {
	const set = <K extends keyof GeneratorSettings>(key: K, val: GeneratorSettings[K]) =>
		onChange({ [key]: val });

	return (
		<div className="generator-settings">
			<Section title="Coverage settings">
				{!settings.rejectOfficial && (
					<>
						<Check
							label="Reject unofficial"
							checked={settings.rejectUnofficial}
							onChange={(v) => set("rejectUnofficial", v)}
						/>
						<Check
							label="Reject gen 1"
							checked={settings.rejectGen1}
							onChange={(v) => set("rejectGen1", v)}
						/>
					</>
				)}
				{settings.rejectUnofficial && !settings.rejectOfficial && !settings.rejectGen1 && (
					<>
						<Check
							label="Find generation"
							checked={settings.findGeneration}
							onChange={(v) => set("findGeneration", v)}
						/>
						{settings.findGeneration && (
							<RadioGroup
								name="gen"
								indent
								value={String(settings.generation)}
								onChange={(v) => set("generation", Number(v) as 1 | 23 | 4)}
								options={[
									{ value: "1", label: "Gen 1" },
									{ value: "23", label: "Gen 2/3" },
									{ value: "4", label: "Gen 4" },
								]}
							/>
						)}
						<Check
							label="Find trekker coverage"
							checked={settings.rejectDescription}
							onChange={(v) => set("rejectDescription", v)}
						/>
					</>
				)}
				<Check
					label="Find unofficial coverage"
					checked={settings.rejectOfficial}
					onChange={(v) => set("rejectOfficial", v)}
				/>
			</Section>

			<Section title="Location settings">
				{settings.rejectUnofficial && !settings.rejectOfficial && (
					<Check
						label="Reject locations without date"
						checked={settings.rejectDateless}
						onChange={(v) => set("rejectDateless", v)}
					/>
				)}
				{settings.rejectUnofficial && !settings.rejectOfficial && !settings.rejectDescription && (
					<Check
						label="Reject locations without description"
						checked={settings.rejectNoDescription}
						onChange={(v) => set("rejectNoDescription", v)}
					/>
				)}
				{settings.rejectUnofficial && !settings.rejectOfficial && (
					<>
						<Check
							label="Only one panorama on location"
							checked={settings.onlyOneInTimeframe}
							onChange={(v) => set("onlyOneInTimeframe", v)}
							title="Only allow locations that don't have other nearby coverage in timeframe."
						/>
						<Check
							label="Check linked panos"
							checked={settings.checkLinks}
							onChange={(v) => set("checkLinks", v)}
						/>
						{settings.checkLinks && (
							<NumberInput
								label="Depth"
								value={settings.linksDepth}
								onChange={(v) => set("linksDepth", v)}
								min={1}
								max={10}
								indent
							/>
						)}
					</>
				)}
			</Section>

			<Section title="Map making settings">
				{settings.rejectUnofficial && !settings.rejectOfficial && (
					<>
						<Check
							label="Find intersection locations"
							checked={settings.getIntersection}
							onChange={(v) => set("getIntersection", v)}
						/>
						<Check
							label="Find curve locations"
							checked={settings.pinpointSearch}
							onChange={(v) => set("pinpointSearch", v)}
						/>
						{settings.pinpointSearch && (
							<NumberInput
								label="Pinpointable angle"
								value={settings.pinpointAngle}
								onChange={(v) => set("pinpointAngle", v)}
								min={45}
								max={180}
								indent
							/>
						)}
						<Check
							label="Adjust heading"
							checked={settings.adjustHeading}
							onChange={(v) => set("adjustHeading", v)}
						/>
						{settings.adjustHeading && (
							<>
								<RadioGroup
									name="headRef"
									indent
									value={settings.headingReference}
									onChange={(v) => set("headingReference", v as "link" | "forward" | "backward")}
									options={[
										{ value: "link", label: "Along road" },
										{ value: "forward", label: "To front of car" },
										{ value: "backward", label: "To back of car" },
									]}
								/>
								<NumberInput
									label="Deviation"
									value={settings.headingDeviation}
									onChange={(v) => set("headingDeviation", v)}
									min={0}
									max={360}
									indent
								/>
							</>
						)}
						<Check
							label="Adjust pitch"
							checked={settings.adjustPitch}
							onChange={(v) => set("adjustPitch", v)}
						/>
						{settings.adjustPitch && (
							<NumberInput
								label="Pitch deviation"
								value={settings.pitchDeviation}
								onChange={(v) => set("pitchDeviation", v)}
								min={-90}
								max={90}
								indent
							/>
						)}
						<Check
							label="Choose random date in time range"
							checked={settings.randomInTimeline}
							onChange={(v) => set("randomInTimeline", v)}
						/>
					</>
				)}
			</Section>

			<Section title="General settings">
				<NumberInput
					label="Radius"
					value={settings.radius}
					onChange={(v) => set("radius", v)}
					min={10}
					max={1000000}
				/>
				<NumberInput
					label="Generators"
					value={settings.numGenerators}
					onChange={(v) => set("numGenerators", v)}
					min={1}
					max={10}
				/>
				<Check
					label="Only check one country/polygon at a time"
					checked={settings.oneCountryAtATime}
					onChange={(v) => set("oneCountryAtATime", v)}
				/>
				{!settings.selectMonths && (
					<div className="generator-settings__date-range">
						<label className="generator-settings__date-label">
							From{" "}
							<DatePicker
								mode="month"
								value={settings.fromDate}
								onChange={(v) => set("fromDate", v)}
							/>
						</label>
						<label className="generator-settings__date-label">
							To{" "}
							<DatePicker
								mode="month"
								value={settings.toDate}
								onChange={(v) => set("toDate", v)}
							/>
						</label>
					</div>
				)}
				{!settings.rejectOfficial && (
					<>
						<Check
							label="Filter by month"
							checked={settings.selectMonths}
							onChange={(v) => set("selectMonths", v)}
						/>
						{settings.selectMonths && (
							<div className="generator-settings__indent">
								<div className="generator-settings__date-range">
									<label className="generator-settings__date-label">
										From month{" "}
										<input
											className="input"
											style={{ width: "3rem" }}
											value={settings.fromMonth}
											onChange={(e) => set("fromMonth", e.target.value)}
										/>
									</label>
									<label className="generator-settings__date-label">
										to{" "}
										<input
											className="input"
											style={{ width: "3rem" }}
											value={settings.toMonth}
											onChange={(e) => set("toMonth", e.target.value)}
										/>
									</label>
								</div>
								<div className="generator-settings__date-range">
									<label className="generator-settings__date-label">
										Between years{" "}
										<input
											className="input"
											style={{ width: "4rem" }}
											value={settings.fromYear}
											onChange={(e) => set("fromYear", e.target.value)}
										/>
									</label>
									<label className="generator-settings__date-label">
										and{" "}
										<input
											className="input"
											style={{ width: "4rem" }}
											value={settings.toYear}
											onChange={(e) => set("toYear", e.target.value)}
										/>
									</label>
								</div>
							</div>
						)}
					</>
				)}
				{!settings.rejectOfficial && (
					<>
						<Check
							label="Filter by minimum distance from locations"
							checked={settings.findRegions}
							onChange={(v) => set("findRegions", v)}
						/>
						{settings.findRegions && (
							<NumberInput
								label="km"
								value={settings.regionRadius}
								onChange={(v) => set("regionRadius", v)}
								min={1}
								indent
							/>
						)}
					</>
				)}
				<Check
					label="Check all dates"
					checked={settings.checkAllDates}
					onChange={(v) => set("checkAllDates", v)}
				/>
			</Section>
		</div>
	);
}
