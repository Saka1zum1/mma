const { registerPlugin } = window.MMA;
import { HyperlapseSidebar } from "./HyperlapseSidebar";
import { mountRouteOverlay } from "./routeOverlay";
import { mdiVideoMarker } from "@mdi/js";

registerPlugin({
	id: "hyperlapse",
	name: "Road Trip",
	experimental: true,
	description: "Build and play Road Trip sequences from selected Street View locations",
	icon: mdiVideoMarker,
	activate() {
		return mountRouteOverlay();
	},
	sidebar: HyperlapseSidebar,
});
