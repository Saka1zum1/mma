import { useMemo } from "react";
import tzlookup from "@photostructure/tz-lookup";

export function resolveTimezone(lat: number, lng: number): string {
	return tzlookup(lat, lng);
}

export function useTimezone(lat: number, lng: number, enabled: boolean): string | null {
	return useMemo(() => (enabled ? tzlookup(lat, lng) : null), [lat, lng, enabled]);
}
