// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { makeLatestGate, useSticky } from "@/lib/hooks/useAsync";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// The stale-result invariant of useAsync: a run's result is applied only if no
// newer run (changed deps) or cleanup (unmount) has started since.
describe("makeLatestGate", () => {
	it("reports current only for the most recent run", () => {
		const next = makeLatestGate();
		const first = next();
		expect(first()).toBe(true);

		const second = next();
		expect(first()).toBe(false); // superseded by a newer run
		expect(second()).toBe(true);
	});

	it("a later next() (e.g. cleanup) invalidates every prior predicate", () => {
		const next = makeLatestGate();
		const a = next();
		const b = next();
		next(); // cleanup / unmount

		expect(a()).toBe(false);
		expect(b()).toBe(false);
	});

	it("predicates stay valid across repeated checks until superseded", () => {
		const next = makeLatestGate();
		const only = next();
		expect(only()).toBe(true);
		expect(only()).toBe(true);
		next();
		expect(only()).toBe(false);
	});
});

describe("useSticky", () => {
	it("holds the last settled value while loading, and a settled null is a value", () => {
		let seen: string | null | undefined;
		let setState: (s: {
			data: string | null;
			loading: boolean;
			error: Error | null;
		}) => void = () => {};
		function Probe() {
			const [state, set] = useState<{ data: string | null; loading: boolean; error: Error | null }>(
				{ data: null, loading: true, error: null },
			);
			setState = set;
			seen = useSticky(state);
			return null;
		}
		const container = document.createElement("div");
		const root = createRoot(container);
		act(() => root.render(createElement(Probe)));
		expect(seen).toBeNull();
		act(() => setState({ data: "v1", loading: false, error: null }));
		expect(seen).toBe("v1");
		act(() => setState({ data: null, loading: true, error: null }));
		expect(seen).toBe("v1");
		act(() => setState({ data: null, loading: false, error: null }));
		expect(seen).toBeNull();
		act(() => root.unmount());
	});
});
