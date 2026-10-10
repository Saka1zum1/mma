/** Send a read again when it is lost in transit (timeout, reset). An HTTP status is an answer. */
export async function fetchRead(url: string, timeoutMs: number): Promise<Response> {
	let last: unknown;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			return await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
		} catch (e) {
			last = e;
			if (attempt === 2) break;
			await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
		}
	}
	throw last;
}
