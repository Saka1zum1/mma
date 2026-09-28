import { useRef, useState } from "react";
import {
	isGoogleProvider,
	type BaiduTraverseSettings,
	type GeneratorSettings,
	type StreetViewProvider,
} from "../engine/types";
import { traverseRangeFromMap } from "../engine/traverseRange";
import { DatePicker } from "@/components/primitives/DatePicker";
import { NSelect } from "@/components/primitives/NSelect";
import { Radio } from "@/components/primitives/Radio";
import { Checkbox } from "@/components/primitives/Checkbox";
import { SwitchRow } from "@/components/primitives/SwitchRow";
import { Section, SegmentedControl } from "@/components/primitives/Sidebar";
import { t } from "@/lib/i18n";
import { fieldValueLabel, getFieldDef } from "@/lib/data/fieldDefRegistry";
import { TextInput } from "@/components/primitives/TextInput";
import { Button } from "@/components/primitives/Button";
import { Hint } from "@/components/primitives/Hint";
import { distanceUnit } from "@/lib/util/format";
import { useSetting } from "@/store/settings";

function minutesToClock(min: number): string {
	const m = ((Math.trunc(min) % 1440) + 1440) % 1440;
	return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function clockToMinutes(value: string): number {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!match) return 0;
	return Math.min(23, Number(match[1])) * 60 + Math.min(59, Number(match[2]));
}

function ClockInput({
	label,
	minutes,
	onChange,
}: {
	label: string;
	minutes: number;
	onChange: (minutes: number) => void;
}) {
	return (
		<label className="generator-settings__date-label">
			{label}{" "}
			<DatePicker
				mode="date"
				anyTime
				value={minutesToClock(minutes)}
				onChange={(v) => onChange(clockToMinutes(v))}
			/>
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
	title,
}: {
	label: string;
	value: number;
	onChange: (v: number) => void;
	min?: number;
	max?: number;
	step?: number;
	indent?: boolean;
	title?: string;
}) {
	return (
		<label
			className={`generator-settings__number ${indent ? "generator-settings__indent" : ""}`}
			title={title}
		>
			{label}
			<TextInput
				type="number"
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				min={min}
				max={max}
				step={step}
			/>
		</label>
	);
}

/** A metric-stored distance field shown in the user's units. `base` is the unit the setting
 *  is stored in, never what the field displays. */
function DistanceInput({
	label,
	base,
	value,
	onChange,
	min,
	max,
	indent,
}: {
	label?: string;
	base: "m" | "km";
	value: number;
	onChange: (v: number) => void;
	min?: number;
	max?: number;
	indent?: boolean;
}) {
	useSetting("units");
	const unit = distanceUnit(base);
	return (
		<NumberInput
			label={label ? `${label} (${unit.label})` : unit.label}
			value={unit.toDisplay(value)}
			onChange={(v) => onChange(unit.fromDisplay(v))}
			min={min != null ? unit.toDisplay(min) : undefined}
			max={max != null ? unit.toDisplay(max) : undefined}
			indent={indent}
		/>
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
				<Radio
					key={opt.value}
					name={name}
					checked={value === opt.value}
					onChange={() => onChange(opt.value)}
				>
					{opt.label}
				</Radio>
			))}
		</div>
	);
}

