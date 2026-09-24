/** Learnable Meta clue shown after a LocalGuessr round.
 *  The host proxies `GET /api/userscript/location` so the webview never talks to
 *  learnablemeta.com directly. Notes and footers arrive as HTML; only their text is shown. */

import { cmd } from "@/lib/commands";

export interface LearnableMetaClue {
	country: string;
	metaName: string;
	note: string;
	footer: string;
	images: string[];
}

const cache = new Map<string, Promise<LearnableMetaClue | null>>();

export function plainClueText(html: string): string {
	const doc = new DOMParser().parseFromString(html, "text/html");
	for (const node of doc.querySelectorAll("script, style")) node.remove();
	return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function loadLearnableMetaClue(
	mapId: string,
	panoId: string,
): Promise<LearnableMetaClue | null> {
	const key = `${mapId}\n${panoId}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const request = cmd
		.learnableMetaClue(mapId, panoId)
		.then((clue) => {
			if (!clue) return null;
			const note = plainClueText(clue.note);
			const footer = plainClueText(clue.footer);
			if (!clue.country && !clue.metaName && !note && !footer && clue.images.length === 0) {
				return null;
			}
			return { ...clue, note, footer };
		})
		.catch((error) => {
			cache.delete(key);
			throw error;
		});
	cache.set(key, request);
	return request;
}
