import { useState } from "react";
import { embed, searchImage } from "./sidecar";

const SIMILARITY_THRESHOLD = 0.85;

export function FindSimilarButton() {
	const [running, setRunning] = useState(false);
	const [result, setResult] = useState<string | null>(null);

	const active = MMA.getMapState().activeLocation;
	if (!active?.panoId) return null;

	const run = async () => {
		setRunning(true);
		setResult(null);
		try {
			const locs = await MMA.fetchAllLocations();
			const panoIds = locs.filter((l) => l.panoId).map((l) => l.panoId!);

			// Ensure embeddings exist (cached ones skip instantly)
			await embed(panoIds);

			const results = await searchImage(active.panoId!, null, SIMILARITY_THRESHOLD);

			const matchedIds = results
				.map((r) => locs.find((l) => l.panoId === r.panoId)?.id)
				.filter((id): id is number => id != null);

			if (matchedIds.length > 0) {
				await MMA.addSelections([{
					type: "Locations",
					locations: matchedIds,
					name: MMA.t("Similar to {id}...", { id: active.panoId!.slice(0, 8) }),
				}]);
				setResult(MMA.t("{n} similar", { n: matchedIds.length }));
			} else {
				setResult(MMA.t("No similar panos found"));
			}
		} catch (e) {
			setResult(MMA.t("Error: {error}", { error: String(e) }));
		} finally {
			setRunning(false);
		}
	};

	return (
		<button
			className="button button--small"
			style={{ width: "100%" }}
			disabled={running}
			onClick={run}
		>
			{running ? MMA.t("Searching...") : MMA.t("Find similar panos")}
		</button>
	);
}
