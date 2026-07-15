/** Map-list search grammar: whitespace-separated terms, AND'd together.
 *  `label:x` or `label:"x y"` matches maps carrying that label (prefix,
 *  case-insensitive); plain terms match name or labels by substring. */

export interface MapQuery {
	text: string[];
	labels: string[];
}

const TERM_RE = /label:"([^"]*)"|label:(\S+)|(\S+)/gi;

export function parseMapQuery(query: string): MapQuery {
	const text: string[] = [];
	const labels: string[] = [];
	for (const m of query.matchAll(TERM_RE)) {
		const label = m[1] ?? m[2];
		if (label != null) {
			if (label) labels.push(label.toLowerCase());
		} else {
			text.push(m[3].toLowerCase());
		}
	}
	return { text, labels };
}

export function mapMatchesQuery(name: string, mapLabels: string[], q: MapQuery): boolean {
	const nameLc = name.toLowerCase();
	const labelsLc = mapLabels.map((l) => l.toLowerCase());
	return (
		q.labels.every((t) => labelsLc.some((l) => l.startsWith(t))) &&
		q.text.every((t) => nameLc.includes(t) || labelsLc.some((l) => l.includes(t)))
	);
}

/** The `label:` term that selects exactly this label, quoted when needed. */
export function labelToken(label: string): string {
	const clean = label.replace(/"/g, "");
	return /\s/.test(clean) ? `label:"${clean}"` : `label:${clean}`;
}

/** Add the label's token to the query if absent, else remove it (chip click toggle). */
export function toggleLabelInQuery(query: string, label: string): string {
	const token = labelToken(label);
	const lc = token.toLowerCase();
	const parts = query.match(/label:"[^"]*"|\S+/gi) ?? [];
	const without = parts.filter((p) => p.toLowerCase() !== lc);
	const next = without.length === parts.length ? [...parts, token] : without;
	return next.join(" ");
}
