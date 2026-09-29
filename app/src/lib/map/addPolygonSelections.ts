import type { PolygonGeometry } from "@/bindings.gen";
import { cmd } from "@/lib/commands";
import { addSelections } from "@/store/useMapStore";

/** Add each polygon as a selection, redrawn so its edges never cross: the map then shades
 *  exactly the area the selection holds. Polygons that enclose no area are dropped. */
export async function addPolygonSelections(polygons: PolygonGeometry[]) {
	const untangled = await Promise.all(polygons.map((polygon) => cmd.polygonUntangle(polygon)));
	const selectors = untangled
		.filter((polygon) => polygon !== null)
		.map((polygon) => ({
			type: "Polygon" as const,
			polygon,
			includeInformational: false,
		}));
	if (selectors.length) await addSelections(selectors);
}
