import { useIsMeasuring, useMeasureLength, endMeasure } from "@/lib/sv/measure";
import { formatDistance, computeScore, useScoreMaxError } from "@/lib/geo/scoring";

export function MeasurementBar() {
	const isMeasuring = useIsMeasuring();
	const length = useMeasureLength();
	const maxError = useScoreMaxError();

	if (!isMeasuring) return null;

	return (
		<div
			className="embed-controls__control"
			style={{ bottom: "40px", left: "50%", transform: "translateX(-50%)" }}
		>
			<div className="map-control measurement-control">
				<p className="measurement-control__measurements">
					Distance: {formatDistance(length)}
					<br />
					Score: {computeScore(length, maxError)}
				</p>
				<button className="button measurement-control__end" onClick={endMeasure}>
					End
				</button>
			</div>
		</div>
	);
}
