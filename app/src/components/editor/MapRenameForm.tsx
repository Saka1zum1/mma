import { updateMapMeta, deleteMap } from "@/store/useMapStore";
import { useId, useState } from "react";
import { useCloseDialog } from "../primitives/Dialog";
import { Button } from "../primitives/Button";
import { TextInput } from "../primitives/TextInput";

function DeleteMapSection({ mapId, name }: { mapId: string; name: string }) {
	const [confirming, setConfirming] = useState(false);

	if (!confirming) {
		return (
			<div className="edit-map-modal__delete">
				<Button variant="destructive" onClick={() => setConfirming(true)}>
					Delete map
				</Button>
			</div>
		);
	}

	return (
		<div className="edit-map-modal__delete">
			<p>
				Delete &ldquo;{name || "(unnamed)"}&rdquo;? This permanently removes the map and its
				history.
			</p>
			<div className="edit-map-modal__actions">
				<Button onClick={() => setConfirming(false)}>Cancel</Button>
				<Button variant="destructive" onClick={() => void deleteMap(mapId)}>
					Delete map
				</Button>
			</div>
		</div>
	);
}

export function MapRenameForm({ mapId, currentName }: { mapId: string; currentName: string }) {
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
					<label htmlFor={`${id}name`}>Map name:</label>
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
						Save
					</Button>
				</div>
			</form>
			<DeleteMapSection mapId={mapId} name={currentName} />
		</>
	);
}
