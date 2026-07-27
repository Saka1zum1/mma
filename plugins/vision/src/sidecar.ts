const IS_WIN = navigator.userAgent.includes("Windows");
const SEP = IS_WIN ? "\\" : "/";

let _pluginDir: string | null = null;
async function pluginDir(): Promise<string> {
	if (!_pluginDir) {
		const appData = await MMA.cmd.getAppDataDir();
		_pluginDir = `${appData}${SEP}plugins${SEP}vision`;
	}
	return _pluginDir;
}

// Models ship inside the sidecar bundle, extracted next to the binary.
async function modelDir(): Promise<string> {
	return `${await pluginDir()}${SEP}sidecar${SEP}models`;
}

// Embeddings cache lives outside the sidecar dir: sidecar updates wipe
// {appData}/plugins/vision/sidecar/ entirely, and the cache is expensive to rebuild.
async function clipCacheDir(): Promise<string> {
	return `${await pluginDir()}${SEP}clip-cache`;
}

interface SidecarProcess {
	kill(): void;
	onLine(cb: (line: string) => void): void;
	onStderr(cb: (line: string) => void): void;
}

let tempCounter = 0;

async function writeInputFile(data: unknown): Promise<string> {
	const name = `mma_vision_${Date.now()}_${tempCounter++}.json`;
	return MMA.cmd.writeTempFile(name, JSON.stringify(data));
}

async function spawnCommand(args: string[]): Promise<{ process: SidecarProcess; done: Promise<void> }> {
	const run = await MMA.sidecar.spawn("vision", "mma-vision", args);
	run.onStderr((line) => console.error("[vision]", line));

	const proc: SidecarProcess = {
		kill: () => run.kill(),
		onLine: (cb) => run.onLine(cb),
		onStderr: (cb) => run.onStderr(cb),
	};

	const done = new Promise<void>((resolve) => run.onExit(() => resolve()));

	return { process: proc, done };
}

interface PanoEntry {
	panoId: string;
	worldWidth: number;
	worldHeight: number;
}

async function resolveWorldSizes(
	panoIds: string[],
	onProgress?: (done: number, total: number) => void,
): Promise<PanoEntry[]> {
	const BATCH = 200;
	const entries: PanoEntry[] = [];
	for (let i = 0; i < panoIds.length; i += BATCH) {
		const batch = panoIds.slice(i, i + BATCH);
		const metas = await MMA.fetchSvMetadata(batch);
		for (let j = 0; j < batch.length; j++) {
			const m = metas[j];
			const ws = m?.tiles?.worldSize;
			entries.push({
				panoId: batch[j],
				worldWidth: ws?.width ?? 6656,
				worldHeight: ws?.height ?? 3328,
			});
		}
		onProgress?.(Math.min(i + BATCH, panoIds.length), panoIds.length);
	}
	return entries;
}

async function listCached(): Promise<Set<string>> {
	const cd = await clipCacheDir();
	const run = await MMA.sidecar.spawn("vision", "mma-vision", ["list-cached", "--cache-dir", cd]);
	let out = "";
	run.onLine((line) => { out += line; });
	await new Promise<void>((resolve) => run.onExit(() => resolve()));
	try {
		return new Set(JSON.parse(out.trim()) as string[]);
	} catch {
		return new Set();
	}
}

export async function spawnEmbed(
	panoIds: string[],
	onMetaProgress?: (msg: string) => void,
): ReturnType<typeof spawnCommand> {
	onMetaProgress?.(`Checking cache...`);
	const cached = await listCached();
	const uncached = panoIds.filter((id) => !cached.has(id));

	if (uncached.length === 0) {
		onMetaProgress?.(`All ${panoIds.length} panos cached`);
		const proc: SidecarProcess = {
			kill() {},
			onLine() {},
			onStderr() {},
		};
		return { process: proc, done: Promise.resolve() };
	}

	onMetaProgress?.(`Fetching metadata for ${uncached.length} uncached panos...`);
	const panos = await resolveWorldSizes(uncached, (done, total) => {
		onMetaProgress?.(`Metadata: ${done}/${total}`);
	});
	const inputPath = await writeInputFile({ panos });
	const md = await modelDir();
	const cd = await clipCacheDir();
	return spawnCommand(["embed", "--input", inputPath, "--model-dir", md, "--cache-dir", cd]);
}

