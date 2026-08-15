import { describe, it, expect, afterEach } from "vitest";
import type { MapHost } from "@/lib/map/host";
import { setMapHost, getMapHost, waitForMapHost } from "@/lib/map/mapState";

const host = (id: string) => ({ id }) as unknown as MapHost;

afterEach(() => setMapHost(null));

describe("waitForMapHost", () => {
	it("resolves immediately once a host is set", async () => {
		setMapHost(host("a"));
		await expect(waitForMapHost()).resolves.toBe(getMapHost());
	});

	it("resolves a waiter that predates the host", async () => {
		const pending = waitForMapHost();
		const h = host("b");
		setMapHost(h);
		await expect(pending).resolves.toBe(h);
	});

	it("still settles a waiter across an intervening close", async () => {
		const pending = waitForMapHost();
		setMapHost(null);
		const h = host("c");
		setMapHost(h);
		await expect(pending).resolves.toBe(h);
	});

	it("gives every waiter across a close the same host", async () => {
		const first = waitForMapHost();
		setMapHost(null);
		const second = waitForMapHost();
		const h = host("d");
		setMapHost(h);
		expect(await Promise.all([first, second])).toEqual([h, h]);
	});
});
