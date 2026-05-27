import { useState, useCallback } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import * as Popover from "@radix-ui/react-popover";

interface DatePickerProps {
	mode: "date" | "month";
	value: string;
	onChange: (v: string) => void;
	anyYear?: boolean;
	onAnyYearToggle?: (v: boolean) => void;
	showAnyYear?: boolean;
	showTime?: boolean;
	anyTime?: boolean;
	onAnyTimeToggle?: (v: boolean) => void;
	showAnyTime?: boolean;
	onYearSelect?: (year: number) => void;
}

const MONTHS_SHORT = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

function parseToDate(value: string): Date | null {
	if (!value) return null;
	// "MM" (anyYear month)
	const mm = /^(\d{2})$/.exec(value);
	if (mm) return new Date(2000, Number(mm[1]) - 1, 1);
	// "MM-DD"
	const md = /^(\d{2})-(\d{2})$/.exec(value);
	if (md) return new Date(2000, Number(md[1]) - 1, Number(md[2]));
	// "YYYY-MM"
	const ym = /^(\d{4})-(\d{2})$/.exec(value);
	if (ym) return new Date(Number(ym[1]), Number(ym[2]) - 1, 1);
	// unix timestamp
	const n = Number(value);
	if (!isNaN(n) && value !== "") return new Date(n * 1000);
	return null;
}

function formatDisplay(
	value: string,
	mode: "date" | "month",
	anyYear?: boolean,
	anyTime?: boolean,
): string {
	if (!value) return "Select...";
	if (anyTime) {
		return /^\d{2}:\d{2}$/.test(value) ? value : "Select...";
	}
	const d = parseToDate(value);
	if (!d) return "Select...";
	if (anyYear) {
		if (mode === "month") {
			return MONTHS_SHORT[d.getMonth()] ?? "Select...";
		}
		return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
	}
	if (mode === "month") {
		return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
	}
	const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
	const dateStr = d.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
	if (hasTime) {
		const timeStr = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
		return `${dateStr} ${timeStr}`;
	}
	return dateStr;
}

function MonthGrid({
	value,
	onChange,
	anyYear,
	onYearSelect,
}: {
	value: string;
	onChange: (v: string) => void;
	anyYear?: boolean;
	onYearSelect?: (year: number) => void;
}) {
	const parsed = parseToDate(value);
	const [year, setYear] = useState(() => parsed?.getFullYear() ?? new Date().getFullYear());
	const selectedMonth = parsed ? parsed.getMonth() : -1;
	const selectedYear = parsed?.getFullYear();

	const handleClick = (monthIdx: number) => {
		if (anyYear) {
			onChange(pad2(monthIdx + 1));
		} else {
			onChange(`${year}-${pad2(monthIdx + 1)}`);
		}
	};

	const currentYear = new Date().getFullYear();
	const yearStart = 2007;
	const years = Array.from({ length: currentYear - yearStart + 1 }, (_, i) => yearStart + i);

	return (
		<div className="month-grid">
			{!anyYear && (
				<div className="month-grid__nav">
					<button type="button" onClick={() => setYear((y) => y - 1)}>
						&lt;
					</button>
					<span>{year}</span>
					<button type="button" onClick={() => setYear((y) => y + 1)}>
						&gt;
					</button>
				</div>
			)}
			{onYearSelect && !anyYear && (
				<div className="month-grid__years">
					{years.map((y) => (
						<button
							key={y}
							type="button"
							className="month-grid__cell"
							onClick={() => onYearSelect(y)}
						>
							{y}
						</button>
					))}
				</div>
			)}
			<div className="month-grid__months">
				{MONTHS_SHORT.map((name, i) => {
					const isSelected = i === selectedMonth && (anyYear || selectedYear === year);
					return (
						<button
							key={name}
							type="button"
							className={`month-grid__cell${isSelected ? " month-grid__cell--selected" : ""}`}
							onClick={() => handleClick(i)}
						>
							{name}
						</button>
					);
				})}
			</div>
		</div>
	);
}

