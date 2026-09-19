import { createSyncController } from "@/lib/sync/controller";
import type { RemoteMapSummary } from "@/lib/sync/provider";
import type { User } from "./remote-types";
import { hasApiKey, mapMakingProvider, PLUGIN_ID } from "./provider";

export { hasApiKey, setApiKey } from "./provider";

/** Link, sync and the live loop. Everything below is the API-key auth surface, which is ours. */
export const controller = createSyncController(mapMakingProvider, PLUGIN_ID);

// Cache the validated identity so reopening the sidebar is instant. The map list is not cached
// here -- the shared sidebar fetches it on demand.
let cachedUser: User | null = null;
export const getCachedUser = (): User | null => cachedUser;

/** Drop the cached identity (on key change). Does not clear the stored key. */
export const forgetAuth = (): void => {
	cachedUser = null;
};

/** Validate `key` (default: the stored one) without persisting it; caller stores on success. */
export async function validate(key?: string): Promise<User> {
	if (key === undefined) await hasApiKey();
	cachedUser = await window.MMA.cmd.mapMakingGetUser(key?.trim() ? key.trim() : null);
	return cachedUser;
}

export const listMaps = (): Promise<RemoteMapSummary[]> => mapMakingProvider.listMaps();
