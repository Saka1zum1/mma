const OFFICIAL_PANO_RE = /^[-_A-Za-z0-9]{21}[AQgw]$/;

export function isOfficialPano(panoId: string): boolean {
	if (panoId.startsWith("F:")) return false;
	return OFFICIAL_PANO_RE.test(panoId);
}

/** Newest official pano in a capture timeline, or null if it holds none. Timelines from
 *  `fetchSvMetadata` are sorted ascending by date, so "newest" is the last official entry —
 *  scanning backwards rather than indexing keeps that assumption in one place. */
export function newestOfficialPano<T extends { pano: string }>(time: readonly T[]): T | null {
	return time.findLast((t) => isOfficialPano(t.pano)) ?? null;
}
