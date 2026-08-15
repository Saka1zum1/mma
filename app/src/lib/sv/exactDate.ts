import { ymParse } from "@/lib/util/date";

const RPC_URL =
	"https://maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/SingleImageSearch";

const MAX_RETRIES = 3;

// A failed probe must throw, never read as "no images": the bisection treats a
// negative as evidence and would silently converge on a wrong timestamp.
async function singleImageSearch(body: string, signal?: AbortSignal): Promise<string> {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(RPC_URL, {
			method: "POST",
			headers: { "content-type": "application/json+protobuf" },
			body,
			signal,
		});
		if (res.status === 501 || res.status === 503 || res.status === 429) {
			if (attempt < MAX_RETRIES) {
				await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
				continue;
			}
			throw new Error(`SingleImageSearch unavailable (HTTP ${res.status})`);
		}
		if (!res.ok) throw new Error(`SingleImageSearch failed (HTTP ${res.status})`);
		return await res.text();
	}
}

async function checkTimestamp(
	lat: number,
	lng: number,
	start: number,
	end: number,
	radius: number,
	signal?: AbortSignal,
): Promise<boolean> {
	const data = `[["apiv3"],[[null,null,${lat},${lng}],${radius}],[[null,null,null,null,null,null,null,null,null,null,[${start},${end}]],null,null,null,null,null,null,null,[1],null,[[[2,true,2]]]],[[2,6]]]`;
	const text = await singleImageSearch(data, signal);
	return !text.includes("Search returned no images.");
}

/** Interior probes per search round. Each round issues BRANCH concurrent range checks
 *  splitting [lo, hi) into BRANCH+1 segments, so the window shrinks by that factor per
 *  round-trip: ~9 sequential rounds instead of ~22 bisection steps for a month window.
 *  More probes per round would cut rounds further but multiply total RPC volume, which
 *  is the shared bottleneck when enrichment runs many locations concurrently. */
const BRANCH = 4;

export async function resolveExactTimestamp(
	lat: number,
	lng: number,
	yearMonth: string,
	signal?: AbortSignal,
	radius = 50,
	accuracy = 1,
): Promise<number> {
	const ym = ymParse(yearMonth);
	if (!ym) throw new Error(`Bad year-month: ${yearMonth}`);
	const { y: year, m: month } = ym;

	const startDate = new Date(Date.UTC(year, month - 1, 1));
	startDate.setUTCDate(startDate.getUTCDate() - 1);

	const endInit = new Date(Date.UTC(year, month - 1, 1));
	endInit.setUTCDate(endInit.getUTCDate() + 32);

	let lo = startDate.getTime() / 1000;
	let hi = endInit.getTime() / 1000;
	const hiInit = hi;

	// single query over whole date window, so if the pano is not valid in the range to begin with, we don't waste 20+ RPC requests trying to find it
	// TODO: ideally, we just determine which pano is the default (with convergence from LoadAsPanoId) so that we only ever check
	// if the pano is "Google's default pano", but this gets tricky with historical dates decidedly (randomly?) being preferred by Google
	if (!(await checkTimestamp(lat, lng, lo, hi, radius, signal))) {
		throw new Error("Failed to resolve exact date: not a candidate");
	}

	// Invariant: an image exists in (lo, hi]. checkTimestamp(lo, c) is monotone in c,
	// so each round's probe results are a prefix of falses then trues; the earliest
	// image sits between the last false cut and the first true cut.
	while (hi - lo > accuracy) {
		const range = hi - lo;
		const cuts: number[] = [];
		for (let k = 1; k <= BRANCH; k++) {
			const c = lo + Math.floor((range * k) / (BRANCH + 1));
			if (c > lo && c < hi && c !== cuts[cuts.length - 1]) cuts.push(c);
		}
		if (cuts.length === 0) cuts.push(lo + Math.floor(range / 2));

		const results = await Promise.all(
			cuts.map((c) => checkTimestamp(lat, lng, lo, c, radius, signal)),
		);
		const first = results.findIndex(Boolean);
		if (first === -1) {
			lo = cuts[cuts.length - 1];
		} else {
			hi = cuts[first];
			if (first > 0) lo = cuts[first - 1];
		}
	}

	const mid = lo + Math.floor((hi - lo) / 2);
	if (hiInit - mid <= 1) throw new Error("Failed to resolve exact date");
	return mid;
}
