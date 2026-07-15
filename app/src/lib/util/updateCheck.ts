import { useSyncExternalStore } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { log } from "@/lib/util/log";
import { getSettings } from "@/store/settings";
import { saveSession } from "@/store/session";
import { openMapWindowIds } from "@/lib/window";

type Phase = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "ready" | "error";

interface UpdateState {
	phase: Phase;
	version: string | null;
	notes: string;
	percent: number;
	error: string | null;
	dismissed: boolean;
}

let state: UpdateState = {
	phase: "idle",
	version: null,
	notes: "",
	percent: 0,
	error: null,
	dismissed: false,
};
let pendingUpdate: Update | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<UpdateState>) {
	state = { ...state, ...patch };
	for (const fn of listeners) fn();
}

const DISMISS_KEY = "mma-update-dismissed-version";

export async function checkForUpdate() {
	set({ phase: "checking", error: null });
	try {
		const { check } = await import("@tauri-apps/plugin-updater");
		const update = await check();
		if (update) {
			pendingUpdate = update;
			log.info(`[updater] update available: v${update.version}`);
			set({
				phase: "available",
				version: update.version,
				notes: update.body ?? "",
				dismissed: localStorage.getItem(DISMISS_KEY) === update.version,
			});
		} else {
			set({ phase: "up-to-date", version: null });
		}
	} catch (e) {
		log.warn("[updater] check failed:", e);
		set({ phase: "error", error: e instanceof Error ? e.message : String(e) });
	}
}

// Updating never fires onCloseRequested (the installer kills the app
// inside downloadAndInstall), so snapshot the session here or the post-update
// restore reopens the stale list from the last normal quit.
async function snapshotSessionForRestart() {
	if (!getSettings().restoreSession) return;
	try {
		const ids = await openMapWindowIds();
		saveSession(ids);
		log.info(`[session] saved ${ids.length} open map(s) before restart: ${ids.join(", ")}`);
	} catch (e) {
		log.warn("[session] snapshot before restart failed:", e);
	}
}

export async function installUpdate() {
	if (!pendingUpdate) return;
	if (state.phase === "downloading" || state.phase === "ready") return;
	await snapshotSessionForRestart();
	set({ phase: "downloading", percent: 0, error: null });
	try {
		let totalBytes = 0;
		let downloadedBytes = 0;
		await pendingUpdate.downloadAndInstall((event) => {
			if (event.event === "Started" && event.data.contentLength) {
				totalBytes = event.data.contentLength;
			} else if (event.event === "Progress") {
				downloadedBytes += event.data.chunkLength;
				if (totalBytes > 0) {
					set({ percent: Math.round((downloadedBytes / totalBytes) * 100) });
				}
			} else if (event.event === "Finished") {
				set({ phase: "ready" });
			}
		});
		set({ phase: "ready" });
	} catch (e) {
		log.error("[updater] install failed:", e);
		set({ phase: "error", error: e instanceof Error ? e.message : String(e) });
	}
}

export async function relaunchApp() {
	await snapshotSessionForRestart();
	const { relaunch } = await import("@tauri-apps/plugin-process");
	await relaunch();
}

export function dismissUpdate() {
	if (!state.version) return;
	localStorage.setItem(DISMISS_KEY, state.version);
	set({ dismissed: true });
}

function subscribe(fn: () => void) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

function getSnapshot(): UpdateState {
	return state;
}

export function useUpdateState(): UpdateState {
	return useSyncExternalStore(subscribe, getSnapshot);
}
