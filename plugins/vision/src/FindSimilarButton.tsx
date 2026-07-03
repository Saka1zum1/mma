import { useState } from "react";
import { spawnEmbed, spawnImageSearch } from "./sidecar";

const SIMILARITY_THRESHOLD = 0.85;

export function FindSimilarButton() {
	const [running, setRunning] = useState(false);
	const [result, setResult] = useState<string | null>(null);

	const active = MMA.getActiveLocation();
	if (!active?.panoId) return null;

	const run = async () => {
		setRunning(true);
		setResult(null);
		try {
			const locs = await MMA.fetchAllLocations();
			const panoIds = locs.filter((l) => l.panoId).map((l) => l.panoId!);

			// Ensure embeddings exist (cached ones skip instantly)
			const { done: embedDone } = await spawnEmbed(panoIds);
			await embedDone;

			// Search
			const { process: proc, done: searchDone } = await spawnImageSearch(active.panoId!, null, SIMILARITY_THRESHOLD);
			let results: { panoId: string; score: number }[] = [];
			proc.onLine((line) => {
				try {
					const r = JSON.parse(line);
					if (r.results) results = r.results;
				} catch {}
			});
			await searchDone;

			const matchedIds = results
				.map((r) => locs.find((l) => l.panoId === r.panoId)?.id)
				.filter((id): id is number => id != null);

			if (matchedIds.length > 0) {
				await MMA.addSelections([{
					type: "Locations",
					locations: matchedIds,
					name: `Similar to ${active.panoId!.slice(0, 8)}...`,
				}]);
				setResult(`${matchedIds.length} similar`);
			} else {
				setResult("No similar panos found");
			}
		} catch (e) {
			setResult(`Error: ${e}`);
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
			{running ? "Searching..." : "Find similar panos"}
		</button>
	);
}
