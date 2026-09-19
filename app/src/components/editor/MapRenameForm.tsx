import { updateMapMeta, useMapState } from "@/store/useMapStore";
import { deleteMap } from "@/store/mapList";
import { useEffect, useId, useState } from "react";
import { useCloseDialog } from "../primitives/Dialog";
import { Button } from "../primitives/Button";
import { Icon } from "../primitives/Icon";
import { TextInput } from "../primitives/TextInput";
import { ScoreBoundsEditor } from "./map/ScoreBoundsEditor";
import { t } from "@/lib/i18n";
import { exprErrorText } from "@/lib/util/format";
import { cmd } from "@/lib/commands";
import { DEFAULT_DUPLICATE_SCORE } from "@/bindings.gen";
import { mdiRestore } from "@mdi/js";

function DeleteMapSection({ mapId, name }: { mapId: string; name: string }) {
	const [confirming, setConfirming] = useState(false);

	if (!confirming) {
		return (
			<Button variant="destructive" onClick={() => setConfirming(true)}>
				{t("Delete map")}
			</Button>
		);
	}

	return (
		<div className="edit-map-modal__delete">
			<span>
				{t("Delete \u201C{name}\u201D? This permanently removes the map and its history.", {
					name: name || t("(unnamed)"),
				})}
			</span>
			<Button onClick={() => setConfirming(false)}>{t("Cancel")}</Button>
			<Button variant="destructive" onClick={() => void deleteMap(mapId)}>
				{t("Delete map")}
			</Button>
		</div>
	);
}

export function MapRenameForm({ mapId, currentName }: { mapId: string; currentName: string }) {
	const id = useId();
	const close = useCloseDialog();
	const settings = useMapState((s) => s.map?.meta.settings);
	const [name, setName] = useState(currentName);
	const [score, setScore] = useState(settings?.duplicateScore ?? "");
	const [scoreError, setScoreError] = useState<string | null>(null);
	const [reviewOrder, setReviewOrder] = useState(settings?.reviewOrder ?? "");
	const [reviewError, setReviewError] = useState<string | null>(null);

	useEffect(() => {
		if (score.trim() === "") {
			setScoreError(null);
			return;
		}
		let live = true;
		void cmd.fieldExprError(score).then((err) => {
			if (live) setScoreError(err && exprErrorText(err));
		});
		return () => {
			live = false;
		};
	}, [score]);

	useEffect(() => {
		if (reviewOrder.trim() === "") {
			setReviewError(null);
			return;
		}
		let live = true;
		void cmd.fieldExprError(reviewOrder).then((err) => {
			if (live) setReviewError(err && exprErrorText(err));
		});
		return () => {
			live = false;
		};
	}, [reviewOrder]);

	return (
		<form
			className="edit-map-modal__rename"
			onSubmit={(e) => {
				e.preventDefault();
				void updateMapMeta({
					name: name || currentName,
					...(settings && {
						settings: {
							...settings,
							duplicateScore: score.trim() || null,
							reviewOrder: reviewOrder.trim() || null,
						},
					}),
				});
				close();
			}}
		>
			<p className="edit-map-modal__name">
				<label htmlFor={`${id}name`}>{t("Map name:")}</label>
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
			<p className="edit-map-modal__name">
				<label htmlFor={`${id}dup`}>{t("Duplicate preference:")}</label>
				<span className="edit-map-modal__expr">
					<TextInput
						id={`${id}dup`}
						type="text"
						className="mono"
						value={score}
						onChange={(e) => setScore(e.target.value)}
						placeholder={DEFAULT_DUPLICATE_SCORE}
						spellCheck={false}
					/>
					<button
						type="button"
						className="icon-button"
						onClick={() => setScore("")}
						disabled={score === ""}
						title={t("Reset to default")}
						aria-label={t("Reset to default")}
					>
						<Icon path={mdiRestore} />
					</button>
				</span>
			</p>
			<p className="edit-map-modal__hint">
				{scoreError
					? t("Invalid expression: {error}", { error: scoreError })
					: t(
							"Highest score supplies the merged position and view; all tags are kept. Ties go to the oldest.",
						)}
			</p>
			<p className="edit-map-modal__name">
				<label htmlFor={`${id}rev`}>{t("Review order:")}</label>
				<span className="edit-map-modal__expr">
					<TextInput
						id={`${id}rev`}
						type="text"
						className="mono"
						value={reviewOrder}
						onChange={(e) => setReviewOrder(e.target.value)}
						spellCheck={false}
					/>
					<button
						type="button"
						className="icon-button"
						onClick={() => setReviewOrder("")}
						disabled={reviewOrder === ""}
						title={t("Reset to default")}
						aria-label={t("Reset to default")}
					>
						<Icon path={mdiRestore} />
					</button>
				</span>
			</p>
			<p className="edit-map-modal__hint">
				{reviewError
					? t("Invalid expression: {error}", { error: reviewError })
					: t(
							"Scores every location; a review pass walks them highest first. Blank reviews them in the order the selection resolved.",
						)}
			</p>
			<ScoreBoundsEditor />
			<div className="edit-map-modal__actions">
				<DeleteMapSection mapId={mapId} name={currentName} />
				<Button
					variant="primary"
					type="submit"
					disabled={name.trim().length === 0 || scoreError != null || reviewError != null}
				>
					{t("Save")}
				</Button>
			</div>
		</form>
	);
}
