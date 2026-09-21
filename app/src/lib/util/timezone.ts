import { useMemo } from "react";
import tzlookup from "@photostructure/tz-lookup";
import type { Selector } from "@/bindings.gen";
import { countIn } from "@/store/useMapStore";
import { buildSelection } from "@/store/selections";
import { t } from "@/lib/i18n";

export function resolveTimezone(lat: number, lng: number): string {
	return tzlookup(lat, lng);
}

export function useTimezone(lat: number, lng: number, enabled: boolean): string | null {
	return useMemo(() => (enabled ? tzlookup(lat, lng) : null), [lat, lng, enabled]);
}

/** Rows in `selector` that have `field` but no timezone, so a local-timezone date group would skip them. */
export async function countMissingTimezone(
	selector: Selector,
	field: string,
	fieldType: string,
	tzLocal: boolean,
): Promise<number> {
	if (!tzLocal || fieldType !== "date") return 0;
	return countIn({
		type: "Intersection",
		selections: [
			buildSelection(selector),
			buildSelection({ type: "Filter", field, op: "has", value: true }),
			buildSelection({ type: "Filter", field: "timezone", op: "nothas", value: true }),
		],
	});
}

export function missingTimezoneMessage(n: number): string {
	return t(
		{
			one: "{n} location skipped: no timezone. Enrich timezones, or set the date timezone to UTC.",
			other:
				"{n} locations skipped: no timezone. Enrich timezones, or set the date timezone to UTC.",
		},
		{ n },
	);
}
