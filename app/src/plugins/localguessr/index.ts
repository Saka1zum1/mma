const { registerPlugin } = window.MMA;
import { GameSidebar } from "./GameSidebar";
import { mdiGamepadVariantOutline } from "@mdi/js";

registerPlugin({
	id: "localguessr",
	name: "LocalGuessr",
	description: "Play GeoGuessr games using your own map location data",
	icon: mdiGamepadVariantOutline,
	core: true,
	activate() {},
	sidebar: GameSidebar,
});
