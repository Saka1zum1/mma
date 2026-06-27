import "@/lib/sv/shaderPatch";
import {} from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "@/styles.css";
import App from "@/App.tsx";
import { initLogging, log } from "@/lib/util/log";
import { initStore, flushSave } from "@/store/useMapStore";
import { initRouter } from "@/store/router";
import { cmd } from "@/lib/commands";
import { checkForUpdate } from "@/lib/util/updateCheck";
import "@/api";
import "@/store/commandDefs";

async function boot() {
	const t0 = performance.now();
	let tPrev = t0;
	const mark = (label: string) => {
		const now = performance.now();
		log.info(`[boot] ${label}: +${(now - tPrev).toFixed(0)}ms`);
		tPrev = now;
	};

	await initLogging();
	mark("initLogging");
	await initStore();
	mark("initStore");

	initRouter();
	mark("initRouter");

	if (window.MMA) window.MMA.ready = true;
	log.info("App booted");

	getCurrentWindow().onCloseRequested(async (event) => {
		event.preventDefault();
		log.info("Window close requested, closing map...");
		await flushSave();
		await cmd.storeCloseMap().catch((e) => log.error("[close] store_close_map failed:", e));
		log.info("Map closed, destroying window");
		getCurrentWindow().destroy();
	});

	window.addEventListener("beforeunload", () => {
		cmd.storeCloseMap().catch(() => {});
	});

	const win = getCurrentWindow();
	document.addEventListener("contextmenu", (e) => e.preventDefault());

	document.addEventListener("keydown", (e) => {
		if (e.key === "F11") {
			win.isFullscreen().then((fs) => win.setFullscreen(!fs));
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
			e.preventDefault();
		}
	});

	createRoot(document.getElementById("root")!).render(<App />);
	mark("render");

	getCurrentWindow().show();
	const jsTotal = performance.now();
	mark("show");

	cmd
		.appReady()
		.then((rustTotal) =>
			log.info(
				`[boot] js-load(nav->boot)=${t0.toFixed(0)}ms js-total=${jsTotal.toFixed(0)}ms rust-total=${rustTotal}ms pre-js(webview+bundle)=${(rustTotal - jsTotal).toFixed(0)}ms`,
			),
		)
		.catch(() => {});

	setTimeout(checkForUpdate, 5000);
}

boot();
