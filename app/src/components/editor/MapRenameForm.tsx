import { updateMapMeta } from "@/store/useMapStore";
import { deleteMap } from "@/store/mapList";
import { useId, useState } from "react";
import { useCloseDialog } from "../primitives/Dialog";
import { Button } from "../primitives/Button";
import { TextInput } from "../primitives/TextInput";
import { useT } from "@/lib/i18n";

function DeleteMapSection({ mapId, name }: { mapId: string; name: string }) {
	const { t } = useT();
	const [confirming, setConfirming] = useState(false);

	if (!confirming) {
		return (
			<div className="edit-map-modal__delete">
				<Button variant="destructive" onClick={() => setConfirming(true)}>
					{t("mapList.deleteMap")}
				</Button>
			</div>
		);
	}

	return (
		<div className="edit-map-modal__delete">
			<p>
				{t("editor.deleteMapConfirm", {
					name: name || t("editor.unnamed"),
				})}
			</p>
			<div className="edit-map-modal__actions">
				<Button onClick={() => setConfirming(false)}>{t("common.cancel")}</Button>
				<Button variant="destructive" onClick={() => void deleteMap(mapId)}>
					{t("mapList.deleteMap")}
				</Button>
			</div>
		</div>
	);
}

export function MapRenameForm({ mapId, currentName }: { mapId: string; currentName: string }) {
	const { t } = useT();
	const id = useId();
	const close = useCloseDialog();
	const [name, setName] = useState(currentName);
	return (
		<>
			<form
				className="edit-map-modal__rename"
				onSubmit={(e) => {
					e.preventDefault();
					updateMapMeta({ name: name || currentName });
					close();
				}}
			>
				<p className="edit-map-modal__name">
					<label htmlFor={`${id}name`}>{t("editor.mapNameLabel")}</label>
					<TextInput
						id={`${id}name`}
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						minLength={1}
						maxLength={100}
						autoFocus
					/>
				</p>
				<div className="edit-map-modal__actions">
					<Button variant="primary" type="submit" disabled={name.trim().length === 0}>
						{t("common.save")}
					</Button>
				</div>
			</form>
			<DeleteMapSection mapId={mapId} name={currentName} />
		</>
	);
}
