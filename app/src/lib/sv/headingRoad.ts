import type { Location } from "@/types";
import { normalizeHeading } from "@/lib/sv/lookup";
import { registerSvResolver, runResolvers, type SvResolver } from "@/lib/sv/svRunner";

export type RoadDirection = "forwards" | "backwards";

/** Pan a location's heading along the road. The driving direction comes from
 *  `fetchSvMetadata` as `extra.drivingDirection` (this source has no `tiles.centerHeading`).
 *  "forwards" faces it, "backwards" faces the opposite. */
export const headingRoadResolver: SvResolver = {
	id: "headingRoad",
	label: "Pan heading along road",
	pending: () => true,
	needsPanoResolve: (loc) => !loc.panoId,
	needsMetadata: true,
	resolve: (_loc, data, ctx) => {
		const center = data?.extra?.drivingDirection;
		if (center == null) return null;
		const direction = (ctx.config as RoadDirection) ?? "forwards";
		return { heading: direction === "backwards" ? normalizeHeading(center - 180) : center };
	},
};

registerSvResolver(headingRoadResolver);

export async function bulkPanHeading(
	locations: Location[],
	direction: RoadDirection,
	opts: {
		signal?: AbortSignal;
		onProgress?: (done: number, total: number) => void;
	} = {},
): Promise<number> {
	const result = await runResolvers(locations, [{ id: "headingRoad", config: direction }], opts);
	return result.headingRoad?.success.length ?? 0;
}
