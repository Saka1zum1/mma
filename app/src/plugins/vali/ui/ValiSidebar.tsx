import { useRef, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { cmd } from "@/lib/commands";
import type { ValiLocation } from "@/bindings.gen";
import { createLocation, LocationFlag } from "@/types";
import { createTags } from "@/store/useMapStore";
import { Sidebar } from "@/components/primitives/Sidebar";
import { log } from "@/lib/util/log";
import "./vali.css";

// The embedded Vali GUI (vendored bundle, ?host=mma) owns the whole flow: definition
// editor, tag input, generate button, progress. This side is just the bridge:
//   <- iframe  { type: "vali:generate", data, tag }
//   <- iframe  { type: "vali:cancel" }
//   -> iframe  { type: "vali:progress", progress } (forwarded vali-progress events)
//   -> iframe  { type: "vali:done", count } | { type: "vali:error", message }

const VALIG_URL = "/valig/index.html?host=mma";

async function importLocations(valiLocs: ValiLocation[], tagName: string): Promise<number> {
	let tagId: number | null = null;
	if (tagName) {
		tagId = (await createTags([tagName]))[0].id;
	}
	const locations = valiLocs.map((v) =>
		createLocation({
			lat: v.lat,
			lng: v.lng,
			heading: v.heading,
			...(v.zoom != null ? { zoom: v.zoom } : {}),
			...(v.pitch != null ? { pitch: v.pitch } : {}),
			...(v.panoId != null ? { panoId: v.panoId } : {}),
			...(v.tags.length ? { extra: { tags: v.tags } } : {}),
			flags: LocationFlag.LoadAsPanoId,
			...(tagId != null ? { tags: [tagId] } : {}),
		}),
	);
	MMA.addLocations(locations);
	return locations.length;
}

export function ValiSidebar({ onClose }: { onClose: () => void }) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const runningRef = useRef(false);

	useEffect(() => {
		const onMessage = async (e: MessageEvent) => {
			if (e.data?.type === "vali:cancel") {
				cmd.valiCancel();
				return;
			}
			if (e.data?.type !== "vali:generate" || runningRef.current) return;
			runningRef.current = true;
			const post = (msg: unknown) => iframeRef.current?.contentWindow?.postMessage(msg, "*");
			const unlisten = await listen("vali-progress", (ev) =>
				post({ type: "vali:progress", progress: ev.payload }),
			);
			try {
				const locations = await cmd.valiGenerate(JSON.stringify(e.data.data));
				const count = await importLocations(locations, String(e.data.tag ?? ""));
				post({ type: "vali:done", count });
			} catch (err) {
				log.error("[vali] generate failed:", err);
				post({ type: "vali:error", message: String(err) });
			} finally {
				unlisten();
				runningRef.current = false;
			}
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	return (
		<Sidebar title="Vali" onBack={onClose} className="vali-sidebar" flush>
			<div className="vali-sidebar__iframe-wrap">
				<iframe ref={iframeRef} src={VALIG_URL} title="Vali" />
			</div>
		</Sidebar>
	);
}
