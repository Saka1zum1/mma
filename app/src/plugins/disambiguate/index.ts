const { registerPlugin } = window.MMA;
import { DisambiguateSidebar } from "./DisambiguateSidebar";
import { mdiCompare } from "@mdi/js";
import { msg } from "@/lib/i18n";

registerPlugin({
	id: "disambiguate",
	name: msg("Disambiguate"),
	description: msg("Rank metadata fields by how strongly they separate selections"),
	icon: mdiCompare,
	activate() {},
	sidebar: DisambiguateSidebar,
});
