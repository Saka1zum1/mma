/** Host-only members of the MMA surface: forks of upstream signatures, plus
 *  the few values that are not a whole module (ready, i18n, settings snapshot). */

import * as store from "@/store/useMapStore";
import { setSetting, getSettings as readSettings } from "@/store/settings";
import { t, tp, getLocale, LOCALES } from "@/lib/i18n";
import { asSelector, type SelectorOrLocations } from "@/legacy";
import { enrichAll as enrichAllRows } from "@/lib/sv/enrich";
import { bulkPinToPano as pinRows } from "@/lib/sv/pinPano";
import { fetchSvMetadata } from "@/lib/sv/svMeta";

export let ready = false;

export { t, tp, getLocale, LOCALES, setSetting, fetchSvMetadata };

/** Snapshot so a plugin cannot mutate the live settings object. */
export function getSettings() {
	return { ...readSettings() };
}

/** Rows are accepted only here, normalized by the legacy adapter; internals take a Selector. */
export async function enrichAll(
	target: SelectorOrLocations,
	opts?: Parameters<typeof enrichAllRows>[1],
) {
	return enrichAllRows(asSelector(target), opts);
}

/** Kept as a count so installed plugins and e2e stay on `Promise<number>`. */
export async function bulkPinToPano(
	target: SelectorOrLocations,
	opts?: Parameters<typeof pinRows>[1],
) {
	const outcome = await pinRows(await store.fetchLocations(asSelector(target)), opts);
	return outcome.succeeded;
}
