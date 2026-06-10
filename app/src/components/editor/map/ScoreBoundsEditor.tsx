import { Fragment, useState, useEffect, useRef } from "react";
import type { ScoreBounds } from "@/types";
import { useCurrentMap, updateMapMeta } from "@/store/useMapStore";
import {
	resolveScoreMaxError,
	formatDistance,
	useScoreMaxError,
	WORLD_MAX_ERROR,
	WORLD_BOUNDS,
	isWorldBounds,
} from "@/lib/sv/measure";

type Mode = "auto" | "world" | "fixed";

function modeOf(bounds: ScoreBounds): Mode {
	if (bounds === "auto" || typeof bounds === "string") return "auto";
	return isWorldBounds(bounds) ? "world" : "fixed";
}

/** "Scoring" section of the edit-map modal. */
export function ScoreBoundsEditor() {
	const map = useCurrentMap();
	const bounds: ScoreBounds = map?.meta.scoreBounds ?? "auto";
	const mode = modeOf(bounds);
	const resolvedError = useScoreMaxError();

	const fixed: [number, number, number, number] =
		typeof bounds !== "string" && !isWorldBounds(bounds) ? bounds : [0, 0, 0, 0];
	const [draft, setDraft] = useState<[string, string, string, string]>([
		String(fixed[0]),
		String(fixed[1]),
		String(fixed[2]),
		String(fixed[3]),
	]);
	const lastFixedRef = useRef<[number, number, number, number]>(fixed);

	// Keep the draft inputs in step with stored fixed bounds (e.g. on map open).
	useEffect(() => {
		if (mode !== "fixed") return;
		lastFixedRef.current = fixed;
		setDraft([String(fixed[0]), String(fixed[1]), String(fixed[2]), String(fixed[3])]);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mode, fixed[0], fixed[1], fixed[2], fixed[3]]);

	const setMode = (next: Mode) => {
		if (next === "auto") void updateMapMeta({ scoreBounds: "auto" });
		else if (next === "world") void updateMapMeta({ scoreBounds: WORLD_BOUNDS });
		else void updateMapMeta({ scoreBounds: lastFixedRef.current });
	};

	const commitFixed = (parts: [string, string, string, string]) => {
		const nums = parts.map((p) => Number.parseFloat(p));
		if (nums.some((n) => !Number.isFinite(n))) return;
		const next = nums as [number, number, number, number];
		lastFixedRef.current = next;
		void updateMapMeta({ scoreBounds: next });
	};

	// Per-mode resolved max-error for the radio labels. The active mode shows the
	// live shared value; inactive modes show what they would resolve to.
	const autoError = mode === "auto" ? resolvedError : null;
	const fixedError =
		mode === "fixed" ? resolvedError : resolveScoreMaxError(lastFixedRef.current, []);

	return (
		<fieldset className="fieldset">
			<legend className="fieldset__header">
				Scoring <span className="fieldset__divider" />
			</legend>
			<label className="settings-popup__item">
				<input
					type="radio"
					name="score-bounds"
					checked={mode === "auto"}
					onChange={() => setMode("auto")}
				/>
				Automatic based on locations
				{autoError != null && ` (${formatDistance(autoError)})`}
			</label>

			<label className="settings-popup__item">
				<input
					type="radio"
					name="score-bounds"
					checked={mode === "world"}
					onChange={() => setMode("world")}
				/>
				World map (ACW, {formatDistance(WORLD_MAX_ERROR)})
			</label>

			<label className="settings-popup__item">
				<input
					type="radio"
					name="score-bounds"
					checked={mode === "fixed"}
					onChange={() => setMode("fixed")}
				/>
				Fixed bounds
				{fixedError != null && ` (${formatDistance(fixedError)})`}
			</label>

			{mode === "fixed" && (
				<div
					className="settings-popup__item"
					style={{
						display: "grid",
						gridTemplateColumns: "auto 1fr auto 1fr",
						gap: ".25rem .5rem",
						alignItems: "center",
					}}
				>
					{(["S", "W", "N", "E"] as const).map((label, i) => (
						<Fragment key={label}>
							<span style={{ fontSize: ".8rem" }}>{label}</span>
							<input
								className="input"
								type="text"
								inputMode="decimal"
								value={draft[i]}
								onChange={(e) => {
									const next = [...draft] as typeof draft;
									next[i] = e.currentTarget.value;
									setDraft(next);
								}}
								onBlur={() => commitFixed(draft)}
								style={{ width: "100%", textAlign: "end" }}
							/>
						</Fragment>
					))}
				</div>
			)}
		</fieldset>
	);
}
