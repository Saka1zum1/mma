import { useId } from "react";
import type { ScopeController, SourceScope } from "@/store/useMapStore";
import { getSavedSelections } from "@/store/savedSelections";
import { NSelect } from "@/components/primitives/NSelect";
import { Radio } from "@/components/primitives/Radio";
import { fmt } from "@/lib/util/format";
// Radio picker for a ScopeController (from useScope). One shared affordance for
// "operate on all locations vs the current selection", used by core and plugins.
// Controllers with `saved: true` additionally offer saved selections.
export function ScopeSelector({
	ctl,
	className,
}: {
	ctl: ScopeController<SourceScope>;
	className?: string;
}) {
	const { scope, setScope, allCount, selectionCount } = ctl;
	const name = useId();
	const hasSelection = selectionCount > 0;
	const saved = ctl.saved ? getSavedSelections() : [];
	const savedMissing = scope.kind === "saved" && !saved.some((s) => s.id === scope.id);
	return (
		<div className={`scope-selector${className ? ` ${className}` : ""}`}>
			<label className="scope-selector__option">
				<Radio
					name={name}
					checked={scope.kind === "all"}
					onChange={() => setScope({ kind: "all" })}
				/>
				All locations ({fmt.format(allCount)})
			</label>
			<label
				className="scope-selector__option"
				style={!hasSelection ? { opacity: 0.5 } : undefined}
			>
				<Radio
					name={name}
					checked={scope.kind === "selected"}
					disabled={!hasSelection}
					onChange={() => setScope({ kind: "selected" })}
				/>
				Current selection ({fmt.format(selectionCount)})
			</label>
			{saved.length > 0 && (
				<label className="scope-selector__option">
					<Radio
						name={name}
						checked={scope.kind === "saved"}
						onChange={() => setScope({ kind: "saved", id: saved[0].id })}
					/>
					Saved
					<NSelect
						value={scope.kind === "saved" ? scope.id : ""}
						onChange={(e) => setScope({ kind: "saved", id: e.target.value })}
					>
						{scope.kind !== "saved" && <option value="" disabled hidden />}
						{savedMissing && scope.kind === "saved" && (
							<option value={scope.id}>(deleted selection)</option>
						)}
						{saved.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</NSelect>
				</label>
			)}
		</div>
	);
}
