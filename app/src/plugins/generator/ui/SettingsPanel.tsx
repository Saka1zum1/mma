import type { GeneratorSettings } from "../engine/types";
import { DatePicker } from "@/components/primitives/DatePicker";
import { NSelect } from "@/components/primitives/NSelect";
import { Radio } from "@/components/primitives/Radio";
import { Checkbox } from "@/components/primitives/Checkbox";
import { Section, SegmentedControl } from "@/components/primitives/Sidebar";
import { useT } from "@/lib/i18n";

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
			<Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />
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
				className="text-input"
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
					<Radio name={name} checked={value === opt.value} onChange={() => onChange(opt.value)} />
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
	const { t } = useT();
	const set = <K extends keyof GeneratorSettings>(key: K, val: GeneratorSettings[K]) =>
		onChange({ [key]: val });

	return (
		<div className="generator-settings">
			<Section title={t("plugin.generator.coverageSettings")}>
				{!settings.rejectOfficial && (
					<>
						<Check
							label={t("plugin.generator.rejectUnofficial")}
							checked={settings.rejectUnofficial}
							onChange={(v) => set("rejectUnofficial", v)}
						/>
						<Check
							label={t("plugin.generator.rejectGen1")}
							checked={settings.rejectGen1}
							onChange={(v) => set("rejectGen1", v)}
						/>
					</>
				)}
				{settings.rejectUnofficial && !settings.rejectOfficial && !settings.rejectGen1 && (
					<>
						<Check
							label={t("plugin.generator.findGeneration")}
							checked={settings.findGeneration}
							onChange={(v) => set("findGeneration", v)}
						/>
						{settings.findGeneration && (
							<div className="generator-settings__indent">
								<SegmentedControl
									value={String(settings.generation)}
									onChange={(v) => set("generation", Number(v) as 1 | 23 | 4)}
									options={[
										{ value: "1", label: t("plugin.generator.gen1") },
										{ value: "23", label: t("plugin.generator.gen23") },
										{ value: "4", label: t("plugin.generator.gen4") },
									]}
								/>
							</div>
						)}
						<Check
							label={t("plugin.generator.findTrekkerCoverage")}
							checked={settings.rejectDescription}
							onChange={(v) => set("rejectDescription", v)}
						/>
					</>
				)}
				<Check
					label={t("plugin.generator.findUnofficialCoverage")}
					checked={settings.rejectOfficial}
					onChange={(v) => set("rejectOfficial", v)}
				/>
			</Section>

			<Section title={t("plugin.generator.locationSettings")}>
				{settings.rejectUnofficial && !settings.rejectOfficial && (
					<Check
						label={t("plugin.generator.rejectDateless")}
						checked={settings.rejectDateless}
						onChange={(v) => set("rejectDateless", v)}
					/>
				)}
				{settings.rejectUnofficial && !settings.rejectOfficial && !settings.rejectDescription && (
					<Check
						label={t("plugin.generator.rejectNoDescription")}
						checked={settings.rejectNoDescription}
						onChange={(v) => set("rejectNoDescription", v)}
					/>
				)}
				{settings.rejectUnofficial && !settings.rejectOfficial && (
					<>
						<Check
							label={t("plugin.generator.onlyOnePano")}
							checked={settings.onlyOneInTimeframe}
							onChange={(v) => set("onlyOneInTimeframe", v)}
							title={t("plugin.generator.onlyOnePanoHint")}
						/>
						<Check
							label={t("plugin.generator.checkLinkedPanos")}
							checked={settings.checkLinks}
							onChange={(v) => set("checkLinks", v)}
						/>
						{settings.checkLinks && (
							<NumberInput
								label={t("plugin.generator.depth")}
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

			<Section title={t("plugin.generator.mapMakingSettings")}>
				{settings.rejectUnofficial && !settings.rejectOfficial && (
					<>
						<Check
							label={t("plugin.generator.findIntersectionLocations")}
							checked={settings.getIntersection}
							onChange={(v) => set("getIntersection", v)}
						/>
						<Check
							label={t("plugin.generator.findCurveLocations")}
							checked={settings.pinpointSearch}
							onChange={(v) => set("pinpointSearch", v)}
						/>
						{settings.pinpointSearch && (
							<NumberInput
								label={t("plugin.generator.pinpointableAngle")}
								value={settings.pinpointAngle}
								onChange={(v) => set("pinpointAngle", v)}
								min={45}
								max={180}
								indent
							/>
						)}
						<Check
							label={t("plugin.generator.adjustHeading")}
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
										{ value: "link", label: t("plugin.generator.alongRoad") },
										{ value: "forward", label: t("plugin.generator.toFrontOfCar") },
										{ value: "backward", label: t("plugin.generator.toBackOfCar") },
									]}
								/>
								<NumberInput
									label={t("plugin.generator.deviation")}
									value={settings.headingDeviation}
									onChange={(v) => set("headingDeviation", v)}
									min={0}
									max={360}
									indent
								/>
							</>
						)}
						<Check
							label={t("plugin.generator.adjustPitch")}
							checked={settings.adjustPitch}
							onChange={(v) => set("adjustPitch", v)}
						/>
						{settings.adjustPitch && (
							<NumberInput
								label={t("plugin.generator.pitchDeviation")}
								value={settings.pitchDeviation}
								onChange={(v) => set("pitchDeviation", v)}
								min={-90}
								max={90}
								indent
							/>
						)}
						<Check
							label={t("plugin.generator.adjustZoom")}
							checked={settings.adjustZoom}
							onChange={(v) => set("adjustZoom", v)}
						/>
						{settings.adjustZoom && (
							<NumberInput
								label={t("plugin.generator.zoomLevel")}
								value={settings.zoomLevel}
								onChange={(v) => set("zoomLevel", v)}
								min={0}
								max={5}
								step={1}
								indent
							/>
						)}
						<Check
							label={t("plugin.generator.chooseRandomDate")}
							checked={settings.randomInTimeline}
							onChange={(v) => set("randomInTimeline", v)}
						/>
					</>
				)}
			</Section>

			<Section title={t("plugin.generator.generalSettings")}>
				<NumberInput
					label={t("plugin.generator.radius")}
					value={settings.radius}
					onChange={(v) => set("radius", v)}
					min={10}
					max={1000000}
				/>
				<label className="generator-settings__number">
					{t("plugin.generator.sampling")}
					<SegmentedControl
						value={settings.samplingMode}
						onChange={(v) => set("samplingMode", v as GeneratorSettings["samplingMode"])}
						options={[
							{ value: "random", label: t("plugin.generator.sampling.random") },
							{ value: "poisson", label: t("plugin.generator.sampling.poisson") },
							{ value: "blueline", label: t("plugin.generator.sampling.blueline") },
							{ value: "kernels", label: t("plugin.generator.sampling.kernels") },
						]}
					/>
				</label>
				<NumberInput
					label={t("plugin.generator.generators")}
					value={settings.numGenerators}
					onChange={(v) => set("numGenerators", v)}
					min={1}
					max={10}
				/>
				<NumberInput
					label={t("plugin.generator.speed")}
					value={settings.speed}
					onChange={(v) => set("speed", v)}
					min={1}
					max={1000}
				/>
				<Check
					label={t("plugin.generator.oneRegionAtATime")}
					checked={settings.oneCountryAtATime}
					onChange={(v) => set("oneCountryAtATime", v)}
				/>
				{!settings.selectMonths && (
					<div className="generator-settings__date-range">
						<label className="generator-settings__date-label">
							{t("plugin.generator.from")}{" "}
							<DatePicker
								mode="month"
								value={settings.fromDate}
								onChange={(v) => set("fromDate", v)}
							/>
						</label>
						<label className="generator-settings__date-label">
							{t("plugin.generator.to")}{" "}
							<DatePicker mode="month" value={settings.toDate} onChange={(v) => set("toDate", v)} />
						</label>
					</div>
				)}
				{!settings.rejectOfficial && (
					<>
						<Check
							label={t("plugin.generator.filterByMonth")}
							checked={settings.selectMonths}
							onChange={(v) => set("selectMonths", v)}
						/>
						{settings.selectMonths && (
							<div className="generator-settings__indent">
								<div className="generator-settings__date-range">
									<label className="generator-settings__date-label">
										{t("plugin.generator.fromMonth")}{" "}
										<input
											className="text-input"
											style={{ width: "3rem" }}
											value={settings.fromMonth}
											onChange={(e) => set("fromMonth", e.target.value)}
										/>
									</label>
									<label className="generator-settings__date-label">
										{t("plugin.generator.toMonth")}{" "}
										<input
											className="text-input"
											style={{ width: "3rem" }}
											value={settings.toMonth}
											onChange={(e) => set("toMonth", e.target.value)}
										/>
									</label>
								</div>
								<div className="generator-settings__date-range">
									<label className="generator-settings__date-label">
										{t("plugin.generator.betweenYears")}{" "}
										<input
											className="text-input"
											style={{ width: "4rem" }}
											value={settings.fromYear}
											onChange={(e) => set("fromYear", e.target.value)}
										/>
									</label>
									<label className="generator-settings__date-label">
										{t("plugin.generator.betweenYearsAnd")}{" "}
										<input
											className="text-input"
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
							label={t("plugin.generator.filterByDistance")}
							checked={settings.findRegions}
							onChange={(v) => set("findRegions", v)}
						/>
						{settings.findRegions && (
							<NumberInput
								label={t("plugin.generator.km")}
								value={settings.regionRadius}
								onChange={(v) => set("regionRadius", v)}
								min={1}
								indent
							/>
						)}
					</>
				)}
				<Check
					label={t("plugin.generator.skipNearExisting")}
					checked={settings.skipExisting}
					onChange={(v) => set("skipExisting", v)}
				/>
				{settings.skipExisting && (
					<NumberInput
						label={t("plugin.generator.m")}
						value={settings.skipExistingRadius}
						onChange={(v) => set("skipExistingRadius", v)}
						min={1}
						indent
					/>
				)}
				<Check
					label={t("plugin.generator.checkAllDates")}
					checked={settings.checkAllDates}
					onChange={(v) => set("checkAllDates", v)}
				/>
			</Section>
			<Section title={t("plugin.generator.advancedFilters")} defaultOpen={false}>
				<Check
					label={t("plugin.generator.searchInDescription")}
					checked={settings.searchInDescription}
					onChange={(v) => set("searchInDescription", v)}
				/>
				{settings.searchInDescription && (
					<div className="generator-settings__indent generator-settings__desc-search">
						<div className="generator-settings__desc-search-row">
							<SegmentedControl
								value={settings.searchFilterType}
								onChange={(v) => set("searchFilterType", v as "include" | "exclude")}
								options={[
									{ value: "include", label: t("plugin.generator.search.include") },
									{ value: "exclude", label: t("plugin.generator.search.exclude") },
								]}
							/>
							<NSelect
								className="nselect--compact"
								value={settings.searchMode}
								onChange={(e) =>
									set("searchMode", e.target.value as GeneratorSettings["searchMode"])
								}
							>
								<option value="contains">{t("plugin.generator.search.contains")}</option>
								<option value="fullword">{t("plugin.generator.search.fullWord")}</option>
								<option value="startswith">{t("plugin.generator.search.startsWith")}</option>
								<option value="endswith">{t("plugin.generator.search.endsWith")}</option>
								<option value="sectionmatch">{t("plugin.generator.search.sectionMatch")}</option>
							</NSelect>
						</div>
						<input
							className="text-input"
							type="text"
							placeholder={t("plugin.generator.commaSeparatedTerms")}
							value={settings.searchTerms}
							onChange={(e) => set("searchTerms", e.target.value)}
						/>
					</div>
				)}
				<Check
					label={t("plugin.generator.filterByLinks")}
					checked={settings.filterByLinks}
					onChange={(v) => set("filterByLinks", v)}
				/>
				{settings.filterByLinks && (
					<div className="generator-settings__indent generator-settings__date-range">
						<NumberInput
							label={t("plugin.generator.min")}
							value={settings.minLinks}
							onChange={(v) => set("minLinks", v)}
							min={0}
							max={10}
						/>
						<NumberInput
							label={t("plugin.generator.max")}
							value={settings.maxLinks}
							onChange={(v) => set("maxLinks", v)}
							min={0}
							max={10}
						/>
					</div>
				)}
			</Section>

			<Section title={t("plugin.generator.visualization")} defaultOpen={false}>
				<Check
					label={t("plugin.generator.showSearchCoverage")}
					checked={settings.showSearchOverlay}
					onChange={(v) => set("showSearchOverlay", v)}
					title={t("plugin.generator.showSearchCoverageHint")}
				/>
			</Section>
		</div>
	);
}
