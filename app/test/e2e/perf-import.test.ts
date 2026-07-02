// Perf harness: drives the REAL import flow (parse -> store_import_file -> autocommit
// -> render) for a 1M-location map on the actual WebView2 app, so the full trace log
// (mma.log) reflects production timings. Not part of the normal suite — run via
// wdio.perf.conf.ts. The numbers we optimize against come from mma.log, not asserts.
import fs from "fs";
import os from "os";
import path from "path";
import { waitForReady, createAndOpenMap, closeMap, deleteMap } from "./helpers";

const N = Number(process.env.PERF_N ?? 1_000_000);
const FIXTURE = path.join(os.tmpdir(), `mma_perf_${N}.json`);

// Generate a representative GeoGuessr-style fixture once: lat/lng/heading/panoId + a
// small `extra` (countryCode) so the extra-JSON serialization cost in bake is exercised,
// matching a real map. Streamed to disk to avoid holding the whole array in memory.
function ensureFixture() {
	if (fs.existsSync(FIXTURE)) return;
	const cc = ["US", "FR", "JP", "BR", "ZA", "AU", "DE", "IN", "CA", "RU"];
	const ws = fs.createWriteStream(FIXTURE);
	ws.write("[");
	for (let i = 0; i < N; i++) {
		const lat = (Math.random() * 170 - 85).toFixed(6);
		const lng = (Math.random() * 360 - 180).toFixed(6);
		const heading = (Math.random() * 360).toFixed(2);
		const obj = `{"lat":${lat},"lng":${lng},"heading":${heading},"panoId":"pano_${i}","extra":{"countryCode":"${cc[i % cc.length]}"}}`;
		ws.write(i === 0 ? obj : "," + obj);
	}
	ws.write("]");
	ws.end();
	return new Promise<void>((resolve) => ws.on("finish", () => resolve()));
}

describe("Perf - import 1M", () => {
	let mapId: string;

	before(async function () {
		this.timeout(300_000);
		await ensureFixture();
		await waitForReady();
	});

	afterEach(async () => {
		await closeMap();
		if (mapId) await deleteMap(mapId);
	});

	it("import + autocommit + render", async function () {
		this.timeout(300_000);
		mapId = await createAndOpenMap(`Perf Import ${N} #${Date.now()}`);

		const result = await browser.executeAsync((fixture: string, done: (r: unknown) => void) => {
			const api = window.MMA;
			(async () => {
				try {
					const t0 = performance.now();
					await api.beginImportFromPath(fixture);
					const tPreview = performance.now();
					await api.confirmImport([], undefined);
					const tConfirm = performance.now();
					// Measure the render path directly (post-commit = contention-free):
					// storeFillRenderFile (build+write) then the mma-buf fetch (transfer).
					const rf0 = performance.now();
					const fp = await api.cmd.storeFillRenderFile({
						west: -180,
						south: -90,
						east: 180,
						north: 90,
						markerStyle: "pin",
					});
					const rf1 = performance.now();
					const resp = await fetch(api.mmaBufUrl(fp));
					const buf = await resp.arrayBuffer();
					const rf2 = performance.now();
					done({
						preview: tPreview - t0,
						confirm: tConfirm - tPreview,
						renderFill: rf1 - rf0,
						renderFetch: rf2 - rf1,
						renderBytes: buf.byteLength,
					});
				} catch (e) {
					done({ err: (e as Error).message });
				}
			})();
		}, FIXTURE);

		// Let the (fire-and-forget) render effect finish and flush its trace to mma.log.
		// eslint-disable-next-line no-restricted-syntax -- no observable post-condition; waits on a log-trace side effect
		await browser.pause(5000);

		console.log(`  [PERF] ${JSON.stringify(result)}`);
		const r = result as { err?: string };
		if (r.err) throw new Error(r.err);
	});
});
