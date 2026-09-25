// Gen4 camera, Run shape. Rows that share a pano and heading are classified once
// from the nadir thumbnail, then the label fans back out to every matching row.

import type { Location, Update, LocationPatch_Deserialize as LocationPatch } from "mma-plugin-types";

declare const mma: {
	sidecar(
		pluginId: string,
		command: string,
		payload: string,
		onLine?: (line: string) => void,
	): string[];
	progress(units: number): void;
	fail(id: number): void;
	aborted(): boolean;
};

const PLUGIN_ID = "gen4cam";
const COMMAND = "detect";

interface Item {
	panoId: string;
	heading: number;
}

interface DetectLine {
	panoId?: string;
	heading?: number;
	camera?: string | null;
	error?: string | null;
}

function parseLine(line: string): DetectLine | null {
	try {
		const parsed: unknown = JSON.parse(line);
		return parsed && typeof parsed === "object" ? (parsed as DetectLine) : null;
	} catch {
		return null;
	}
}

function keyOf(panoId: string, heading: number): string {
	return `${panoId}\n${heading}`;
}

export function run(rows: Location[]): Update<LocationPatch>[] {
	if (mma.aborted()) return [];

	const byKey = new Map<string, Location[]>();
	const items: Item[] = [];
	for (const row of rows) {
		if (!row.panoId) continue;
		const key = keyOf(row.panoId, row.heading);
		const group = byKey.get(key);
		if (group) group.push(row);
		else {
			byKey.set(key, [row]);
			items.push({ panoId: row.panoId, heading: row.heading });
		}
	}
	if (items.length === 0) return [];

	const out: Update<LocationPatch>[] = [];
	mma.sidecar(PLUGIN_ID, COMMAND, JSON.stringify({ items }), (line) => {
		const parsed = parseLine(line);
		if (!parsed?.panoId || typeof parsed.heading !== "number") return;
		const group = byKey.get(keyOf(parsed.panoId, parsed.heading));
		if (!group) return;
		for (const row of group) {
			if (parsed.error) mma.fail(row.id);
			else if (typeof parsed.camera === "string" && parsed.camera.length > 0)
				out.push({ id: row.id, patch: { extra: { gen4Camera: parsed.camera } } });
			mma.progress(1);
		}
	});
	return out;
}
