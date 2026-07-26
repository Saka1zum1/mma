import { subscribe } from "@/lib/events";
import { getLocale, t, toBcp47 } from "@/lib/i18n";

export const APP_NAME = "Map Making App";

function localeTag() {
	return toBcp47(getLocale());
}

export let fmt = new Intl.NumberFormat("en");
export let dateFmt = new Intl.DateTimeFormat("en-US", {
	year: "numeric",
	month: "short",
});
export let shortDateFmt = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
});
/** Day-level date like "21 May 2021" (alt pano providers / historical pickers). */
export let panoDayFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

function refreshFormatters() {
	const tag = localeTag();
	fmt = new Intl.NumberFormat(tag);
	dateFmt = new Intl.DateTimeFormat(tag, { year: "numeric", month: "short" });
	shortDateFmt = new Intl.DateTimeFormat(tag, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
	panoDayFmt = new Intl.DateTimeFormat(tag === "en" ? "en-GB" : tag, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

refreshFormatters();
subscribe("locale:changed", refreshFormatters);

/** Location timestamps are Unix seconds; JS Date wants milliseconds. */
export function locDate(secs: number): Date {
	return new Date(secs * 1000);
}

/** Compact local-time "YYYY-MM-DD HH:MM" for a Unix-seconds instant. Matches the
 *  local-time interpretation the DatePicker uses, so filter chips agree with it. */
export function localDateTime(secs: number): string {
	const d = new Date(secs * 1000);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Compact "YYYY-MM-DD HH:MM" reading the instant in UTC. For wall-clock values
 *  that encode the picked numbers as a UTC epoch (DatePicker `wallClock` mode). */
export function utcDateTime(secs: number): string {
	return new Date(secs * 1000).toISOString().slice(0, 16).replace("T", " ");
}

/** Current time as Unix seconds, the form Location timestamps use. */
export function nowUnix(): number {
	return Math.floor(Date.now() / 1000);
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export function relativeTime(time: string | number): string {
	const ms = typeof time === "number" ? time * 1000 : new Date(time).getTime();
	const delta = Date.now() - ms;
	if (delta < MINUTE) return t("time.justNow");
	if (delta < HOUR) return t("time.minutesAgo", { count: Math.floor(delta / MINUTE) });
	if (delta < DAY) return t("time.hoursAgo", { count: Math.floor(delta / HOUR) });
	if (delta < 30 * DAY) return t("time.daysAgo", { count: Math.floor(delta / DAY) });
	return shortDateFmt.format(new Date(ms));
}
