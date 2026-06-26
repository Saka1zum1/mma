import { LocationFlag, isPinnedToPano } from "@/types";
import type { Location } from "@/bindings.gen";
import { registerSvResolver, runResolvers, type SvResolver } from "@/lib/sv/svRunner";
import { isOfficialPano } from "@/lib/sv/panoId";

export interface PinPanoConfig {
	useLatest?: boolean;
}

/** Pin to pano ID: resolve the pano from coords, then set the LoadAsPanoId flag.
 *  With `useLatest`, fetches the timeline and picks the last official pano. */
export const pinPanoResolver: SvResolver = {
	id: "pinPano",
	label: "Pin to pano ID",
	pending: (loc, force) => force || !isPinnedToPano(loc),
	needsPanoResolve: () => true,
	needsMetadata: (config) => !!(config as PinPanoConfig)?.useLatest,
	resolve: (loc, data, ctx) => {
		const config = ctx.config as PinPanoConfig | undefined;
		if (config?.useLatest && data) {
			const timeline = (data.time ?? []).filter((t) => isOfficialPano(t.pano));
			const latest = timeline.length > 0 ? timeline[timeline.length - 1] : null;
			if (latest) {
				return {
					panoId: latest.pano,
					flags: loc.flags | LocationFlag.LoadAsPanoId,
				};
			}
			return null;
		}
		if (ctx.resolvedPanoId) {
			return { flags: loc.flags | LocationFlag.LoadAsPanoId };
		}
		return null;
	},
};

registerSvResolver(pinPanoResolver);

export async function bulkPinToPano(
	locations: Location[],
	opts: {
		signal?: AbortSignal;
		force?: boolean;
		useLatest?: boolean;
		onProgress?: (done: number, total: number) => void;
	} = {},
): Promise<number> {
	const { useLatest, ...runOpts } = opts;
	const config: PinPanoConfig = { useLatest };
	const result = await runResolvers(locations, [{ id: "pinPano", config }], runOpts);
	return result.pinPano?.success.length ?? 0;
}
