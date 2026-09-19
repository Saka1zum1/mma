import { LocationFlag, isPinnedToPano } from "@/types";
import type { Location } from "@/bindings.gen";
import { registerSvResolver, runResolvers, type SvResolver } from "@/lib/sv/svRunner";
import { newestOfficialPano } from "@/lib/sv/panoId";
import type { BatchOutcome } from "@/lib/data/procedures";
import { msg } from "@/lib/i18n";

export interface PinPanoConfig {
	useLatest?: boolean;
}

/** Pin to pano ID: resolve the pano from coords, then set the LoadAsPanoId flag.
 *  With `useLatest`, fetches the timeline and picks the last official pano.
 *  The prelude re-resolves Google rows against official coverage only: the closest
 *  pano can be a photosphere, and a bulk pin must never relocate rows onto one. */
export const pinPanoResolver: SvResolver = {
	id: "pinPano",
	label: msg("Pin to pano ID"),
	pending: (loc, force) => force || !isPinnedToPano(loc),
	needsPanoResolve: () => true,
	needsMetadata: (config) => !!(config as PinPanoConfig)?.useLatest,
	resolve: (loc, data, ctx) => {
		const config = ctx.config as PinPanoConfig | undefined;
		if (config?.useLatest && data) {
			const latest = newestOfficialPano(data.time ?? []);
			if (latest) {
				return {
					panoId: latest.pano,
					flags: loc.flags | LocationFlag.LoadAsPanoId,
				};
			}
			return null;
		}
		if (ctx.resolvedPanoId) {
			return {
				panoId: ctx.resolvedPanoId,
				flags: loc.flags | LocationFlag.LoadAsPanoId,
			};
		}
		return null;
	},
};

registerSvResolver(pinPanoResolver);

/** Pin each location to a resolved panorama (sets `panoId`), so it always loads the same pano. */
export async function bulkPinToPano(
	locations: Location[],
	opts: {
		signal?: AbortSignal;
		force?: boolean;
		useLatest?: boolean;
		onProgress?: (done: number, total: number) => void;
	} = {},
): Promise<BatchOutcome> {
	const { useLatest, ...runOpts } = opts;
	const config: PinPanoConfig = { useLatest };
	const result = await runResolvers(locations, [{ id: "pinPano", config }], runOpts);
	return {
		succeeded: result.pinPano?.success.length ?? 0,
		failed: result.pinPano?.failed ?? [],
	};
}