// --- Resident search server ---
// `serve` keeps the models and embedding cache loaded across queries, so repeat
// searches skip the ONNX/tokenizer/cache load that dominates one-shot commands.
// It idles out on its own (and we kill it on plugin close); searches fall back to
// the one-shot commands when serve is unavailable (e.g. an older installed sidecar).

interface ServeHandle {
	port: number;
	kill(): void;
}

let serve: Promise<ServeHandle | null> | null = null;
let serveUnsupported = false;

async function startServe(): Promise<ServeHandle | null> {
	try {
		const md = await modelDir();
		const cd = await clipCacheDir();
		const run = await MMA.sidecar.spawn("vision", "mma-vision", [
			"serve", "--model-dir", md, "--cache-dir", cd,
		]);
		run.onStderr((line) => console.error("[vision serve]", line));
		const port = await new Promise<number>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("serve start timeout")), 15000);
			run.onLine((line) => {
				try {
					const p = JSON.parse(line)?.port;
					if (typeof p === "number") {
						clearTimeout(timer);
						resolve(p);
					}
				} catch {}
			});
			run.onExit(() => {
				clearTimeout(timer);
				reject(new Error("serve exited on startup"));
			});
		});
		// Idle exit or crash: forget the handle so the next search respawns.
		run.onExit(() => {
			serve = null;
		});
		return { port, kill: () => run.kill() };
	} catch (e) {
		console.error("[vision] serve unavailable, using one-shot search:", e);
		serveUnsupported = true;
		return null;
	}
}

async function serveSearch(
	path: string,
	payload: unknown,
): Promise<{ results: { panoId: string; score: number }[] } | null> {
	if (serveUnsupported) return null;
	const handle = await (serve ??= startServe());
	if (!handle) return null;
	try {
		const res = await fetch(`http://127.0.0.1:${handle.port}${path}`, {
			method: "POST",
			body: JSON.stringify(payload),
		});
		if (!res.ok) throw new Error(`serve responded ${res.status}`);
		return await res.json();
	} catch (e) {
		// Server likely idled out between checks; drop it and let this query
		// take the one-shot path. The next search respawns serve.
		console.error("[vision] serve request failed:", e);
		serve = null;
		return null;
	}
}

/** Kill the resident server (plugin cleanup). */
export function stopServe() {
	void serve?.then((h) => h?.kill());
	serve = null;
}

/** Wrap an already-available result in the {process, done} shape callers expect. */
function resolvedRun(lines: string[]): { process: SidecarProcess; done: Promise<void> } {
	const proc: SidecarProcess = {
		kill() {},
		onLine(cb) {
			for (const line of lines) cb(line);
		},
		onStderr() {},
	};
	return { process: proc, done: Promise.resolve() };
}

export async function spawnTextSearch(query: string, k: number | null, threshold: number | null): ReturnType<typeof spawnCommand> {
	const served = await serveSearch("/search-text", { query, k, threshold });
	if (served) return resolvedRun([JSON.stringify(served)]);
	const inputPath = await writeInputFile({ query, k, threshold });
	const md = await modelDir();
	const cd = await clipCacheDir();
	return spawnCommand(["search-text", "--input", inputPath, "--model-dir", md, "--cache-dir", cd]);
}

export async function spawnImageSearch(panoId: string, k: number | null, threshold: number | null): ReturnType<typeof spawnCommand> {
	const served = await serveSearch("/search-image", { panoId, k, threshold });
	if (served) return resolvedRun([JSON.stringify(served)]);
	const inputPath = await writeInputFile({ panoId, k, threshold });
	const cd = await clipCacheDir();
	return spawnCommand(["search-image", "--input", inputPath, "--cache-dir", cd]);
}
