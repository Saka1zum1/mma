import { isAuthPrefixed, type RemoteMapSummary, type SyncProvider } from "@/lib/sync/provider";

export const PLUGIN_ID = "map-making-sync";

const kv = () => window.MMA.storage(PLUGIN_ID);

let migrated = false;

/** Move a pre-keyring API key out of plugin storage into the OS keyring. */
async function migrateLegacyKey(): Promise<void> {
	if (migrated) return;
	const old = kv().get<string>("apiKey", "");
	if (typeof old === "string" && old.trim()) {
		await window.MMA.cmd.mapMakingSetKey(old.trim());
		kv().remove("apiKey");
	}
	migrated = true;
}

export async function hasApiKey(): Promise<boolean> {
	await migrateLegacyKey();
	return window.MMA.cmd.mapMakingHasKey();
}

export async function setApiKey(key: string): Promise<void> {
	await window.MMA.cmd.mapMakingSetKey(key);
	kv().remove("apiKey");
	migrated = true;
}

export async function clearApiKey(): Promise<void> {
	await window.MMA.cmd.mapMakingClearKey();
	kv().remove("apiKey");
	migrated = true;
}

export const mapMakingProvider: SyncProvider = {
	id: "map-making.app",
	label: "map-making.app",

	isAuthError: isAuthPrefixed,

	remoteMapUrl: (id) => `https://map-making.app/maps/${id}`,

	async listMaps(): Promise<RemoteMapSummary[]> {
		await migrateLegacyKey();
		const maps = await window.MMA.cmd.mapMakingListMaps();
		return maps.map((m) => ({
			id: String(m.id),
			name: m.name,
			locationCount: m.locationCount ?? null,
		}));
	},
};
