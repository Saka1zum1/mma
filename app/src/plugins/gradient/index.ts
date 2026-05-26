const { registerPlugin } = window.MMA;
import { GradientSidebar } from "./GradientSidebar";
import { mdiGradientHorizontal } from "@mdi/js";

registerPlugin({
	id: "gradient",
	name: "Gradient",
	description: "Color locations by field value using gradient buckets",
	icon: mdiGradientHorizontal,
	activate() {},
	sidebar: GradientSidebar,
});
