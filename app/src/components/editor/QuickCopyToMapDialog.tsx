import { useState, useEffect, useMemo, useRef } from "react";
import { cmd } from "@/lib/commands";
import { log } from "@/lib/util/log";
import type { MapMeta } from "@/bindings.gen";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { SuggestInput } from "@/components/primitives/SuggestInput";
import { getMapState } from "@/store/useMapStore";
import { isVirtualLocation } from "@/types";
import { toast } from "@/lib/util/toast";
import { useT } from "@/lib/i18n";

export function QuickCopyToMapDialog({ onClose }: { onClose: () => void }) {
	const { t } = useT();
	const [maps, setMaps] = useState<MapMeta[] | null>(null);
	const [query, setQuery] = useState("");
	const contentRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		cmd
			.storeListMaps()
			.then(setMaps)
			.catch((e) => log.error("[quickCopy] list failed:", e));
	}, []);

	const lower = query.trim().toLowerCase();
	const suggestions = useMemo(
		() =>
			lower
				? (maps ?? [])
						.filter((m) => m.id !== getMapState().mapId && m.name.toLowerCase().includes(lower))
						.sort((a, b) => a.name.localeCompare(b.name))
						.slice(0, 8)
				: [],
		[maps, lower],
	);

	const doCopy = (targetMapId: string) => {
		const loc = getMapState().activeLocation;
		if (!loc || isVirtualLocation(loc)) {
			onClose();
			return;
		}
		cmd
			.storeCopyLocationsToMap(targetMapId, [loc.id])
			.then((res) => {
				const container = contentRef.current;
				if (container)
					toast(
						res.copied > 0
							? t("toast.copiedTo", { name: res.targetName })
							: t("toast.alreadyIn", { name: res.targetName }),
						1500,
						container,
					);
				setTimeout(onClose, 600);
			})
			.catch((e) => {
				log.error("[quickCopy] failed:", e);
				const container = contentRef.current;
				if (container) toast(t("toast.copyFailed"), 1500, container);
				setTimeout(onClose, 600);
			});
	};

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent title={t("dialog.copyLocationToMap")} className="copy-to-map-modal-host">
				<div className="copy-to-map-modal" ref={contentRef}>
					<SuggestInput
						containerClassName="copy-to-map-modal__add"
						placeholder={t("copyToMap.searchPlaceholder")}
						value={query}
						onChange={setQuery}
						suggestions={suggestions}
						getKey={(m) => m.id}
						onPick={(m) => doCopy(m.id)}
						listStyle={{ top: "100%", left: 0, zIndex: 10 }}
						autoFocus
						renderItem={(m) => (
							<>
								<strong>{m.name || t("copyToMap.unnamed")}</strong>
								{m.folder && <span className="search-result__context"> &middot; {m.folder}</span>}
							</>
						)}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
