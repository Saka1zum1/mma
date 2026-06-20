import type { GeneratorRegion } from "../engine/types";
import { useProgressTick } from "./progressSignal";

export function ProgressDisplay({ regions }: { regions: GeneratorRegion[] }) {
	useProgressTick();

	const totalFound = regions.reduce((s, r) => s + r.found.length, 0);
	const totalTarget = regions.reduce((s, r) => s + r.target, 0);

	return (
		<div className="generator-progress">
			<div className="generator-progress__total">
				Total: {totalFound} / {totalTarget}
			</div>
			{regions.map((r) => (
				<div key={r.id} className="generator-progress__item">
					<div className="generator-progress__item-name">
						{r.code && (
							<img
								src={`/flags/${r.code.toUpperCase()}.svg`}
								alt={r.code}
								width={16}
								height={12}
								style={{ borderRadius: 2, flexShrink: 0 }}
							/>
						)}
						<span>{r.name}</span>
						{r.isProcessing && <span className="generator-progress__spinner" />}
					</div>
					<span className="generator-progress__count">
						{r.found.length}/{r.target}
					</span>
				</div>
			))}
		</div>
	);
}
