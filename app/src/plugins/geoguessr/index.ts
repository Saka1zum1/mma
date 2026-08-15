const { registerPlugin } = window.MMA;
import { mdiMapMarker } from "@mdi/js";
import { GeoGuessrSidebar } from "./GeoGuessrSidebar";
import { controller } from "./provider";
import { activateSyncPlugin } from "@/lib/sync/controller";
import { msg } from "@/lib/i18n";

registerPlugin({
	id: "geoguessr",
	name: "GeoGuessr",
	description: msg("Bidirectional sync with GeoGuessr maps"),
	icon: mdiMapMarker,
	experimental: true,
	sidebar: GeoGuessrSidebar,
	activate: () => activateSyncPlugin(controller),
});
