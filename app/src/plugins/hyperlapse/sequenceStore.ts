import { createPluginStorage } from "@/plugins/registry";
import type { SavedSequence } from "./types";

const store = createPluginStorage("hyperlapse");
const KEY = "sequences";
const MAX_SAVED = 50;

function normalize(seq: SavedSequence): SavedSequence {
	return {
		...seq,
		modifiedAt: seq.modifiedAt ?? seq.createdAt ?? Date.now(),
	};
}

export function listSavedSequences(): SavedSequence[] {
	const list = store.get<SavedSequence[]>(KEY, []);
	if (!Array.isArray(list)) return [];
	return list.map(normalize).sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export function saveSequence(seq: SavedSequence): void {
	const now = Date.now();
	const next = normalize({
		...seq,
		createdAt: seq.createdAt || now,
		modifiedAt: now,
	});
	const list = listSavedSequences().filter((s) => s.id !== next.id);
	list.unshift(next);
	store.set(KEY, list.slice(0, MAX_SAVED));
}

export function renameSavedSequence(id: string, name: string): boolean {
	const trimmed = name.trim();
	if (!trimmed) return false;
	const list = listSavedSequences();
	const idx = list.findIndex((s) => s.id === id);
	if (idx < 0) return false;
	list[idx] = { ...list[idx], name: trimmed, modifiedAt: Date.now() };
	store.set(KEY, list);
	return true;
}

export function deleteSavedSequence(id: string): void {
	store.set(
		KEY,
		listSavedSequences().filter((s) => s.id !== id),
	);
}

export function getSavedSequence(id: string): SavedSequence | undefined {
	return listSavedSequences().find((s) => s.id === id);
}

/** Default name for a new sequence: sequence_1, sequence_2, … */
export function nextSequenceName(): string {
	const existing = listSavedSequences().map((s) => s.name);
	let n = 1;
	while (existing.includes(`sequence_${n}`)) n++;
	return `sequence_${n}`;
}
