import { registerPlugin } from "@/plugins/registry";
import { GeneratorSidebar } from "./ui/GeneratorSidebar";
import { mountCoverageOverlay } from "./coverageOverlay";
import { mdiMapMarkerPlus } from "@mdi/js";
import { msg } from "@/lib/i18n";

registerPlugin({
	id: "map-generator",
	name: msg("Map generator"),
	description: msg("Generate locations from Street View coverage"),
	icon: mdiMapMarkerPlus,
	activate() {
		return mountCoverageOverlay();
	},
	sidebar: GeneratorSidebar,
});
