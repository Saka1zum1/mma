import { describe, it, expect } from "vitest";
import { GenerationEngine } from "@/plugins/generator/engine/GenerationEngine";
import { DEFAULT_SETTINGS } from "@/plugins/generator/engine/types";
import type { GeneratorRegion, GenerationCallbacks } from "@/plugins/generator/engine/types";

// #46: settings changed mid-job must take effect without restarting.

function worldRegion(): GeneratorRegion {
	return {
		id: "test",
		name: "Test",
		feature: {
			type: "Feature",
			properties: { name: "Test" },
			geometry: {
				type: "Polygon",
				coordinates: [[[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]]],
			},
		},
		found: [],
		target: 1,
		checkedPanos: new Set(),
		isProcessing: false,
	};
}

const noopCallbacks: GenerationCallbacks = {
	onLocationsFound: () => {},
	onProgress: () => {},
	onRegionComplete: () => {},
	onDone: () => {},
};

describe("GenerationEngine live settings", () => {
	it("applies a mid-job radius change to subsequent probes", async () => {
		const radii: number[] = [];
		let calls = 0;
		let engine!: GenerationEngine;

		class FakeStreetViewService {
			getPanorama(
				req: { radius?: number },
				cb: (data: null, status: string) => void,
			) {
				radii.push(req.radius ?? -1);
				calls++;
				if (calls === 1) engine.updateSettings({ ...DEFAULT_SETTINGS, radius: 999 });
				if (calls >= 40) engine.stop();
				cb(null, "ZERO_RESULTS");
			}
		}

		const fakeGoogle = {
			maps: {
				StreetViewService: FakeStreetViewService,
				StreetViewSource: { GOOGLE: "google", DEFAULT: "default" },
			},
		} as unknown as Google;

		engine = new GenerationEngine(
			fakeGoogle,
			{ ...DEFAULT_SETTINGS, radius: 500, numGenerators: 1 },
			[worldRegion()],
			noopCallbacks,
		);

		await engine.start();

		expect(radii[0]).toBe(500); // first probe used the original radius
		expect(radii.length).toBeGreaterThan(1);
		expect(radii.slice(1).every((r) => r === 999)).toBe(true); // all later probes used the live value
		expect(engine.isRunning()).toBe(false);
	});
});
