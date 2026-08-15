const { registerPlugin } = window.MMA;
import { JsonEditorPanel } from "./JsonEditorPanel";
import { mdiCodeBraces } from "@mdi/js";
import { msg } from "@/lib/i18n";

if (import.meta.env.DEV) {
	registerPlugin({
		id: "json-editor",
		name: msg("JSON editor"),
		description: msg("View and edit location data as JSON"),
		icon: mdiCodeBraces,
		activate() {},
		locationPanel: JsonEditorPanel,
	});
}
