import path from "path";
import fs from "fs";
import { installSvMock } from "./test/e2e/svMock";

process.env.MMA_TEST_DB = "1";
process.env.TSX_TSCONFIG_PATH = path.resolve("tsconfig.app.json");

const isWorker = !!process.env.WDIO_WORKER_ID;
let logStream: fs.WriteStream | undefined;

if (!isWorker) {
	const logDir = path.resolve("./test/logs");
	fs.mkdirSync(logDir, { recursive: true });
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	// Random suffix keeps parallel shards (separate containers, shared logs mount)
	// from clobbering one another's log file.
	const suffix = Math.random().toString(36).slice(2, 7);
	const logPath = path.join(logDir, `e2e-${timestamp}-${suffix}.txt`);
	logStream = fs.createWriteStream(logPath, { encoding: "utf-8" });
	process.env.MMA_E2E_LOG_PATH = logPath;

	const origWrite = process.stdout.write.bind(process.stdout);
	process.stdout.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
		const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
		logStream!.write(text.replace(/\x1b\[[0-9;]*m/g, ""));
		return origWrite(chunk, ...(args as []));
	};
}

export const config: WebdriverIO.Config = {
	runner: "local",
	specs: ["./test/e2e/**/*.test.ts"],
	exclude: [
		"./test/e2e/scratch.test.ts",
		"./test/e2e/benchmarks.test.ts",
		"./test/e2e/speed-matrix.test.ts",
		"./test/e2e/bulk-import-rust.test.ts",
		"./test/e2e/perf-import.test.ts",
		"./test/e2e/perf-sel.test.ts",
		"./test/e2e/perf-render.test.ts",
	],
	maxInstances: 1,
	capabilities: [
		{
			"tauri:options": {
				application:
					process.env.MMA_E2E_BINARY ??
					(process.platform === "win32"
						? path.resolve("./src-tauri/target/debug/map-making-app.exe")
						: fs.existsSync("/usr/local/bin/map-making-app")
							? "/usr/local/bin/map-making-app"
							: path.resolve("./src-tauri/target/debug/map-making-app")),
				args: ["--test-db"],
			},
		},
	],
	hostname: "localhost",
	port: 4444,
	path: "/",
	logLevel: "warn",
	waitforTimeout: 10000,
	connectionRetryTimeout: 20000,
	connectionRetryCount: 2,
	framework: "mocha",
	reporters: ["spec"],
	mochaOpts: {
		ui: "bdd",
		timeout: 300000,
	},
	// Monkey-patch Street View (window.fetch + google.maps) from the test side when
	// --mock is on, so the network-bound specs run deterministically with no network.
	// Per-suite + idempotent so it survives any per-spec session reset.
	beforeSuite: async () => {
		if (process.env.MMA_TEST_MOCK_SV) {
			try {
				await browser.execute(installSvMock);
			} catch (e) {
				console.log("[sv-mock] install failed:", (e as Error).message);
			}
		}
	},
	onComplete: () => {
		if (logStream) {
			const p = process.env.MMA_E2E_LOG_PATH;
			logStream.end();
			console.log(`\nLog: ${p}`);
		}
	},
};
