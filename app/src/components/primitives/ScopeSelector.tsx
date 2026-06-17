import { useId } from "react";
import type { ScopeController } from "@/store/useMapStore";
import { fmt } from "@/lib/util/format";
import "./scope-selector.css";

// Radio picker for a ScopeController (from useScope). One shared affordance for
// "operate on all locations vs the current selection", used by core and plugins.
export function ScopeSelector({ ctl, className }: { ctl: ScopeController; className?: string }) {
	const { scope, setScope, allCount, selectionCount } = ctl;
	const name = useId();
	const hasSelection = selectionCount > 0;
	return (
		<div className={`scope-selector${className ? ` ${className}` : ""}`}>
			<label className="scope-selector__option">
				<input
					type="radio"
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
				<input
					type="radio"
					name={name}
					checked={scope.kind === "selected"}
					disabled={!hasSelection}
					onChange={() => setScope({ kind: "selected" })}
				/>
				Current selection ({fmt.format(selectionCount)})
			</label>
		</div>
	);
}
