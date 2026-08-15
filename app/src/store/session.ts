// Browser-style session restore. The session is snapshotted at a single point:
// when the main (list) window closes (see main.tsx). We record which map windows
// existed at that instant and reopen them on next launch. A map window closed
// individually is already gone by the time the main window closes, so it isn't
// remembered - matching how a browser restores tabs open at quit but not ones you
// closed yourself. Stored in localStorage (shared across all same-origin windows).

import { getLocal, setLocal } from "@/lib/hooks/useLocalStorage";

const KEY = "openMapSession";

export function loadSession(): string[] {
	const parsed = getLocal<unknown>(KEY, []);
	return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
}

export function saveSession(ids: string[]): void {
	setLocal(KEY, ids);
}
