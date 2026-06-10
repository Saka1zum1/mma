import { LocationFlag, isPinnedToPano } from "@/types";
import type { Location } from "@/types";
import { registerSvResolver, runResolvers, type SvResolver } from "@/lib/sv/svRunner";

/** Pin to pano ID: resolve the pano from coords, then set the LoadAsPanoId flag.
 *  Flags only panos resolved this run. */
export const pinPanoResolver: SvResolver = {
	id: "pinPano",
	label: "Pin to pano ID",
	pending: (loc, force) => force || !isPinnedToPano(loc),
	needsPanoResolve: () => true,
	needsMetadata: false,
	resolve: (loc, _data, ctx) =>
		ctx.resolvedPanoId ? { flags: loc.flags | LocationFlag.LoadAsPanoId } : null,
};

registerSvResolver(pinPanoResolver);

export async function bulkPinToPano(
	locations: Location[],
	opts: {
		signal?: AbortSignal;
		force?: boolean;
		onProgress?: (done: number, total: number) => void;
	} = {},
): Promise<number> {
	const result = await runResolvers(locations, [{ id: "pinPano" }], opts);
	return result.pinPano?.success.length ?? 0;
}
