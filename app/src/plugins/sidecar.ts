// The plugin sidecar client: one set of Tauri event listeners for every request,
// demultiplexed by request id. The app owns the processes; this is how the webview
// talks to them.

import { events } from "@/bindings.gen";
import { cmd as commands } from "@/lib/commands";

// Events can land before `sidecarRequest` learns its id, so unclaimed events are
// buffered until their caller arrives.

type SidecarEvent =
	| { kind: "line"; line: string }
	| { kind: "log"; line: string }
	| { kind: "done"; error: string | null };

const sidecarHandlers = new Map<number, (ev: SidecarEvent) => void>();
const sidecarPending = new Map<number, SidecarEvent[]>();
let sidecarListeners: Promise<void> | null = null;

function routeSidecarEvent(reqId: number, ev: SidecarEvent) {
	const handler = sidecarHandlers.get(reqId);
	if (handler) {
		handler(ev);
		return;
	}
	const buffered = sidecarPending.get(reqId);
	if (buffered) buffered.push(ev);
	else sidecarPending.set(reqId, [ev]);
}

function listenForSidecarEvents(): Promise<void> {
	sidecarListeners ??= (async () => {
		await events.sidecarLine.listen((ev) =>
			routeSidecarEvent(ev.payload.reqId, { kind: "line", line: ev.payload.line }),
		);
		await events.sidecarLog.listen((ev) =>
			routeSidecarEvent(ev.payload.reqId, { kind: "log", line: ev.payload.line }),
		);
		await events.sidecarDone.listen((ev) =>
			routeSidecarEvent(ev.payload.reqId, { kind: "done", error: ev.payload.error }),
		);
	})();
	return sidecarListeners;
}

export interface SidecarOptions<T> {
	/** Fires once per JSON object the sidecar emits, in order. */
	onLine?(item: T): void;
	/** Sidecar diagnostics (stderr), one-shot runs only. Resident-served commands
	 *  write theirs to the app log instead. */
	onLog?(line: string): void;
	signal?: AbortSignal;
}

/** Legacy handle returned by {@link spawn}. Prefer {@link request}. */
export interface SidecarRun {
	runId: number;
	onLine(cb: (line: string) => void): void;
	onStderr(cb: (line: string) => void): void;
	onExit(cb: (code: number | null) => void): void;
	kill(): void;
}

/** Send a command to a plugin's sidecar and resolve with its last emitted JSON
 *  object (null if it emitted none). `payload` is sent as JSON. */
export async function request<T>(
	pluginId: string,
	command: string,
	payload?: unknown,
	opts?: SidecarOptions<T>,
): Promise<T | null> {
	await listenForSidecarEvents();
	const reqId = await commands.sidecarRequest(
		pluginId,
		command,
		payload === undefined ? null : JSON.stringify(payload),
	);

	return new Promise<T | null>((resolve, reject) => {
		let last: T | null = null;
		// Abort kills the run but leaves the handler installed, so the `done` that
		// follows still cleans up. Resident-served work has no process to kill.
		const onAbort = () => {
			commands.sidecarCancel(reqId).catch(() => {});
			reject(new DOMException(`Sidecar ${command} aborted`, "AbortError"));
		};
		sidecarHandlers.set(reqId, (ev) => {
			if (ev.kind === "line") {
				let item: T;
				try {
					item = JSON.parse(ev.line) as T;
				} catch {
					return;
				}
				last = item;
				opts?.onLine?.(item);
			} else if (ev.kind === "log") {
				opts?.onLog?.(ev.line);
			} else {
				sidecarHandlers.delete(reqId);
				opts?.signal?.removeEventListener("abort", onAbort);
				if (ev.error) reject(new Error(ev.error));
				else resolve(last);
			}
		});

		const buffered = sidecarPending.get(reqId);
		if (buffered) {
			sidecarPending.delete(reqId);
			for (const ev of buffered) sidecarHandlers.get(reqId)?.(ev);
		}

		if (opts?.signal?.aborted) onAbort();
		else opts?.signal?.addEventListener("abort", onAbort);
	});
}

/** The sidecar version installed for a plugin, or null when it has none yet. */
export function installedVersion(pluginId: string): Promise<string | null> {
	return commands.sidecarInstalledVersion(pluginId);
}

/**
 * Compatibility shim for plugins still calling `MMA.sidecar.spawn` (pre app-owned
 * sidecar API). Translates CLI-style args (`detect --input path.json`) into
 * {@link request}. New plugins should use `request` directly.
 */
export async function spawn(
	pluginId: string,
	_binaryName: string,
	args: string[],
): Promise<SidecarRun> {
	const command = args[0];
	if (!command) throw new Error("MMA.sidecar.spawn: missing command");
	if (command === "serve") {
		throw new Error(
			"MMA.sidecar.spawn('serve') is no longer supported — update the plugin; the app manages resident sidecars",
		);
	}

	let inputPath: string | undefined;
	for (let i = 1; i < args.length; i++) {
		if (args[i] === "--input" && args[i + 1]) {
			inputPath = args[i + 1];
			break;
		}
	}

	let payload: unknown;
	if (inputPath) {
		payload = JSON.parse(await commands.readFile(inputPath));
	}

	const lineCbs: ((line: string) => void)[] = [];
	const errCbs: ((line: string) => void)[] = [];
	const exitCbs: ((code: number | null) => void)[] = [];
	const ac = new AbortController();
	let exited = false;
	const finish = (code: number | null) => {
		if (exited) return;
		exited = true;
		for (const cb of exitCbs) cb(code);
	};

	const run: SidecarRun = {
		runId: -1,
		onLine: (cb) => lineCbs.push(cb),
		onStderr: (cb) => errCbs.push(cb),
		onExit: (cb) => exitCbs.push(cb),
		kill: () => ac.abort(),
	};

	// Defer so callers can register onLine/onExit synchronously after `await spawn()`.
	queueMicrotask(() => {
		void request(pluginId, command, payload, {
			signal: ac.signal,
			onLine: (item) => {
				const line = typeof item === "string" ? item : JSON.stringify(item);
				for (const cb of lineCbs) cb(line);
			},
			onLog: (line) => {
				for (const cb of errCbs) cb(line);
			},
		}).then(
			() => finish(0),
			(err: unknown) => {
				if (err instanceof DOMException && err.name === "AbortError") finish(null);
				else finish(1);
			},
		);
	});

	return run;
}

/** The nested `sidecar` namespace on the plugin surface. */
export const sidecar = { request, installedVersion, spawn };
