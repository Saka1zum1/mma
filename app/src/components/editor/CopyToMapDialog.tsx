import { useState, useMemo } from "react";
import { cmd } from "@/lib/commands";
import { useAsync } from "@/lib/hooks/useAsync";
import { log } from "@/lib/util/log";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { HotkeyInput } from "@/components/primitives/HotkeyInput";
import { SuggestInput } from "@/components/primitives/SuggestInput";
import { Button } from "@/components/primitives/Button";
import { useMapSetting } from "@/store/useMapSetting";
import { getMapCopyBindingKey, withMapCopyBinding } from "@/lib/map/mapKeyBindings";
import { getMapState } from "@/store/useMapStore";
import { t } from "@/lib/i18n";

/** Assign per-map hotkeys that copy the active location into other maps.
 *  Shows only configured maps; new targets are added via autocomplete (type a
 *  map name), then keyed. Bindings persist to this map's settings as changed. */
export function CopyToMapDialog({ onClose }: { onClose: () => void }) {
	const [bindings, setBindings] = useMapSetting("keyBindings");
	// Added via autocomplete but not yet keyed; persisted only once a key is recorded.
	const [pendingIds, setPendingIds] = useState<string[]>([]);
	const [query, setQuery] = useState("");
	const { data: maps } = useAsync(
		() =>
			cmd.storeListMaps().catch((e) => {
				log.error("[copyToMap] list failed:", e);
				return null;
			}),
		[],
	);

	const byId = useMemo(() => new Map((maps ?? []).map((m) => [m.id, m])), [maps]);

	const boundIds = useMemo(() => {
		const ids = (bindings ?? []).flatMap((b) =>
			b.action.type === "copyToMap" ? [b.action.mapId] : [],
		);
		return ids.sort((a, b) => (byId.get(a)?.name ?? "").localeCompare(byId.get(b)?.name ?? ""));
	}, [bindings, byId]);

	const rowIds = [...boundIds, ...pendingIds.filter((id) => !boundIds.includes(id))];

	const lower = query.trim().toLowerCase();
	const suggestions = lower
		? (maps ?? [])
				.filter(
					(m) =>
						m.id !== getMapState().mapId &&
						!rowIds.includes(m.id) &&
						m.name.toLowerCase().includes(lower),
				)
				.sort((a, b) => a.name.localeCompare(b.name))
				.slice(0, 8)
		: [];

	const addMap = (id: string) => {
		setPendingIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
		setQuery("");
	};

	const removeRow = (id: string) => {
		setBindings(withMapCopyBinding(bindings ?? [], id, ""));
		setPendingIds((prev) => prev.filter((p) => p !== id));
	};

	const setRowKey = (id: string, combo: string) => {
		setBindings(withMapCopyBinding(bindings ?? [], id, combo));
		if (combo) {
			setPendingIds((prev) => prev.filter((p) => p !== id));
		} else if (!pendingIds.includes(id)) {
			// Cleared via Backspace: keep the row visible, just unkeyed.
			setPendingIds((prev) => [...prev, id]);
		}
	};

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent title={t("Copy location to map (hotkeys)")} className="copy-to-map-modal-host">
				<div className="copy-to-map-modal">
					<p className="copy-to-map-modal__hint">
						{t(
							"Pressing an assigned key while a location is open copies that location into the map\n\t\t\t\t\t\t(duplicates are skipped).",
						)}
					</p>
					{rowIds.length > 0 && (
						<ul className="copy-to-map-modal__list">
							{rowIds.map((id) => {
								const meta = byId.get(id);
								const key = getMapCopyBindingKey(bindings ?? [], id) ?? "";
								return (
									<li key={id} className="copy-to-map-modal__row">
										<span className="copy-to-map-modal__name">
											{meta ? meta.name || t("(unnamed)") : t("(missing map)")}
											{meta?.folder && <small> · {meta.folder}</small>}
										</span>
										<HotkeyInput value={key} onChange={(combo) => setRowKey(id, combo)} />
										<Button onClick={() => removeRow(id)}>{t("Remove")}</Button>
									</li>
								);
							})}
						</ul>
					)}
					<SuggestInput
						containerClassName="copy-to-map-modal__add"
						placeholder={t("Add a map...")}
						value={query}
						onChange={setQuery}
						suggestions={suggestions}
						getKey={(m) => m.id}
						onPick={(m) => addMap(m.id)}
						listStyle={{ top: "100%", left: 0, zIndex: 10 }}
						autoFocus
						renderItem={(m) => (
							<>
								<strong>{m.name || t("(unnamed)")}</strong>
								{m.folder && <span className="search-result__context"> · {m.folder}</span>}
							</>
						)}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
