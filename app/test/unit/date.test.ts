import { describe, it, expect } from "vitest";
import { parseTypedDate, MONTHS } from "@/lib/util/date";
import { partsToEpoch } from "@/lib/data/fieldOps";

describe("MONTHS", () => {
	it("short and full names align by index", () => {
		expect(MONTHS.short).toHaveLength(12);
		expect(MONTHS.full).toHaveLength(12);
		MONTHS.full.forEach((full, i) => {
			expect(full.startsWith(MONTHS.short[i])).toBe(true);
		});
	});
});

describe("parseTypedDate", () => {
	const date = { mode: "date" as const };
	const epoch = (y: number, mo: number, d: number, h = 0, mi = 0, wall = false) =>
		String(partsToEpoch({ y, mo, d, h, mi }, wall));

	it("parses ISO, US, and month-name full dates to the same epoch", () => {
		const expected = epoch(2019, 5, 3);
		expect(parseTypedDate("2019-06-03", date)).toBe(expected);
		expect(parseTypedDate("6/3/2019", date)).toBe(expected);
		expect(parseTypedDate("Jun 3, 2019", date)).toBe(expected);
		expect(parseTypedDate("3 june 2019", date)).toBe(expected);
	});

	it("accepts a trailing time only when withTime is set", () => {
		expect(parseTypedDate("2019-06-03 14:30", { ...date, withTime: true })).toBe(
			epoch(2019, 5, 3, 14, 30),
		);
		expect(parseTypedDate("2019-06-03 14:30", date)).toBeNull();
	});

	it("encodes wall-clock dates in the UTC frame", () => {
		expect(parseTypedDate("2019-06-03", { ...date, wallClock: true })).toBe(
			epoch(2019, 5, 3, 0, 0, true),
		);
	});

	it("rejects invalid dates and garbage", () => {
		expect(parseTypedDate("2019-13-03", date)).toBeNull();
		expect(parseTypedDate("2019-06-40", date)).toBeNull();
		expect(parseTypedDate("hello", date)).toBeNull();
		expect(parseTypedDate("", date)).toBeNull();
		expect(parseTypedDate("2019", date)).toBeNull();
	});

	it("parses month mode from ISO, slash, and name forms", () => {
		expect(parseTypedDate("2019-06", { mode: "month" })).toBe("2019-06");
		expect(parseTypedDate("06/2019", { mode: "month" })).toBe("2019-06");
		expect(parseTypedDate("Jun 2019", { mode: "month" })).toBe("2019-06");
		expect(parseTypedDate("2019 Jun", { mode: "month" })).toBe("2019-06");
		expect(parseTypedDate("Jun", { mode: "month" })).toBeNull();
	});

	it("parses anyYear month as a bare month token", () => {
		expect(parseTypedDate("Jun", { mode: "month", anyYear: true })).toBe("06");
		expect(parseTypedDate("6", { mode: "month", anyYear: true })).toBe("06");
		expect(parseTypedDate("13", { mode: "month", anyYear: true })).toBeNull();
	});

	it("parses anyYear date as month-day", () => {
		expect(parseTypedDate("06-03", { mode: "date", anyYear: true })).toBe("06-03");
		expect(parseTypedDate("6/3", { mode: "date", anyYear: true })).toBe("06-03");
		expect(parseTypedDate("Jun 3", { mode: "date", anyYear: true })).toBe("06-03");
		expect(parseTypedDate("3 Jun", { mode: "date", anyYear: true })).toBe("06-03");
	});

	it("parses anyTime as HH:MM", () => {
		expect(parseTypedDate("14:30", { mode: "date", anyTime: true })).toBe("14:30");
		expect(parseTypedDate("9", { mode: "date", anyTime: true })).toBe("09:00");
		expect(parseTypedDate("25:00", { mode: "date", anyTime: true })).toBeNull();
	});
});
