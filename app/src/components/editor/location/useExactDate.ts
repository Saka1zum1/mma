import { useEffect, useState } from "react";
import { resolveExactTimestamp } from "@/lib/sv/exactDate";
import { useActiveLocation } from "@/store/useMapStore";

export function useExactDate(
	panoId: string | null,
	lat: number,
	lng: number,
	yearMonth: string | null,
	enabled: boolean,
) {
	// Subscribe to the active location reactively so extra.datetime updates
	// when switching locations. The other deps (panoId, lat, lng, yearMonth)
	// come from viewer state — which pano in the time slider is being viewed.
	const location = useActiveLocation();
	const existingDatetime = location?.extra?.datetime as number | undefined;

	const [state, setState] = useState<{
		ts: number | null;
		loading: boolean;
		error: boolean;
	}>({
		ts: null,
		loading: false,
		error: false,
	});

	useEffect(() => {
		if (existingDatetime != null) {
			setState({ ts: existingDatetime, loading: false, error: false });
			return;
		}
		if (!enabled || !panoId || !yearMonth) {
			setState({ ts: null, loading: false, error: false });
			return;
		}
		let cancelled = false;
		setState({ ts: null, loading: true, error: false });

		(async () => {
			try {
				const ts = await resolveExactTimestamp(lat, lng, yearMonth);
				if (cancelled) return;
				setState({ ts, loading: false, error: false });
			} catch {
				if (!cancelled) setState({ ts: null, loading: false, error: true });
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [panoId, lat, lng, yearMonth, enabled, existingDatetime]);

	return state;
}
