import { useState, useEffect } from "react";
import { useMeasureState, endMeasure } from "@/lib/sv/measure";
import { formatDistance, computeScore, useScoreMaxError } from "@/lib/geo/scoring";

export function MeasurementBar() {
	const { isMeasuring, instance } = useMeasureState();
	const maxError = useScoreMaxError();
	const [, forceUpdate] = useState({});

	useEffect(() => {
		if (!instance) return;
		const cb = () => forceUpdate({});
		instance.addListener("measure_change", cb);
		return () => instance.removeListener("measure_change");
	}, [instance]);

	if (!isMeasuring || !instance) return null;

	return (
		<div
			className="embed-controls__control"
			style={{ bottom: "40px", left: "50%", transform: "translateX(-50%)" }}
		>
			<div className="map-control measurement-control">
				<p className="measurement-control__measurements">
					Distance: {formatDistance(instance.length ?? 0)}
					<br />
					Score: {computeScore(instance.length ?? 0, maxError)}
				</p>
				<button className="button measurement-control__end" onClick={endMeasure}>
					End
				</button>
			</div>
		</div>
	);
}
