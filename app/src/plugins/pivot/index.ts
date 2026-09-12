import { registerPlugin } from "@/plugins/registry";
import { PivotSidebar } from "./PivotSidebar";
import { mdiTablePivot } from "@mdi/js";
import { msg } from "@/lib/i18n";

registerPlugin({
	id: "pivot",
	name: msg("Pivot Table"),
	description: msg("Cross-tabulate selections against location metadata"),
	icon: mdiTablePivot,
	activate() {},
	sidebar: PivotSidebar,
});
