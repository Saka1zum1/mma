import { useEffect, useState } from "react";
import { cmd } from "@/lib/commands";
import { resolveExactTimestamp } from "@/lib/sv/exactDate.add";
import { getActiveLocation } from "@/store/useMapStore";

export function useExactDate(
	panoId: string | null,
	lat: number,
	lng: number,
	yearMonth: string | null,
	enabled: boolean,
) {
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
		const existing = getActiveLocation()?.extra?.datetime as number | undefined;
		if (existing != null) {
			setState({ ts: existing, loading: false, error: false });
			return;
		}
		if (!enabled || !panoId || !yearMonth) {
			setState({ ts: null, loading: false, error: false });
			return;
		}
		let cancelled = false;
		setState({ ts: null, loading: true, error: false });

		(async () => {
			const cached = await cmd.storeGetPanoDate(panoId);
			if (cancelled) return;
			if (cached !== null) {
				setState({ ts: cached, loading: false, error: false });
				return;
			}
			try {
				const ts = await resolveExactTimestamp(lat, lng, yearMonth);
				if (cancelled) return;
				await cmd.storeSetPanoDate(panoId, ts);
				setState({ ts, loading: false, error: false });
			} catch {
				if (!cancelled) setState({ ts: null, loading: false, error: true });
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [panoId, lat, lng, yearMonth, enabled]);

	return state;
}
