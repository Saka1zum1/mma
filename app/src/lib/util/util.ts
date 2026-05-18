const MMA_BUF_BASE = navigator.platform.startsWith("Win")
	? "http://mma-buf.localhost/"
	: "mma-buf://localhost/";

export function mmaBufUrl(path: string): string {
	return MMA_BUF_BASE + path.replace(/\\/g, "/");
}

export function isFiniteNumber(v: unknown): v is number {
	return typeof v === "number" && isFinite(v);
}

// FOV (degrees) → zoom level
export function fovToZoom(fov: number): number {
	return -Math.log2((4 / 3) * Math.tan((Math.PI * fov) / 360)) + 1;
}
