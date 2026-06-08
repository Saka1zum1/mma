import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { Icon } from "@/components/primitives/Icon";
import {
	getPlugins,
	isPluginEnabled,
	setPluginEnabled,
	activatePlugin,
	deactivatePlugin,
	unregisterPlugin,
} from "@/plugins/registry";
import type { Plugin, PluginManifest } from "@/plugins/registry";
import { loadAndActivatePlugin } from "@/plugins/index";
import { cmd } from "@/lib/commands";
import { log } from "@/lib/util/log";

const REGISTRY_URL =
	"https://raw.githubusercontent.com/ccmdi/mma/master/plugins/registry.json";

interface RegistryEntry {
	id: string;
	name: string;
	description: string;
	icon: string;
	version: string;
	main: string;
}

type Tab = "core" | "additional";

let registryCache: RegistryEntry[] | null = null;

function CoreCard({ plugin }: { plugin: Plugin }) {
	const [enabled, setEnabled] = useState(() => isPluginEnabled(plugin.id));

	const toggle = () => {
		if (plugin.comingSoon) return;
		const next = !enabled;
		setPluginEnabled(plugin.id, next);
		if (next) activatePlugin(plugin.id);
		else deactivatePlugin(plugin.id);
		setEnabled(next);
	};

	return (
		<div
			className={`plugin-card ${enabled ? "plugin-card--enabled" : ""} ${plugin.comingSoon ? "plugin-card--coming-soon" : ""}`}
		>
			<div className="plugin-card__icon">
				<Icon path={plugin.icon} size={32} />
			</div>
			<div className="plugin-card__info">
				<div className="plugin-card__name">{plugin.name}</div>
				{plugin.description && (
					<div className="plugin-card__desc">{plugin.description}</div>
				)}
			</div>
			{!plugin.comingSoon && (
				<button
					className={`button plugin-card__toggle ${enabled ? "button--danger" : "button--primary"}`}
					onClick={toggle}
				>
					{enabled ? "Disable" : "Enable"}
				</button>
			)}
		</div>
	);
}

function AdditionalCard({
	id,
	name,
	description,
	icon,
	installed,
	enabled,
	onInstall,
	onEnable,
	onDisable,
	onUninstall,
}: {
	id: string;
	name: string;
	description: string;
	icon: string;
	installed: boolean;
	enabled: boolean;
	onInstall: (id: string) => void;
	onEnable: (id: string) => void;
	onDisable: (id: string) => void;
	onUninstall: (id: string) => void;
}) {
	const [busy, setBusy] = useState(false);

	const handlePrimary = async () => {
		setBusy(true);
		try {
			if (!installed) await onInstall(id);
			else if (enabled) await onDisable(id);
			else await onEnable(id);
		} finally {
			setBusy(false);
		}
	};

	const primaryLabel = !installed ? "Install" : enabled ? "Disable" : "Enable";
	const primaryClass = !installed
		? "button--primary"
		: enabled
			? "button--danger"
			: "button--primary";

	const TRASH = "M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z";

	return (
		<div className={`plugin-card ${enabled ? "plugin-card--enabled" : ""}`}>
			<div className="plugin-card__icon">
				{icon ? <Icon path={icon} size={32} /> : null}
			</div>
			<div className="plugin-card__info">
				<div className="plugin-card__name">{name}</div>
				{description && <div className="plugin-card__desc">{description}</div>}
			</div>
			<div className="plugin-card__actions">
				<button
					className={`button plugin-card__toggle ${primaryClass}`}
					onClick={handlePrimary}
					disabled={busy}
				>
					{busy ? "..." : primaryLabel}
				</button>
				{installed && (
					<button
						className="plugin-card__uninstall"
						onClick={() => onUninstall(id)}
						disabled={busy}
						aria-label="Uninstall"
					>
						<Icon path={TRASH} size={16} />
					</button>
				)}
			</div>
		</div>
	);
}

interface AdditionalEntry {
	id: string;
	name: string;
	description: string;
	icon: string;
	installed: boolean;
	enabled: boolean;
}

