import path from "path";

process.env.MMA_TEST_DB = "1";

export const config: WebdriverIO.Config = {
	runner: "local",
	specs: ["./test/e2e/**/*.test.ts"],
	maxInstances: 1,
	capabilities: [
		{
			"tauri:options": {
				application: path.resolve("./src-tauri/target/debug/map-making-app.exe"),
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
		timeout: 120000,
	},
};
