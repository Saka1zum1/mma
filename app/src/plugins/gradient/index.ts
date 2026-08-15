const { registerPlugin } = window.MMA;
import { GradientSidebar } from "./GradientSidebar";
import { mdiGradientHorizontal } from "@mdi/js";
import { msg } from "@/lib/i18n";

registerPlugin({
	id: "gradient",
	name: msg("Gradient"),
	description: msg("Color locations by field value using gradient buckets"),
	icon: mdiGradientHorizontal,
	activate() {},
	sidebar: GradientSidebar,
});
