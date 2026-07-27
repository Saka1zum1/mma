import { VisionSidebar } from "./VisionSidebar";
import { FindSimilarButton } from "./FindSimilarButton";
import { stopServe } from "./sidecar";

MMA.registerPlugin({
	activate() {
		return () => stopServe();
	},
	sidebar: VisionSidebar,
	locationPanel: FindSimilarButton,
	comingSoon: true
});
