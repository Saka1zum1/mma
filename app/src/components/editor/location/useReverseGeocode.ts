import { useEffect, useState } from "react";
import { cmd } from "@/lib/commands";
import { getSettings } from "@/store/settings";
import { log } from "@/lib/util/log";

interface GeoResult {
	text: string;
	countryCode: string | null;
}

async function geocodeLocal(lat: number, lng: number): Promise<GeoResult | null> {
	const result = await cmd.reverseGeocode(lat, lng);
	if (!result) return null;
	const parts = [result.city, result.admin].filter(Boolean);
	return {
		text: parts.join(", "),
		countryCode: result.country_code?.toUpperCase() ?? null,
	};
}

async function geocodeNominatim(lat: number, lng: number): Promise<GeoResult | null> {
	const apiKey = getSettings().nominatimApiKey;
	const url = new URL("https://nominatim.openstreetmap.org/reverse");
	url.searchParams.set("lat", String(lat));
	url.searchParams.set("lon", String(lng));
	url.searchParams.set("format", "json");
	url.searchParams.set("zoom", "14");
	if (apiKey) url.searchParams.set("key", apiKey);
	const res = await fetch(url.toString(), { headers: { "Accept-Language": "en" } });
	if (!res.ok) return null;
	const data = await res.json();
	if (!data?.address) return null;
	const a = data.address;
	const parts = [a.road, a.suburb || a.town || a.city || a.village, a.state || a.county].filter(
		Boolean,
	);
	return {
		text: parts.join(", "),
		countryCode: (a.country_code as string)?.toUpperCase() ?? null,
	};
}

export function useReverseGeocode(lat: number, lng: number): GeoResult | null {
	const [result, setResult] = useState<GeoResult | null>(null);
	useEffect(() => {
		setResult(null);
		let cancelled = false;
		const provider = getSettings().geocodeProvider;
		const fn = provider === "nominatim" ? geocodeNominatim : geocodeLocal;
		fn(lat, lng)
			.then((r) => {
				if (!cancelled) setResult(r);
			})
			.catch((e) => log.warn("[geocode] reverse geocode failed:", e));
		return () => {
			cancelled = true;
		};
	}, [lat, lng]);
	return result;
}