export function DatePicker({
	mode,
	value,
	onChange,
	anyYear,
	onAnyYearToggle,
	showAnyYear,
	showTime,
	anyTime,
	onAnyTimeToggle,
	showAnyTime,
	onYearSelect,
}: DatePickerProps) {
	const [open, setOpen] = useState(false);

	const selectedDate = parseToDate(value) ?? undefined;
	const [navMonth, setNavMonth] = useState<Date>(() => selectedDate ?? new Date());
	const [pendingDate, setPendingDate] = useState<Date | null>(null);
	const [time, setTime] = useState("00:00");

	const commitValue = useCallback(
		(date: Date, timeStr: string) => {
			if (anyYear) {
				onChange(`${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`);
			} else {
				const [h, m] = timeStr.split(":").map(Number);
				const ts =
					Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), h || 0, m || 0) / 1000;
				onChange(String(Math.floor(ts)));
			}
		},
		[anyYear, onChange],
	);

	const handleDaySelect = useCallback(
		(date: Date | undefined) => {
			if (!date) return;
			if (showTime && !anyYear) {
				setPendingDate(date);
				commitValue(date, time);
			} else {
				if (anyYear) {
					onChange(`${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`);
				} else {
					onChange(String(Math.floor(date.getTime() / 1000)));
				}
				setOpen(false);
			}
		},
		[anyYear, onChange, showTime, time, commitValue],
	);

	const handleTimeChange = useCallback(
		(newTime: string) => {
			setTime(newTime);
			const date = pendingDate ?? selectedDate;
			if (date) commitValue(date, newTime);
		},
		[pendingDate, selectedDate, commitValue],
	);

	const handleMonthSelect = useCallback(
		(v: string) => {
			onChange(v);
			setOpen(false);
		},
		[onChange],
	);

	const handleOpenChange = useCallback(
		(isOpen: boolean) => {
			if (isOpen) {
				const existing = parseToDate(value);
				if (existing) {
					setTime(`${pad2(existing.getUTCHours())}:${pad2(existing.getUTCMinutes())}`);
				} else {
					setTime("00:00");
				}
				setPendingDate(null);
			}
			setOpen(isOpen);
		},
		[value],
	);

	return (
		<Popover.Root open={open} onOpenChange={handleOpenChange}>
			<Popover.Trigger asChild>
				<button type="button" className="date-picker__trigger">
					{formatDisplay(value, mode, anyYear, anyTime)}
				</button>
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Content
					className="date-picker__popover"
					sideOffset={4}
					align="start"
					collisionPadding={8}
					onOpenAutoFocus={(e) => e.preventDefault()}
				>
					{anyTime ? (
						<div className="date-picker__time-only">
							<label>
								Time of day:
								<input
									type="time"
									value={/^\d{2}:\d{2}$/.test(value) ? value : ""}
									onChange={(e) => onChange(e.target.value)}
								/>
							</label>
						</div>
					) : mode === "month" ? (
						<MonthGrid value={value} onChange={handleMonthSelect} anyYear={anyYear} onYearSelect={onYearSelect ? (y) => { onYearSelect(y); setOpen(false); } : undefined} />
					) : (
						<>
							<DayPicker
								mode="single"
								selected={pendingDate ?? selectedDate}
								onSelect={handleDaySelect}
								month={navMonth}
								onMonthChange={setNavMonth}
								captionLayout="dropdown"
								navLayout="around"
								startMonth={new Date(2007, 0)}
								endMonth={new Date(new Date().getFullYear() + 1, 11)}
							/>
							{showTime && !anyYear && (
								<div className="date-picker__time">
									<label>
										Time (UTC):
										<input
											type="time"
											value={time}
											onChange={(e) => handleTimeChange(e.target.value)}
										/>
									</label>
								</div>
							)}
						</>
					)}
					{(showAnyYear || showAnyTime) && (
						<div className="date-picker__toggles">
							{showAnyYear && (
								<label className="date-picker__any-year">
									<input
										type="checkbox"
										checked={anyYear ?? false}
										onChange={(e) => onAnyYearToggle?.(e.target.checked)}
									/>
									Any year
								</label>
							)}
							{showAnyTime && (
								<label className="date-picker__any-year">
									<input
										type="checkbox"
										checked={anyTime ?? false}
										onChange={(e) => onAnyTimeToggle?.(e.target.checked)}
									/>
									Any date
								</label>
							)}
						</div>
					)}
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	);
}