function TraverseFields({
	value,
	onChange,
}: {
	value: BaiduTraverseSettings;
	onChange: (next: BaiduTraverseSettings) => void;
}) {
	const set = <K extends keyof BaiduTraverseSettings>(key: K, val: BaiduTraverseSettings[K]) =>
		onChange({ ...value, [key]: val });
	const wrapsMidnight = value.skipStartMin > value.skipEndMin;
	const fileRef = useRef<HTMLInputElement>(null);
	const [mapNote, setMapNote] = useState<{ text: string; error: boolean } | null>(null);
	const loadMapFile = async (file: File) => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(await file.text());
		} catch {
			setMapNote({ text: t("This file is not valid JSON."), error: true });
			return;
		}
		const range = traverseRangeFromMap(parsed);
		if (!range) {
			setMapNote({ text: t("This map file has no Baidu pano ids."), error: true });
			return;
		}
		onChange({ ...value, startPanoId: range.startPanoId, endPanoId: range.endPanoId });
		setMapNote({
			text:
				range.skippedGroups > 0
					? t("Range set from {n} locations. Other cars in the file were left out.", { n: range.count })
					: t("Range set from {n} locations.", { n: range.count }),
			error: false,
		});
	};
	return (
		<div className="generator-settings__traverse">
			<label
				className="generator-settings__number"
				title={t("27-char Baidu panoId. Prefix and car code must match the end ID.")}
			>
				{t("Start panoId")}
				<TextInput
					className="mono"
					spellCheck={false}
					maxLength={27}
					placeholder={t("27-char start ID")}
					value={value.startPanoId}
					onChange={(e) => set("startPanoId", e.target.value)}
				/>
			</label>
			<label
				className="generator-settings__number"
				title={t("27-char Baidu panoId. Prefix and car code must match the start ID.")}
			>
				{t("End panoId")}
				<TextInput
					className="mono"
					spellCheck={false}
					maxLength={27}
					placeholder={t("27-char end ID")}
					value={value.endPanoId}
					onChange={(e) => set("endPanoId", e.target.value)}
				/>
			</label>
			<div className="generator-settings__file">
				<Button small onClick={() => fileRef.current?.click()}>
					{t("From map file")}
				</Button>
				<input
					ref={fileRef}
					type="file"
					accept="application/json,.json"
					hidden
					onChange={(e) => {
						const file = e.target.files?.[0];
						e.target.value = "";
						if (file) void loadMapFile(file);
					}}
				/>
				{mapNote && <Hint tone={mapNote.error ? "error" : undefined}>{mapNote.text}</Hint>}
			</div>
			<Checkbox
				checked={value.useRoughScan}
				title={t(
					"When on: jump by scan step minutes; at each anchor probe every 1ms for scan duration seconds. When off: probe every 1ms from start to end.",
				)}
				onChange={(e) => set("useRoughScan", e.target.checked)}
			>
				{t("Rough scan")}
			</Checkbox>
			{value.useRoughScan && (
				<>
					<NumberInput
						label={t("Scan step (min)")}
						value={value.scanStepMin}
						onChange={(v) => set("scanStepMin", v)}
						min={1}
						max={1440}
						indent
					/>
					<NumberInput
						label={t("Scan duration (s)")}
						value={value.scanDurationSec}
						onChange={(v) => set("scanDurationSec", v)}
						min={1}
						max={3600}
						indent
					/>
				</>
			)}
			<Checkbox
				checked={value.skipTimeEnabled}
				title={t(
					"Skip a fixed daily time range. Set start later than end (e.g. 18:30–06:30) to wrap across midnight.",
				)}
				onChange={(e) => set("skipTimeEnabled", e.target.checked)}
			>
				{t("Skip time range")}
			</Checkbox>
			{value.skipTimeEnabled && (
				<div className="generator-settings__indent">
					<ClockInput
						label={t("Skip start")}
						minutes={value.skipStartMin}
						onChange={(v) => set("skipStartMin", v)}
					/>
					<ClockInput
						label={t("Skip end")}
						minutes={value.skipEndMin}
						onChange={(v) => set("skipEndMin", v)}
					/>
					{wrapsMidnight && (
						<p className="generator-settings__hint">
							{t("Cross-midnight: {from}–{to}", {
								from: minutesToClock(value.skipStartMin),
								to: minutesToClock(value.skipEndMin),
							})}
						</p>
					)}
				</div>
			)}
			<Checkbox
				checked={value.filterNormalCover}
				title={t("Skip panos whose Roads array is non-empty (normal / published coverage).")}
				onChange={(e) => set("filterNormalCover", e.target.checked)}
			>
				{t("Filter normal coverage")}
			</Checkbox>
			<Checkbox
				checked={value.filterTimelineCoverage}
				title={t("Skip panos whose sdata TimeLine has more than one date entry.")}
				onChange={(e) => set("filterTimelineCoverage", e.target.checked)}
			>
				{t("Filter timeline coverage")}
			</Checkbox>
			<NumberInput
				label={t("Concurrency")}
				title={t("Max concurrent batch HTTP requests (50–500)")}
				value={value.concurrency}
				onChange={(v) => set("concurrency", v)}
				min={50}
				max={500}
			/>
			<NumberInput
				label={t("Request timeout (s)")}
				value={value.reqTimeoutSec}
				onChange={(v) => set("reqTimeoutSec", v)}
				min={5}
				max={30}
			/>
			<NumberInput
				label={t("Retry times")}
				title={t("Max retries after the first attempt")}
				value={value.retryTimes}
				onChange={(v) => set("retryTimes", v)}
				min={1}
				max={5}
			/>
			<NumberInput
				label={t("Progress step")}
				title={t("Log progress every N probed IDs")}
				value={value.progressStep}
				onChange={(v) => set("progressStep", v)}
				min={1000}
				max={1_000_000}
			/>
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

	const google = isGoogleProvider(settings.provider);
	const traverse = settings.provider === "baidu" && settings.samplingMode === "traverse";
	const apple = settings.provider === "apple";
	const googleOfficial = google && settings.rejectUnofficial && !settings.rejectOfficial;
	const hasTimeline = !apple;

	return (
		<div className="generator-settings">
			<Section title={t("Provider")}>
				<label className="generator-settings__number">
					<NSelect
						value={settings.provider}
						onChange={(e) => {
							const provider = e.target.value as StreetViewProvider;
							if (provider !== "baidu" && settings.samplingMode === "traverse") {
								onChange({ provider, samplingMode: "random" });
							} else set("provider", provider);
						}}
					>
						<option value="google">{t("Google")}</option>
						<option value="googleZoom">{t("Google tiles")}</option>
						<option value="apple">{t("Apple")}</option>
						<option value="yandex">{t("Yandex")}</option>
						<option value="baidu">{t("Baidu")}</option>
						<option value="tencent">{t("Tencent")}</option>
					</NSelect>
				</label>
			</Section>
			{google && (
			<Section title={t("Coverage settings")}>
				{!settings.rejectOfficial && (
					<>
						<Checkbox
							checked={settings.rejectUnofficial}
							onChange={(e) => set("rejectUnofficial", e.target.checked)}
						>
							{t("Reject unofficial")}
						</Checkbox>
						<Checkbox
							checked={settings.rejectGen1}
							onChange={(e) => set("rejectGen1", e.target.checked)}
						>
							{t("Reject gen 1")}
						</Checkbox>
					</>
				)}
				{settings.rejectUnofficial && !settings.rejectOfficial && !settings.rejectGen1 && (
					<>
						<Checkbox
							checked={settings.findGeneration}
							onChange={(e) => set("findGeneration", e.target.checked)}
						>
							{t("Find generation")}
						</Checkbox>
						{settings.findGeneration && (
							<div className="generator-settings__indent">
								<SegmentedControl
									value={String(settings.generation)}
									onChange={(v) => set("generation", Number(v) as 1 | 23 | 4)}
									options={[
										{ value: "1", label: fieldValueLabel(getFieldDef("cameraType"), "gen1") },
										{ value: "23", label: fieldValueLabel(getFieldDef("cameraType"), "gen2") },
										{ value: "4", label: fieldValueLabel(getFieldDef("cameraType"), "gen4") },
									]}
								/>
							</div>
						)}
						<Checkbox
							checked={settings.rejectDescription}
							onChange={(e) => set("rejectDescription", e.target.checked)}
						>
							{t("Find trekker coverage")}
						</Checkbox>
					</>
				)}
				<Checkbox
					checked={settings.rejectOfficial}
					onChange={(e) => set("rejectOfficial", e.target.checked)}
				>
					{t("Find unofficial coverage")}
				</Checkbox>
			</Section>
			)}

			<Section title={t("Location settings")}>
				<Checkbox
					checked={settings.rejectDateless}
					onChange={(e) => set("rejectDateless", e.target.checked)}
				>
					{t("Reject locations without date")}
				</Checkbox>
				{googleOfficial && !settings.rejectDescription && (
					<Checkbox
						checked={settings.rejectNoDescription}
						onChange={(e) => set("rejectNoDescription", e.target.checked)}
					>
						{t("Reject locations without description")}
					</Checkbox>
				)}
				{hasTimeline && (googleOfficial || !google) && (
					<>
						<Checkbox
							checked={settings.onlyOneInTimeframe}
							onChange={(e) => set("onlyOneInTimeframe", e.target.checked)}
							title={t("Only allow locations that don't have other nearby coverage in timeframe.")}
						>
							{t("Only one panorama on location")}
						</Checkbox>
						<Checkbox
							checked={settings.checkLinks}
							onChange={(e) => set("checkLinks", e.target.checked)}
						>
							{t("Check linked panos")}
						</Checkbox>
						{settings.checkLinks && (
							<NumberInput
								label={t("Depth")}
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

			{(googleOfficial || !google) && (
			<Section title={t("Map making settings")}>
						{googleOfficial && (
							<>
						<Checkbox
							checked={settings.getIntersection}
							onChange={(e) => set("getIntersection", e.target.checked)}
						>
							{t("Find intersection locations")}
						</Checkbox>
						<Checkbox
							checked={settings.pinpointSearch}
							onChange={(e) => set("pinpointSearch", e.target.checked)}
						>
							{t("Find curve locations")}
						</Checkbox>
						{settings.pinpointSearch && (
							<NumberInput
								label={t("Pinpointable angle")}
								value={settings.pinpointAngle}
								onChange={(v) => set("pinpointAngle", v)}
								min={45}
								max={180}
								indent
							/>
						)}
							</>
						)}
						<Checkbox
							checked={settings.adjustHeading}
							onChange={(e) => set("adjustHeading", e.target.checked)}
						>
							{t("Adjust heading")}
						</Checkbox>
						{settings.adjustHeading && (
							<>
								<RadioGroup
									name="headRef"
									indent
									value={settings.headingReference}
									onChange={(v) => set("headingReference", v as "link" | "forward" | "backward")}
									options={[
										{ value: "link", label: t("Along road") },
										{ value: "forward", label: t("To front of car") },
										{ value: "backward", label: t("To back of car") },
									]}
								/>
								<NumberInput
									label={t("Deviation")}
									value={settings.headingDeviation}
									onChange={(v) => set("headingDeviation", v)}
									min={0}
									max={360}
									indent
								/>
								<NumberInput
									label={t("Heading from")}
									value={settings.headingRangeMin}
									onChange={(v) => set("headingRangeMin", v)}
									min={-180}
									max={180}
									indent
								/>
								<NumberInput
									label={t("Heading to")}
									value={settings.headingRangeMax}
									onChange={(v) => set("headingRangeMax", v)}
									min={-180}
									max={180}
									indent
								/>
								<Checkbox
									checked={settings.headingRandomInRange}
									onChange={(e) => set("headingRandomInRange", e.target.checked)}
								>
									{t("Random heading in range")}
								</Checkbox>
							</>
						)}
						<Checkbox
							checked={settings.adjustPitch}
							onChange={(e) => set("adjustPitch", e.target.checked)}
						>
							{t("Adjust pitch")}
						</Checkbox>
						{settings.adjustPitch && (
							<NumberInput
								label={t("Pitch deviation")}
								value={settings.pitchDeviation}
								onChange={(v) => set("pitchDeviation", v)}
								min={-90}
								max={90}
								indent
							/>
						)}
						<Checkbox
							checked={settings.adjustZoom}
							onChange={(e) => set("adjustZoom", e.target.checked)}
						>
							{t("Adjust zoom")}
						</Checkbox>
						{settings.adjustZoom && (
							<NumberInput
								label={t("Zoom level")}
								value={settings.zoomLevel}
								onChange={(v) => set("zoomLevel", v)}
								min={0}
								max={5}
								step={1}
								indent
							/>
						)}
						{hasTimeline && (
						<Checkbox
							checked={settings.randomInTimeline}
							onChange={(e) => set("randomInTimeline", e.target.checked)}
						>
							{t("Choose random date in time range")}
						</Checkbox>
						)}
			</Section>
			)}

			<Section title={t("Tags")}>
				<Checkbox
					checked={settings.tags.enabled}
					onChange={(e) => set("tags", { ...settings.tags, enabled: e.target.checked })}
				>
					{t("Enable auto tagging for locations")}
				</Checkbox>
				{settings.tags.enabled && (
					<div className="generator-settings__indent">
						<Checkbox
							checked={settings.tags.provider}
							onChange={(e) => set("tags", { ...settings.tags, provider: e.target.checked })}
						>
							{t("Street View Provider Tag")}
						</Checkbox>
						<Checkbox
							checked={settings.tags.year}
							onChange={(e) => set("tags", { ...settings.tags, year: e.target.checked })}
						>
							{t("Year Tag (YYYY)")}
						</Checkbox>
						<Checkbox
							checked={settings.tags.month}
							onChange={(e) => set("tags", { ...settings.tags, month: e.target.checked })}
						>
							{t("Month Tag (YY-MM)")}
						</Checkbox>
						<Checkbox
							checked={settings.tags.updateType}
							onChange={(e) => set("tags", { ...settings.tags, updateType: e.target.checked })}
						>
							{t("Update Type Tag (gen?update)")}
						</Checkbox>
						<Checkbox
							checked={settings.tags.country}
							onChange={(e) => set("tags", { ...settings.tags, country: e.target.checked })}
						>
							{t("Country Tag")}
						</Checkbox>
						<Checkbox
							checked={settings.tags.countryCode}
							onChange={(e) => set("tags", { ...settings.tags, countryCode: e.target.checked })}
						>
							{t("CountryCode Tag (ISO-3166 Code)")}
						</Checkbox>
						<Checkbox
							checked={settings.tags.region}
							onChange={(e) => set("tags", { ...settings.tags, region: e.target.checked })}
						>
							{t("Subdivision Tag")}
						</Checkbox>
						<Checkbox
							checked={settings.tags.road}
							onChange={(e) => set("tags", { ...settings.tags, road: e.target.checked })}
						>
							{t("Road Name Tag")}
						</Checkbox>
						<Checkbox
							checked={settings.tags.polygon}
							onChange={(e) => set("tags", { ...settings.tags, polygon: e.target.checked })}
						>
							{t("Polygon Name Tag (GeoJSON)")}
						</Checkbox>
						<Checkbox
							checked={settings.tags.panoId}
							onChange={(e) => set("tags", { ...settings.tags, panoId: e.target.checked })}
						>
							{t("PanoId Tag (Baidu)")}
						</Checkbox>
						<Checkbox
							checked={settings.tags.procdate}
							onChange={(e) => set("tags", { ...settings.tags, procdate: e.target.checked })}
						>
							{t("Publish(Edit) Date Tag (Baidu)")}
						</Checkbox>
					</div>
				)}
			</Section>

			{google && (
				<Section title={t("Notifications")}>
					<Checkbox
						checked={settings.notification.enabled}
						onChange={(e) => {
							const enabled = e.target.checked;
							if (enabled && typeof Notification !== "undefined" && Notification.permission === "default") {
								void Notification.requestPermission();
							}
							set("notification", { ...settings.notification, enabled });
						}}
					>
						{t("Desktop notifications")}
					</Checkbox>
					{settings.notification.enabled && (
						<div className="generator-settings__indent">
							<Checkbox
								checked={settings.notification.anyLocation}
								onChange={(e) =>
									set("notification", { ...settings.notification, anyLocation: e.target.checked })
								}
							>
								{t("First location in a region")}
							</Checkbox>
							<Checkbox
								checked={settings.notification.onePolygonComplete}
								onChange={(e) =>
									set("notification", {
										...settings.notification,
										onePolygonComplete: e.target.checked,
									})
								}
							>
								{t("One region completed")}
							</Checkbox>
							<Checkbox
								checked={settings.notification.allPolygonsComplete}
								onChange={(e) =>
									set("notification", {
										...settings.notification,
										allPolygonsComplete: e.target.checked,
									})
								}
							>
								{t("All regions completed")}
							</Checkbox>
							<Checkbox
								checked={settings.notification.sendToDiscord}
								onChange={(e) =>
									set("notification", { ...settings.notification, sendToDiscord: e.target.checked })
								}
							>
								{t("Also send to Discord")}
							</Checkbox>
							{settings.notification.sendToDiscord && (
								<label className="generator-settings__number">
									{t("Discord webhook")}
									<TextInput
										type="password"
										value={settings.notification.discordWebhook}
										onChange={(e) =>
											set("notification", {
												...settings.notification,
												discordWebhook: e.target.value,
											})
										}
									/>
								</label>
							)}
						</div>
					)}
				</Section>
			)}

			<Section title={t("Extra filters")}>
				{(google || settings.provider === "baidu") && (
					<>
						<Checkbox
							checked={settings.filterByAltitude.enabled}
							onChange={(e) =>
								set("filterByAltitude", { ...settings.filterByAltitude, enabled: e.target.checked })
							}
						>
							{t("Filter by altitude")}
						</Checkbox>
						{settings.filterByAltitude.enabled && (
							<>
								<NumberInput
									label={t("Altitude from")}
									value={settings.filterByAltitude.min}
									onChange={(v) => set("filterByAltitude", { ...settings.filterByAltitude, min: v })}
									min={-200}
									max={9000}
									indent
								/>
								<NumberInput
									label={t("Altitude to")}
									value={settings.filterByAltitude.max}
									onChange={(v) => set("filterByAltitude", { ...settings.filterByAltitude, max: v })}
									min={-200}
									max={9000}
									indent
								/>
							</>
						)}
					</>
				)}
				{!google && (
					<>
						<Checkbox
							checked={settings.filterByMinutes.enabled}
							onChange={(e) =>
								set("filterByMinutes", { ...settings.filterByMinutes, enabled: e.target.checked })
							}
						>
							{t("Filter by time of day")}
						</Checkbox>
						{settings.filterByMinutes.enabled && (
							<div className="generator-settings__indent">
								<ClockInput
									label={t("From")}
									minutes={settings.filterByMinutes.min}
									onChange={(v) => set("filterByMinutes", { ...settings.filterByMinutes, min: v })}
								/>
								<ClockInput
									label={t("To")}
									minutes={settings.filterByMinutes.max}
									onChange={(v) => set("filterByMinutes", { ...settings.filterByMinutes, max: v })}
								/>
							</div>
						)}
					</>
				)}
				{settings.provider === "baidu" && (
					<>
						<Checkbox
							checked={settings.filterByProcdate.enabled}
							onChange={(e) =>
								set("filterByProcdate", { ...settings.filterByProcdate, enabled: e.target.checked })
							}
						>
							{t("Filter by publish date")}
						</Checkbox>
						{settings.filterByProcdate.enabled && (
							<div className="generator-settings__date-range">
								<label className="generator-settings__date-label">
									{t("From")}{" "}
									<DatePicker
										mode="date"
										value={settings.filterByProcdate.from}
										onChange={(v) => set("filterByProcdate", { ...settings.filterByProcdate, from: v })}
									/>
								</label>
								<label className="generator-settings__date-label">
									{t("To")}{" "}
									<DatePicker
										mode="date"
										value={settings.filterByProcdate.to}
										onChange={(v) => set("filterByProcdate", { ...settings.filterByProcdate, to: v })}
									/>
								</label>
							</div>
						)}
					</>
				)}
				{(settings.provider === "yandex" || (google && !settings.rejectUnofficial)) && (
					<>
						<Checkbox
							checked={settings.findByAuthor.enabled}
							onChange={(e) =>
								set("findByAuthor", { ...settings.findByAuthor, enabled: e.target.checked })
							}
						>
							{t("Find by author")}
						</Checkbox>
						{settings.findByAuthor.enabled && (
							<div className="generator-settings__indent">
								<NSelect
									value={settings.findByAuthor.filterType}
									onChange={(e) =>
										set("findByAuthor", {
											...settings.findByAuthor,
											filterType: e.target.value as "include" | "exclude",
										})
									}
								>
									<option value="include">{t("Include")}</option>
									<option value="exclude">{t("Exclude")}</option>
								</NSelect>
								<TextInput
									value={settings.findByAuthor.author}
									placeholder={t("Author")}
									onChange={(e) =>
										set("findByAuthor", { ...settings.findByAuthor, author: e.target.value })
									}
								/>
							</div>
						)}
					</>
				)}
				{google && settings.rejectOfficial && (
					<>
						<Checkbox
							checked={settings.findPhotospheres}
							onChange={(e) => set("findPhotospheres", e.target.checked)}
						>
							{t("Photospheres only")}
						</Checkbox>
						<Checkbox
							checked={settings.findDrones}
							onChange={(e) => set("findDrones", e.target.checked)}
						>
							{t("Drones only")}
						</Checkbox>
					</>
				)}
				{settings.provider === "tencent" && (
					<Checkbox
						checked={settings.findNightCoverage}
						onChange={(e) => set("findNightCoverage", e.target.checked)}
					>
						{t("Night coverage only")}
					</Checkbox>
				)}
			</Section>

			<Section title={t("General settings")}>
				{!traverse && (
				<DistanceInput
					label={t("Radius")}
					base="m"
					value={settings.radius}
					onChange={(v) => set("radius", v)}
					min={10}
					max={1000000}
				/>
				)}
				<div className="generator-settings__number">
					{t("Sampling")}
					<SegmentedControl
						value={settings.samplingMode}
						onChange={(v) => set("samplingMode", v as GeneratorSettings["samplingMode"])}
						options={[
							{ value: "random", label: t("Random") },
							{ value: "poisson", label: t("Uniform") },
							{ value: "grid", label: t("Grid") },
							{ value: "blueline", label: t("Coverage") },
							{ value: "kernels", label: t("Grow") },
							...(settings.provider === "baidu"
								? [{ value: "traverse" as const, label: t("Traverse") }]
								: []),
						]}
					/>
				</div>
				{settings.provider === "baidu" && settings.samplingMode === "traverse" && (
					<TraverseFields
						value={settings.traverse}
						onChange={(traverse) => set("traverse", traverse)}
					/>
				)}
				{settings.samplingMode === "blueline" && (
					<div className="generator-settings__number">
						{t("Distribution")}
						<SegmentedControl
							value={settings.distribution}
							onChange={(v) => set("distribution", v as GeneratorSettings["distribution"])}
							options={[
								{ value: "density", label: t("Density") },
								{ value: "balanced", label: t("Balanced") },
								{ value: "even", label: t("Even") },
							]}
						/>
					</div>
				)}
				{!traverse && (
				<Checkbox
					checked={settings.oneCountryAtATime}
					onChange={(e) => set("oneCountryAtATime", e.target.checked)}
				>
					{t("Only check one country/polygon at a time")}
				</Checkbox>
				)}
				{!settings.selectMonths && (
					<div className="generator-settings__date-range">
						<label className="generator-settings__date-label">
							{t("From")}{" "}
							<DatePicker
								mode="month"
								value={settings.fromDate}
								onChange={(v) => set("fromDate", v)}
							/>
						</label>
						<label className="generator-settings__date-label">
							{t("To")}{" "}
							<DatePicker mode="month" value={settings.toDate} onChange={(v) => set("toDate", v)} />
						</label>
					</div>
				)}
				{!settings.rejectOfficial && (
					<>
						<Checkbox
							checked={settings.selectMonths}
							onChange={(e) => set("selectMonths", e.target.checked)}
						>
							{t("Filter by month")}
						</Checkbox>
						{settings.selectMonths && (
							<div className="generator-settings__indent">
								<div className="generator-settings__date-range">
									<label className="generator-settings__date-label">
										{t("From month")}{" "}
										<TextInput
											style={{ width: "3rem" }}
											value={settings.fromMonth}
											onChange={(e) => set("fromMonth", e.target.value)}
										/>
									</label>
									<label className="generator-settings__date-label">
										{t("to")}{" "}
										<TextInput
											style={{ width: "3rem" }}
											value={settings.toMonth}
											onChange={(e) => set("toMonth", e.target.value)}
										/>
									</label>
								</div>
								<div className="generator-settings__date-range">
									<label className="generator-settings__date-label">
										{t("Between years")}{" "}
										<TextInput
											style={{ width: "4rem" }}
											value={settings.fromYear}
											onChange={(e) => set("fromYear", e.target.value)}
										/>
									</label>
									<label className="generator-settings__date-label">
										{t("and")}{" "}
										<TextInput
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
				{!traverse && !settings.rejectOfficial && (
					<>
						<Checkbox
							checked={settings.findRegions}
							onChange={(e) => set("findRegions", e.target.checked)}
						>
							{t("Filter by minimum distance from locations")}
						</Checkbox>
						{settings.findRegions && (
							<DistanceInput
								base="km"
								value={settings.regionRadius}
								onChange={(v) => set("regionRadius", v)}
								min={1}
								indent
							/>
						)}
					</>
				)}
				<Checkbox
					checked={settings.skipExisting}
					onChange={(e) => set("skipExisting", e.target.checked)}
				>
					{t("Skip near existing map locations")}
				</Checkbox>
				{settings.skipExisting && (
					<DistanceInput
						base="m"
						value={settings.skipExistingRadius}
						onChange={(v) => set("skipExistingRadius", v)}
						min={1}
						indent
					/>
				)}
				{hasTimeline && !settings.rejectOfficial && (
				<Checkbox
					checked={settings.checkAllDates}
					onChange={(e) => set("checkAllDates", e.target.checked)}
				>
					{t("Check all dates")}
				</Checkbox>
				)}
			</Section>
			<Section title={t("Advanced filters")} defaultOpen={false}>
				<Checkbox
					checked={settings.searchInDescription}
					onChange={(e) => set("searchInDescription", e.target.checked)}
				>
					{t("Search in panorama description")}
				</Checkbox>
				{settings.searchInDescription && (
					<div className="generator-settings__indent generator-settings__desc-search">
						<div className="generator-settings__desc-search-row">
							<SegmentedControl
								value={settings.searchFilterType}
								onChange={(v) => set("searchFilterType", v as "include" | "exclude")}
								options={[
									{ value: "include", label: t("Include") },
									{ value: "exclude", label: t("Exclude") },
								]}
							/>
							<NSelect
								compact
								value={settings.searchMode}
								onChange={(e) =>
									set("searchMode", e.target.value as GeneratorSettings["searchMode"])
								}
							>
								<option value="contains">{t("Contains")}</option>
								<option value="fullword">{t("Full word")}</option>
								<option value="startswith">{t("Starts with")}</option>
								<option value="endswith">{t("Ends with")}</option>
								<option value="sectionmatch">{t("Section match")}</option>
							</NSelect>
						</div>
						<TextInput
							type="text"
							placeholder={t("Comma-separated terms")}
							value={settings.searchTerms}
							onChange={(e) => set("searchTerms", e.target.value)}
						/>
					</div>
				)}
				{googleOfficial && (
					<>
				<Checkbox
					checked={settings.filterByLinks}
					onChange={(e) => set("filterByLinks", e.target.checked)}
				>
					{t("Filter by number of links")}
				</Checkbox>
				{settings.filterByLinks && (
					<div className="generator-settings__indent generator-settings__date-range">
						<NumberInput
							label={t("Min")}
							value={settings.minLinks}
							onChange={(v) => set("minLinks", v)}
							min={0}
							max={10}
						/>
						<NumberInput
							label={t("Max")}
							value={settings.maxLinks}
							onChange={(v) => set("maxLinks", v)}
							min={0}
							max={10}
						/>
					</div>
				)}
				<Checkbox
					checked={settings.findCurves}
					onChange={(e) => set("findCurves", e.target.checked)}
				>
					{t("Find curves")}
				</Checkbox>
				{settings.findCurves && (
					<NumberInput
						label={t("Min curve angle")}
						value={settings.minCurveAngle}
						onChange={(v) => set("minCurveAngle", v)}
						min={5}
						max={90}
						indent
					/>
				)}
					</>
				)}
			</Section>

			{!traverse && (
			<Section title={t("Visualization")} defaultOpen={false}>
				<SwitchRow
					label={t("Show search coverage")}
					checked={settings.showSearchOverlay}
					onChange={(v) => set("showSearchOverlay", v)}
				>
					<span
						title={t(
							"Draw where the generator has searched, as a growing overlay. Clears when you stop.",
						)}
					>
						{t("Show search coverage")}
					</span>
				</SwitchRow>
			</Section>
			)}
		</div>
	);
}
