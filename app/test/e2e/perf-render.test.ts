// Render-performance baseline harness. Excluded from the default suite - the config
// exclude list also blocks --spec, so override it when running:
//   npx wdio run wdio.conf.ts --spec ./test/e2e/perf-render.test.ts --exclude ./test/e2e/scratch.test.ts
// Seeds a dense deterministic 1M map, then runs scripted camera scenarios under both
// pin and circle marker styles via the window.__mmaPerf bridge. First run (or a marker
// count change, or UPDATE_BASELINE=1) writes test/perf/render-baseline.json; later runs
// log deltas against it. Local GPU only - never meaningful under Docker/llvmpipe.

import fs from "node:fs";
import path from "node:path";
import { waitForReady, createAndOpenMap, closeMap, deleteMap, withApi } from "./helpers";
import type { FrameStats } from "@/lib/render/frameMeter";
import type { RenderStats } from "@/lib/render/renderStats";

const N = 1_000_000;
const CHUNK = 50_000;
const SEED = 1337;
// Bump when scenarios/metering semantics change - invalidates stored baselines.
const BASELINE_V = 2;
const BASELINE_PATH = path.resolve("test/perf/render-baseline.json");

type ScenarioKind = "idle-dense" | "pan-dense" | "pan-wide" | "zoom-sweep";
const ALL: ScenarioKind[] = ["idle-dense", "pan-dense", "pan-wide", "zoom-sweep"];
const HEAVY: ScenarioKind[] = ["pan-wide", "zoom-sweep"];

// Grouped so the expensive style switch (full scene reload) happens once per style;
// size changes are a cheap layer-prop update.
const MATRIX: { style: "pin" | "circle"; size: number; kinds: ScenarioKind[] }[] = [
	{ style: "pin", size: 1, kinds: ALL },
	{ style: "pin", size: 2, kinds: HEAVY },
	{ style: "circle", size: 1, kinds: ALL },
	{ style: "circle", size: 2, kinds: HEAVY },
];

interface ScenarioResult {
	fps: number;
	p50: number;
	p95: number;
	worst: number;
	longTasks: number;
	cpuPerFrame: number | null;
	overdraw: number | null;
	onScreen: number | null;
}

interface ScenarioRaw {
	frames: FrameStats;
	render: RenderStats | null;
	cpuPerFrame: number | null;
}

function toResult(raw: ScenarioRaw): ScenarioResult {
	const round = (v: number) => Math.round(v * 100) / 100;
	return {
		fps: raw.frames.fps,
		p50: round(raw.frames.p50),
		p95: round(raw.frames.p95),
		worst: round(raw.frames.worst),
		longTasks: raw.frames.longTasks,
		cpuPerFrame: raw.cpuPerFrame != null ? round(raw.cpuPerFrame) : null,
		overdraw: raw.render ? round(raw.render.overdraw) : null,
		onScreen: raw.render ? raw.render.onScreenMarkers : null,
	};
}

function loadBaseline(): Record<string, ScenarioResult> | null {
	try {
		const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8")) as {
			meta?: { markers?: number; v?: number };
			scenarios: Record<string, ScenarioResult>;
		};
		// A baseline from a different marker count or metering version is not comparable.
		if (parsed.meta?.markers !== N || parsed.meta?.v !== BASELINE_V) return null;
		return parsed.scenarios;
	} catch {
		return null;
	}
}

function report(name: string, r: ScenarioResult) {
	const b = loadBaseline()?.[name];
	const delta = (cur: number, base: number | undefined | null) =>
		base ? ` (${cur >= base ? "+" : ""}${(((cur - base) / base) * 100).toFixed(0)}%)` : "";
	console.log(
		`  [PERF] ${name}: fps=${r.fps}${delta(r.fps, b?.fps)} p95=${r.p95}ms${delta(r.p95, b?.p95)} ` +
			`worst=${r.worst}ms longtasks=${r.longTasks} cpu/frame=${r.cpuPerFrame ?? "n/a"}ms ` +
			`overdraw=${r.overdraw ?? "n/a"}x onscreen=${r.onScreen ?? "n/a"}`,
	);
}

