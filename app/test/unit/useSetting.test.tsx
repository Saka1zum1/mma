// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useSetting, setSetting, getSettings, type AppSettings } from "@/store/settings";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const renders: Record<string, number> = {};

function Probe({ id, k }: { id: string; k: keyof AppSettings }) {
	useSetting(k);
	renders[id] = (renders[id] ?? 0) + 1;
	return null;
}

beforeEach(() => {
	for (const id of Object.keys(renders)) delete renders[id];
});

function mount(...probes: React.ReactElement[]) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => root.render(<>{probes}</>));
	return () => act(() => root.unmount());
}

describe("useSetting per-key granularity", () => {
	it("re-renders only when its own key changes (primitive)", () => {
		const unmount = mount(
			<Probe key="gap" id="gap" k="tagGap" />,
			<Probe key="fps" id="fps" k="showFps" />,
		);
		expect(renders).toEqual({ gap: 1, fps: 1 });

		act(() => setSetting("showCrosshair", !getSettings().showCrosshair));
		expect(renders).toEqual({ gap: 1, fps: 1 });

		act(() => setSetting("tagGap", getSettings().tagGap + 1));
		expect(renders).toEqual({ gap: 2, fps: 1 });

		act(() => setSetting("showFps", !getSettings().showFps));
		expect(renders).toEqual({ gap: 2, fps: 2 });
		unmount();
	});

	it("re-renders only when its own key changes (object-valued)", () => {
		const unmount = mount(
			<Probe key="color" id="color" k="markerColor" />,
			<Probe key="pinned" id="pinned" k="pinnedCommands" />,
		);
		expect(renders).toEqual({ color: 1, pinned: 1 });

		act(() => setSetting("labelColors", { ...getSettings().labelColors, x: "#fff" }));
		expect(renders).toEqual({ color: 1, pinned: 1 });

		act(() => setSetting("markerColor", { ...getSettings().markerColor }));
		expect(renders).toEqual({ color: 2, pinned: 1 });
		unmount();
	});

	it("preserves object references across unrelated sets (the invariant it relies on)", () => {
		const before = getSettings().markerColor;
		act(() => setSetting("tagGap", getSettings().tagGap + 1));
		expect(getSettings().markerColor).toBe(before);
	});
});
