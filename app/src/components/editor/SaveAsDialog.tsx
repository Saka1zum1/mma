import { useState } from "react";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { Button } from "@/components/primitives/Button";
import { TextInput } from "@/components/primitives/TextInput";
import { flushSave, useMapState } from "@/store/useMapStore";
import { copyName, duplicateMap } from "@/store/mapList";
import { goToMap } from "@/store/router";
import { toast } from "@/lib/util/toast";
import { errText } from "@/lib/util/util";
import { t } from "@/lib/i18n";

/** Copies the open map, uncommitted edits included, into a new map and opens the copy. */
export function SaveAsDialog({ onClose }: { onClose: () => void }) {
	const map = useMapState((s) => s.map);
	const [name, setName] = useState(() => copyName(map?.meta.name ?? ""));
	const [saving, setSaving] = useState(false);

	const save = async () => {
		if (!map || saving || name.trim() === "") return;
		setSaving(true);
		try {
			await flushSave();
			const copy = await duplicateMap(map.meta.id, name.trim());
			onClose();
			await goToMap(copy.id);
		} catch (e) {
			toast(t("Could not save a copy: {error}", { error: errText(e) }));
			setSaving(false);
		}
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent title={t("Save as")} className="save-as-dialog">
				<TextInput
					value={name}
					autoFocus
					onChange={(e) => setName(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") void save();
					}}
				/>
				<div className="dialog-actions">
					<Button onClick={onClose}>{t("Cancel")}</Button>
					<Button disabled={saving || name.trim() === ""} onClick={() => void save()}>
						{t("Save")}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
