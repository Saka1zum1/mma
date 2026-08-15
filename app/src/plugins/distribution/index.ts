const { registerPlugin } = window.MMA;
import { DistributionSidebar } from "./DistributionSidebar";
import { mdiChartBar } from "@mdi/js";
import { msg } from "@/lib/i18n";

registerPlugin({
	id: "distribution",
	name: msg("Distribution"),
	description: msg("View how locations are distributed across countries"),
	icon: mdiChartBar,
	activate() {},
	sidebar: DistributionSidebar,
});
