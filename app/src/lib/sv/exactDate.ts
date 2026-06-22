const RPC_URL =
	"https://maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/SingleImageSearch";

const MAX_RETRIES = 3;

async function singleImageSearch(body: string, signal?: AbortSignal): Promise<string> {
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
			return "Search returned no images.";
		}
		if (!res.ok) return "Search returned no images.";
		return await res.text();
	}
	return "Search returned no images.";
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

export async function resolveExactTimestamp(
	lat: number,
	lng: number,
	yearMonth: string,
	signal?: AbortSignal,
	radius = 50,
	accuracy = 1,
): Promise<number> {
	const [year, month] = yearMonth.split("-").map(Number);

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

	while (true) {
		const range = hi - lo;
		const mid = lo + Math.floor(range / 2);

		if (range <= accuracy) {
			if (hiInit - mid <= 1) throw new Error("Failed to resolve exact date");
			return mid;
		}

		if (await checkTimestamp(lat, lng, lo, mid, radius, signal)) {
			hi = mid;
		} else {
			lo = mid;
		}
	}
}
