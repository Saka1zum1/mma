const { registerPlugin } = window.MMA;
import { ValiSidebar } from "./ui/ValiSidebar";
import { mdiEarth } from "@mdi/js";
import { msg } from "@/lib/i18n";

registerPlugin({
	id: "vali",
	name: "Vali",
	description: msg("Generate locations from pre-built coverage data using Vali"),
	icon: mdiEarth,
	keepAlive: true,
	activate() {},
	sidebar: ValiSidebar,
});
