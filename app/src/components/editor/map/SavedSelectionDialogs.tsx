import { useCurrentMap, useAllSelections } from "@/store/useMapStore";
import { useSetting } from "@/store/settings";
import {
	saveCurrentSelections,
	applySavedSelection,
	deleteSavedSelection,
	selectionToSaved,
	describeRule,
	type SavedSelectionItem,
} from "@/store/savedSelections";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import { Icon } from "@/components/primitives/Icon";
import { Button } from "@/components/primitives/Button";
import { TextInput } from "@/components/primitives/TextInput";
import { mdiClose } from "@mdi/js";

export function SaveSelectionsDialog({
	open,
	onOpenChange,
	name,
	onNameChange,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	name: string;
	onNameChange: (v: string) => void;
}) {
	const map = useCurrentMap();
	const selections = useAllSelections();
	const saveableItems: SavedSelectionItem[] = (() => {
		if (!map) return [];
		return selections
			.map((s) => {
				const saved = selectionToSaved(s);
				if (!saved) return null;
				return { props: saved, color: s.color } as SavedSelectionItem;
			})
			.filter((item): item is SavedSelectionItem => item !== null);
	})();

	const handleSave = () => {
		if (!name.trim() || !map) return;
		const ok = saveCurrentSelections(name.trim(), selections);
		if (ok) {
			onNameChange("");
			onOpenChange(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent title="Save current selections">
				{saveableItems.length === 0 ? (
					<p>No saveable selections active.</p>
				) : (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							handleSave();
						}}
						style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: 4 }}
					>
						<TextInput
							value={name}
							onChange={(e) => onNameChange(e.target.value)}
							placeholder="Name this selection..."
							autoFocus
						/>
						<div className="saved-selection-row__rules">
							{saveableItems.map((item, i) => (
								<span key={i} className="saved-selection-row__chip">
									<span
										className="saved-selection-row__dot"
										style={{
											background: `rgb(${item.color[0]},${item.color[1]},${item.color[2]})`,
										}}
									/>
									{describeRule(item.props)}
								</span>
							))}
						</div>
						<div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
							<Button onClick={() => onOpenChange(false)}>Cancel</Button>
							<Button variant="primary" type="submit" disabled={!name.trim()}>
								Save
							</Button>
						</div>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}

export function ApplySavedSelectionDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
}) {
	const map = useCurrentMap();
	const saved = useSetting("savedSelections");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent title="Apply saved selection">
				{saved.length === 0 ? (
					<p>No saved selections.</p>
				) : (
					<div className="saved-selection-list">
						{saved.map((s) => (
							<div
								key={s.id}
								className="saved-selection-row"
								onClick={() => {
									if (map) {
										applySavedSelection(s);
										onOpenChange(false);
									}
								}}
							>
								<div className="saved-selection-row__header">
									<span className="saved-selection-row__name">{s.name}</span>
									<button
										className="saved-selection-row__delete"
										onClick={(e) => {
											e.stopPropagation();
											deleteSavedSelection(s.id);
										}}
										title="Delete"
									>
										<Icon path={mdiClose} size={14} />
									</button>
								</div>
								<div className="saved-selection-row__rules">
									{s.items.map((item, i) => (
										<span key={i} className="saved-selection-row__chip">
											<span
												className="saved-selection-row__dot"
												style={{
													background: `rgb(${item.color[0]},${item.color[1]},${item.color[2]})`,
												}}
											/>
											{describeRule(item.props)}
										</span>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
