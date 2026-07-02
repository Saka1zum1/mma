// Probe: selection sync cost at 1M. Imports the cached perf fixture, then times
// storeSyncSelections for representative selections. Not part of the normal suite.
import fs from "fs";
import os from "os";
import path from "path";
import { waitForReady, createAndOpenMap, closeMap, deleteMap } from "./helpers";

const FIXTURE = path.join(os.tmpdir(), `mma_perf_1000000.json`);

describe("Perf - selection sync 1M", () => {
	let mapId: string;
	before(async function () {
		this.timeout(300_000);
		if (!fs.existsSync(FIXTURE))
			throw new Error("run perf-import first to generate the 1M fixture");
		await waitForReady();
	});
	afterEach(async () => {
		await closeMap();
		if (mapId) await deleteMap(mapId);
	});

	it("sync selections", async function () {
		this.timeout(300_000);
		mapId = await createAndOpenMap(`Perf Sel ${Date.now()}`);
		const r = await browser.executeAsync((fixture: string, done: (v: unknown) => void) => {
			const api = window.MMA;
			(async () => {
				try {
					await api.beginImportFromPath(fixture);
					await api.confirmImport([], undefined);
					const time = async (fn: () => Promise<unknown>) => {
						await api.resetSelections();
						const t = performance.now();
						await fn();
						return performance.now() - t;
					};
					const everything = await time(() => api.selectEverything());
					const panoIds = await time(() => api.selectPanoIds());
					// Empty/sparse: selects ~0 rows. If this is still ~O(total N), the JS
					// overlay rebuild is the culprit (independent of |selected|).
					const emptyTag = await time(() => api.selectTag(987654321));
					// Partial sync: mutate (add 1 location) while everything is selected. This
					// re-syncs only the affected cell but the kept-scan spans the ~1M-entry
					// overlay -- the "edit while a large selection is active" path.
					await api.resetSelections();
					await api.selectEverything();
					const loc = api.createLocation({ lat: 12.3456, lng: 65.4321 });
					const tEdit = performance.now();
					await api.addLocations([loc]);
					const editWhileSelected = performance.now() - tEdit;
					done({ everything, panoIds, emptyTag, editWhileSelected });
				} catch (e) {
					done({ err: (e as Error).message });
				}
			})();
		}, FIXTURE);
		console.log(`  [PERF-SEL] ${JSON.stringify(r)}`);
		const e = (r as { err?: string }).err;
		if (e) throw new Error(e);
	});
});
