// Chapter content lives in ./chapters/*.mdx, named `NN-id.mdx` (the numeric prefix
// sets reading order, the remainder is the chapter id). Both the rendered view and
// full-text search derive the chapter list from the raw .mdx source -- the single
// source of truth. The view (Manual.tsx) additionally compiles each file into a
// component; search reads only the prose, so it stays decoupled from MDX compilation.

export function chapterIdFromPath(p: string): string {
	return p
		.slice(p.lastIndexOf("/") + 1)
		.replace(/^\d+-/, "")
		.replace(/\.mdx$/, "");
}

function chapterOrder(p: string): number {
	const m = p.slice(p.lastIndexOf("/") + 1).match(/^(\d+)-/);
	return m ? Number(m[1]) : 0;
}

function parseTitle(source: string): string {
	return source.match(/export\s+const\s+title\s*=\s*["'](.*?)["']/)?.[1] ?? "";
}

export interface ChapterMeta {
	id: string;
	title: string;
	order: number;
	source: string;
}

const sources = import.meta.glob("./chapters/*.mdx", {
	query: "?raw",
	import: "default",
	eager: true,
}) as Record<string, string>;

export const CHAPTERS: ChapterMeta[] = Object.entries(sources)
	.map(([p, source]) => ({
		id: chapterIdFromPath(p),
		order: chapterOrder(p),
		title: parseTitle(source),
		source,
	}))
	.sort((a, b) => a.order - b.order);

export function chapterTitle(id: string): string {
	return CHAPTERS.find((c) => c.id === id)?.title ?? id;
}

// --- Full-text search ---

// Strip an .mdx chapter's source to plain prose so it can be searched. Cross-references
// resolve to the linked chapter's title and images contribute their caption, mirroring
// how each renders.
function chapterToText(source: string): string {
	return source
		.replace(/^export\s+const\s+.*$/gm, "")
		.replace(/<ChapterLink\s+id=["']([^"']+)["']\s*\/>/g, (_m, id: string) => chapterTitle(id))
		.replace(/<Img\b[^>]*\bcaption=["']([^"']*)["'][^>]*\/?>/g, (_m, cap: string) => cap)
		.replace(/<\/?[A-Za-z][^>]*>/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/&[a-z]+;/gi, " ")
		.replace(/[*_`>#]/g, " ")
		.replace(/^\s*(?:[-*]|\d+\.)\s+/gm, " ")
		.replace(/\s+/g, " ")
		.trim();
}

interface ChapterText {
	id: string;
	title: string;
	text: string;
}

let searchIndex: ChapterText[] | null = null;

function getSearchIndex(): ChapterText[] {
	if (!searchIndex) {
		searchIndex = CHAPTERS.map((c) => ({ id: c.id, title: c.title, text: chapterToText(c.source) }));
	}
	return searchIndex;
}

export interface ManualHit {
	id: string;
	title: string;
	snippet: string;
}

// A short excerpt of `text` centered on the earliest matched term.
function makeSnippet(text: string, lowerText: string, terms: string[]): string {
	let pos = -1;
	for (const t of terms) {
		const i = lowerText.indexOf(t);
		if (i !== -1 && (pos === -1 || i < pos)) pos = i;
	}
	if (pos === -1) return text.slice(0, 120).trim() + (text.length > 120 ? "…" : "");
	const start = Math.max(0, pos - 50);
	const end = Math.min(text.length, pos + 90);
	let s = text.slice(start, end).trim();
	if (start > 0) s = "…" + s;
	if (end < text.length) s = s + "…";
	return s;
}

// Search every chapter's title and body. All whitespace-separated terms must be
// present. Title matches rank above body-only matches. Returns up to `limit` hits.
export function searchManual(query: string, limit = 8): ManualHit[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const terms = q.split(/\s+/);
	const scored: { hit: ManualHit; score: number }[] = [];
	for (const ch of getSearchIndex()) {
		const titleLc = ch.title.toLowerCase();
		const textLc = ch.text.toLowerCase();
		const haystack = titleLc + " " + textLc;
		if (!terms.every((t) => haystack.includes(t))) continue;
		const titleHit = titleLc.includes(q);
		const score = (titleHit ? 0 : 100) + (textLc.includes(q) ? 0 : 10);
		scored.push({ hit: { id: ch.id, title: ch.title, snippet: makeSnippet(ch.text, textLc, terms) }, score });
	}
	scored.sort((a, b) => a.score - b.score);
	return scored.slice(0, limit).map((s) => s.hit);
}
