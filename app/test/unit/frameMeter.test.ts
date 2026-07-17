import { describe, it, expect } from "vitest";
import { FrameMeterCore, percentile } from "@/lib/render/frameMeter";

describe("percentile (nearest-rank)", () => {
	it("empty array returns 0", () => {
		expect(percentile([], 0.95)).toBe(0);
	});

	it("single sample returns it for any quantile", () => {
		expect(percentile([16.7], 0.5)).toBe(16.7);
		expect(percentile([16.7], 0.95)).toBe(16.7);
	});

	it("p50 and p95 of 1..100", () => {
		const arr = Array.from({ length: 100 }, (_, i) => i + 1);
		expect(percentile(arr, 0.5)).toBe(50);
		expect(percentile(arr, 0.95)).toBe(95);
	});

	it("never reads past the end", () => {
		expect(percentile([1, 2, 3], 1)).toBe(3);
	});
});

describe("FrameMeterCore", () => {
	function meterAt(times: number[]) {
		let i = 0;
		return new FrameMeterCore(() => times[Math.min(i++, times.length - 1)]);
	}

	it("computes fps from mean delta", () => {
		const m = new FrameMeterCore(() => 0);
		for (let i = 0; i < 60; i++) m.push(16.667);
		expect(m.stats().fps).toBe(60);
	});

	it("stats reflect pushed deltas", () => {
		const m = new FrameMeterCore(() => 0);
		[10, 20, 30, 40, 50].forEach((d) => m.push(d));
		const s = m.stats();
		expect(s.frames).toBe(5);
		expect(s.p50).toBe(30);
		expect(s.worst).toBe(50);
	});

	it("ring buffer keeps only the newest window but counts all frames", () => {
		const m = new FrameMeterCore(() => 0);
		for (let i = 0; i < 700; i++) m.push(10);
		m.push(100);
		const s = m.stats();
		expect(s.frames).toBe(701);
		expect(s.worst).toBe(100);
	});

	it("reset clears samples, longtasks, and elapsed origin", () => {
		const m = meterAt([0, 1000, 1500]);
		m.push(16);
		m.pushLongTask(120);
		m.reset(); // now() = 1000
		const s = m.stats(); // now() = 1500
		expect(s.frames).toBe(0);
		expect(s.longTasks).toBe(0);
		expect(s.longTaskMs).toBe(0);
		expect(s.worst).toBe(0);
		expect(s.elapsedMs).toBe(500);
	});

	it("accumulates longtasks", () => {
		const m = new FrameMeterCore(() => 0);
		m.pushLongTask(60);
		m.pushLongTask(90);
		const s = m.stats();
		expect(s.longTasks).toBe(2);
		expect(s.longTaskMs).toBe(150);
	});

	it("zero samples yields fps 0, not NaN", () => {
		const m = new FrameMeterCore(() => 0);
		expect(m.stats().fps).toBe(0);
	});
});
