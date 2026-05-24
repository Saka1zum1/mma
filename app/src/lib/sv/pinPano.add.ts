import { getCurrentMap, batchUpdateLocations } from "@/store/useMapStore";
import { LocationFlag, isPinnedToPano } from "@/types";
import type { Location } from "@/types";
import { resolvePanoIds } from "./lookup.add";

export async function bulkPinToPano(
	locations: Location[],
	opts: {
		signal?: AbortSignal;
		force?: boolean;
		onProgress?: (done: number, total: number) => void;
	} = {},
): Promise<number> {
	const { signal, force, onProgress } = opts;
	const map = getCurrentMap();
	if (!map) return 0;

	const pending: Location[] = locations.filter((l) => force || !isPinnedToPano(l));
	if (pending.length === 0) return 0;

	const panoResult = await resolvePanoIds(pending, {
		signal,
		onProgress,
	});

	const flagUpdates = panoResult.resolved.map((r) => {
		const loc = pending.find((l) => l.id === r.id)!;
		return { id: r.id, patch: { flags: loc.flags | LocationFlag.LoadAsPanoId } };
	});
	if (flagUpdates.length > 0) batchUpdateLocations(flagUpdates);

	return panoResult.resolved.length;
}
