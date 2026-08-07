const { registerPlugin } = window.MMA;
import { mdiMapMarker } from "@mdi/js";
import { GeoGuessrSidebar } from "./GeoGuessrSidebar";
import { controller } from "./provider";

registerPlugin({
	id: "geoguessr",
	name: "GeoGuessr",
	description: "Bidirectional sync with Geoguessr maps",
	icon: mdiMapMarker,
	experimental: true,
	sidebar: GeoGuessrSidebar,
	activate() {
		const M = window.MMA;
		// Resume the live loop when a linked map is (re)opened and live was left on.
		const resume = () => {
			if (controller.getLink() && controller.livePref()) controller.startLive();
		};
		resume();
		const offOpen = M.on("map:open", resume);
		const offClose = M.on("map:close", controller.pauseLive);
		return () => {
			offOpen();
			offClose();
			controller.pauseLive();
		};
	},
});