// Runs entirely in-page: positions the camera for the scenario, meters the gesture.
// The cluster spans lat 47..48.2, lng 2..3.8; z8 fits essentially all of it on screen.
async function runScenario(kind: ScenarioKind): Promise<ScenarioRaw> {
	return withApi(async (_api, kind: ScenarioKind): Promise<ScenarioRaw> => {
		const P = window.__mmaPerf!;
		const host = P.host();
		if (!host) throw new Error("no map host");
		const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

		if (kind === "zoom-sweep") host.moveCamera({ center: { lat: 47.6, lng: 2.9 }, zoom: 13 });
		else if (kind === "pan-dense") host.moveCamera({ center: { lat: 47.2, lng: 2.2 }, zoom: 11 });
		else if (kind === "pan-wide") host.moveCamera({ center: { lat: 47.5, lng: 2.7 }, zoom: 8 });
		else host.moveCamera({ center: { lat: 47.6, lng: 2.9 }, zoom: 10 });
		await sleep(800);

		// gl.finish() per frame: without it, rAF deltas stay near-vsync while the
		// GPU queues frames deep - the numbers lie under exactly the load we care about.
		P.probe(true);
		P.start();
		P.reset();
		if (kind === "idle-dense") {
			await sleep(2000);
		} else if (kind === "pan-dense") {
			for (let i = 0; i < 100; i++) {
				host.moveCamera({ center: { lat: 47.2 + i * 0.008, lng: 2.2 + i * 0.014 } });
				await sleep(33);
			}
		} else if (kind === "pan-wide") {
			// The user-reported worst case: panning with ~all markers on screen.
			for (let i = 0; i < 100; i++) {
				host.moveCamera({ center: { lat: 47.5 + Math.sin(i / 12) * 0.15, lng: 2.7 + i * 0.004 } });
				await sleep(33);
			}
		} else {
			for (let z = 13; z >= 5; z -= 0.5) {
				host.moveCamera({ zoom: z });
				await sleep(200);
			}
		}
		const frames = P.frames();
		const deck = P.deck();
		const render = P.render();
		P.probe(false);
		P.stop();
		return { frames, render, cpuPerFrame: deck ? deck.cpuTimePerFrame : null };
	}, kind);
}

describe("Render perf baseline", () => {
	let mapId: string;
	const results: Record<string, ScenarioResult> = {};

	before(async function () {
		this.timeout(600000); // seeding 1M through the IPC bridge takes a while
		await waitForReady();
		mapId = await createAndOpenMap("Perf Render Baseline");

		for (let c = 0; c < N / CHUNK; c++) {
			await withApi(
				async (api, count: number, seed: number) => {
					let s = seed | 0;
					const rand = () => {
						s = (s + 0x6d2b79f5) | 0;
						let t = Math.imul(s ^ (s >>> 15), 1 | s);
						t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
						return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
					};
					const locs = [];
					for (let i = 0; i < count; i++) {
						locs.push(
							api.createLocation({
								lat: 47 + rand() * 1.2,
								lng: 2 + rand() * 1.8,
								heading: rand() * 360,
								zoom: 1,
							}),
						);
					}
					await api.addLocations(locs);
				},
				CHUNK,
				SEED + c,
			);
		}

		await browser.waitUntil(
			async () =>
				browser.execute((n: number) => {
					const r = window.__mmaPerf?.render();
					return r != null && r.totalMarkers >= n;
				}, N),
			{ timeout: 120000, timeoutMsg: "scene never reached the seeded marker count" },
		);
	});

	after(async () => {
		await closeMap();
		if (mapId) await deleteMap(mapId);

		if (!loadBaseline() || process.env.UPDATE_BASELINE) {
			fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
			fs.writeFileSync(
				BASELINE_PATH,
				JSON.stringify(
					{
						meta: { markers: N, seed: SEED, v: BASELINE_V, date: new Date().toISOString() },
						scenarios: results,
					},
					null,
					"\t",
				),
			);
			console.log(`  [PERF] baseline written: ${BASELINE_PATH}`);
		}
	});

	for (const { style, size, kinds } of MATRIX) {
		describe(`style: ${style} x${size}`, () => {
			before(async () => {
				await withApi(
					async (_api, style: "pin" | "circle", size: number) => {
						const P = window.__mmaPerf!;
						P.setMarkerStyle(style);
						P.setMarkerSize(size);
						// A style change triggers a full scene reload via a React effect;
						// give the effect a beat to start before awaiting the load promise.
						await new Promise((res) => setTimeout(res, 300));
						await P.settled();
					},
					style,
					size,
				);
				await browser.waitUntil(
					async () =>
						browser.execute((n: number) => {
							const r = window.__mmaPerf?.render();
							return r != null && r.totalMarkers >= n;
						}, N),
					{ timeout: 120000, timeoutMsg: `scene did not settle after ${style} style switch` },
				);
			});

			for (const kind of kinds) {
				it(kind, async function () {
					this.timeout(120000);
					const raw = await runScenario(kind);
					const key = `${style}:x${size}:${kind}`;
					results[key] = toResult(raw);
					report(key, results[key]);
					expect(raw.frames.frames).toBeGreaterThan(0);
					expect(raw.render?.totalMarkers).toBe(N);
				});
			}
		});
	}
});
