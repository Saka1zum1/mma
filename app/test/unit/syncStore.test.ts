// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createSyncStore } from "@/lib/util/syncStore";

describe("createSyncStore", () => {
	it("getSnapshot returns 0 initially", () => {
		const store = createSyncStore();
		expect(store.getSnapshot()).toBe(0);
	});

	it("notify increments version by 1 each call", () => {
		const store = createSyncStore();
		store.notify();
		expect(store.getSnapshot()).toBe(1);
		store.notify();
		expect(store.getSnapshot()).toBe(2);
		store.notify();
		expect(store.getSnapshot()).toBe(3);
	});

	it("subscribe listener is called on notify", () => {
		const store = createSyncStore();
		const fn = vi.fn();
		store.subscribe(fn);
		store.notify();
		expect(fn).toHaveBeenCalledOnce();
	});

	it("multiple listeners are all called", () => {
		const store = createSyncStore();
		const a = vi.fn();
		const b = vi.fn();
		const c = vi.fn();
		store.subscribe(a);
		store.subscribe(b);
		store.subscribe(c);
		store.notify();
		expect(a).toHaveBeenCalledOnce();
		expect(b).toHaveBeenCalledOnce();
		expect(c).toHaveBeenCalledOnce();
	});

	it("unsubscribe removes the listener", () => {
		const store = createSyncStore();
		const fn = vi.fn();
		const unsub = store.subscribe(fn);
		unsub();
		store.notify();
		expect(fn).not.toHaveBeenCalled();
	});

	it("other listeners still called after one unsubscribes", () => {
		const store = createSyncStore();
		const a = vi.fn();
		const b = vi.fn();
		const unsubA = store.subscribe(a);
		store.subscribe(b);
		unsubA();
		store.notify();
		expect(a).not.toHaveBeenCalled();
		expect(b).toHaveBeenCalledOnce();
	});

	it("listeners called in subscription order", () => {
		const store = createSyncStore();
		const order: number[] = [];
		store.subscribe(() => order.push(1));
		store.subscribe(() => order.push(2));
		store.subscribe(() => order.push(3));
		store.notify();
		expect(order).toEqual([1, 2, 3]);
	});

	it("listener added during notify IS called in the same cycle", () => {
		const store = createSyncStore();
		const late = vi.fn();
		store.subscribe(() => {
			store.subscribe(late);
		});
		store.notify();
		expect(late).toHaveBeenCalledOnce();
	});

	it("listener that unsubscribes itself during notify does not affect other listeners", () => {
		const store = createSyncStore();
		const order: string[] = [];
		let unsub: () => void;
		unsub = store.subscribe(() => {
			order.push("a");
			unsub();
		});
		store.subscribe(() => order.push("b"));
		store.subscribe(() => order.push("c"));
		store.notify();
		expect(order).toEqual(["a", "b", "c"]);

		order.length = 0;
		store.notify();
		expect(order).toEqual(["b", "c"]);
	});

	it("calling unsubscribe twice does not throw", () => {
		const store = createSyncStore();
		const unsub = store.subscribe(vi.fn());
		unsub();
		expect(() => unsub()).not.toThrow();
	});

	it("two stores are independent", () => {
		const s1 = createSyncStore();
		const s2 = createSyncStore();
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		s1.subscribe(fn1);
		s2.subscribe(fn2);

		s1.notify();
		expect(s1.getSnapshot()).toBe(1);
		expect(s2.getSnapshot()).toBe(0);
		expect(fn1).toHaveBeenCalledOnce();
		expect(fn2).not.toHaveBeenCalled();
	});
});
