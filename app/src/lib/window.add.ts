import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { log } from "@/lib/util/log";

export async function openMapWindow(id: string, name: string): Promise<void> {
	const label = `map-${id}`;
	const existing = await WebviewWindow.getByLabel(label);
	if (existing) {
		if (await existing.isMinimized()) await existing.unminimize();
		await existing.setFocus();
		return;
	}

	const win = new WebviewWindow(label, {
		url: `#map/${id}`,
		title: name || "Map Editor",
		width: 1400,
		height: 900,
		resizable: true,
		visible: false,
		zoomHotkeysEnabled: true,
		backgroundColor: "#252521",
	});

	win.once("tauri://error", (e) => {
		log.error("Failed to create map window:", e);
	});
}