export function PluginMarketplace({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [tab, setTab] = useState<Tab>("core");
	const [registry, setRegistry] = useState<RegistryEntry[] | null>(registryCache);
	const [fetchError, setFetchError] = useState<string | null>(null);
	const [installedManifests, setInstalledManifests] = useState<PluginManifest[]>([]);
	const [, rerender] = useState(0);

	const corePlugins = getPlugins().filter((p) => p.core);

	const refreshInstalled = useCallback(() => {
		cmd.listUserPlugins().then((m: PluginManifest[]) => setInstalledManifests(m));
	}, []);

	useEffect(() => {
		if (open) refreshInstalled();
	}, [open, refreshInstalled]);

	const fetchRegistry = useCallback(() => {
		setFetchError(null);
		fetch(REGISTRY_URL)
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((data: RegistryEntry[]) => {
				registryCache = data;
				setRegistry(data);
			})
			.catch((e) => setFetchError(e.message));
	}, []);

	useEffect(() => {
		if (open && tab === "additional" && !registry) fetchRegistry();
	}, [open, tab, registry, fetchRegistry]);

	const additionalEntries: AdditionalEntry[] = (() => {
		const installedIds = new Set(installedManifests.map((m) => m.id));
		const seen = new Set<string>();
		const entries: AdditionalEntry[] = [];

		if (registry) {
			for (const r of registry) {
				seen.add(r.id);
				entries.push({
					id: r.id,
					name: r.name,
					description: r.description,
					icon: r.icon,
					installed: installedIds.has(r.id),
					enabled: isPluginEnabled(r.id),
				});
			}
		}

		for (const m of installedManifests) {
			if (seen.has(m.id)) continue;
			entries.push({
				id: m.id,
				name: m.name,
				description: m.description || "",
				icon: m.icon,
				installed: true,
				enabled: isPluginEnabled(m.id),
			});
		}

		return entries;
	})();

	const handleInstall = useCallback(async (id: string) => {
		try {
			const manifest = await cmd.installPlugin(id);
			await loadAndActivatePlugin(manifest);
			setPluginEnabled(id, true);
			refreshInstalled();
			rerender((n) => n + 1);
		} catch (e) {
			log.error(`[marketplace] install failed for "${id}":`, e);
		}
	}, [refreshInstalled]);

	const handleEnable = useCallback((id: string) => {
		setPluginEnabled(id, true);
		activatePlugin(id);
		rerender((n) => n + 1);
	}, []);

	const handleDisable = useCallback((id: string) => {
		deactivatePlugin(id);
		setPluginEnabled(id, false);
		rerender((n) => n + 1);
	}, []);

	const handleUninstall = useCallback(async (id: string) => {
		deactivatePlugin(id);
		setPluginEnabled(id, false);
		unregisterPlugin(id);
		try {
			await cmd.uninstallPlugin(id);
		} catch (e) {
			log.error(`[marketplace] uninstall failed for "${id}":`, e);
		}
		refreshInstalled();
		rerender((n) => n + 1);
	}, [refreshInstalled]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent title="Plugins" className="plugin-marketplace">
				<div className="plugin-marketplace__tabs">
					<button
						className={`plugin-marketplace__tab ${tab === "core" ? "plugin-marketplace__tab--active" : ""}`}
						onClick={() => setTab("core")}
					>
						Core
					</button>
					<button
						className={`plugin-marketplace__tab ${tab === "additional" ? "plugin-marketplace__tab--active" : ""}`}
						onClick={() => setTab("additional")}
					>
						Additional
					</button>
				</div>

				{tab === "core" && (
					<div className="plugin-marketplace__grid">
						{corePlugins.map((p) => (
							<CoreCard key={p.id} plugin={p} />
						))}
					</div>
				)}

				{tab === "additional" && (
					<>
						{!registry && !fetchError && (
							<div className="plugin-marketplace__loading">
								<div className="plugin-marketplace__spinner" />
							</div>
						)}
						{fetchError && (
							<div className="plugin-marketplace__empty">
								Failed to load registry: {fetchError}
								<br />
								<button className="button" onClick={fetchRegistry} style={{ marginTop: 8 }}>
									Retry
								</button>
							</div>
						)}
						{registry && additionalEntries.length === 0 && (
							<div className="plugin-marketplace__empty">No additional plugins available.</div>
						)}
						{additionalEntries.length > 0 && (
							<div className="plugin-marketplace__grid">
								{additionalEntries.map((e) => (
									<AdditionalCard
										key={e.id}
										{...e}
										onInstall={handleInstall}
										onEnable={handleEnable}
										onDisable={handleDisable}
										onUninstall={handleUninstall}
									/>
								))}
							</div>
						)}
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
