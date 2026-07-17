// Unit-space marker shape math, mirrored from sdf-marker-fragment.glsl.ts (the visual
// source of truth). Two consumers:
// - CPU hit-testing (markerDistancePx) — replaces deck.gl GPU picking.
// - Interior meshes for the opaque depth pass (interiorMesh) — discard-free geometry
//   inscribed in each shape, shrunk per-vertex along miter normals in the vertex shader.

export type MarkerShape = "circle" | "arrow" | "pin";

export const SHAPE_TO_INT: Record<MarkerShape, number> = { circle: 0, arrow: 1, pin: 2 };

/** Extra pixels of slop around a marker's edge when hit-testing (deck used pickingRadius: 2). */
export const PICK_SLOP_PX = 2;

/** Below this on-screen radius the opaque interior pass is skipped: the shrink margin
 *  would eat the shape, and tiny quads are cheap to blend anyway. */
export const MIN_OPAQUE_RADIUS_PX = 8;

// Circle inscribes the unit quad (radius 1.0) — see sdf-marker-fragment.glsl.
export function sdCircle(x: number, y: number): number {
	return Math.hypot(x, y) - 1.0;
}

function sdTriangleIsosceles(px: number, py: number, qx: number, qy: number): number {
	px = Math.abs(px);
	const t = clamp((px * qx + py * qy) / (qx * qx + qy * qy), 0, 1);
	const ax = px - qx * t;
	const ay = py - qy * t;
	const t2 = clamp(px / qx, 0, 1);
	const bx = px - qx * t2;
	const by = py - qy;
	const s = -Math.sign(qy);
	const dx = Math.min(ax * ax + ay * ay, bx * bx + by * by);
	const dy = Math.min(s * (px * qy - py * qx), s * (py - qy));
	return -Math.sqrt(dx) * Math.sign(dy);
}

function sdBox(px: number, py: number, bx: number, by: number): number {
	const dx = Math.abs(px) - bx;
	const dy = Math.abs(py) - by;
	const ox = Math.max(dx, 0);
	const oy = Math.max(dy, 0);
	return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0);
}

export function sdArrow(x: number, y: number): number {
	const head = sdTriangleIsosceles(x, y + 0.5, 0.6, 0.6);
	const shaft = sdBox(x, y - 0.3, 0.2, 0.3);
	return Math.min(head, shaft);
}

const PIN_CY = 0.3;
const PIN_CR = 0.65;
const PIN_TIP = -0.9;
const PIN_SIN_A = 0.5416666666666667;
const PIN_COS_A = 0.8405933750763339;
const PIN_EDGE_LEN = 1.0087120500916007;

export function sdPin(x: number, y: number): number {
	y = -y;
	x = Math.abs(x);
	const tpx = x;
	const tpy = y - PIN_TIP;
	const along = tpx * PIN_SIN_A + tpy * PIN_COS_A;
	if (along < 0) return Math.hypot(tpx, tpy);
	if (along > PIN_EDGE_LEN) return Math.hypot(x, y - PIN_CY) - PIN_CR;
	return tpx * PIN_COS_A - tpy * PIN_SIN_A;
}

export function sdShape(shape: MarkerShape, x: number, y: number): number {
	if (shape === "arrow") return sdArrow(x, y);
	if (shape === "pin") return sdPin(x, y);
	return sdCircle(x, y);
}

/**
 * Signed distance in pixels from a cursor to a marker's edge. (dx, dyDown) is the
 * cursor offset from the marker anchor in screen pixels, y down. Inverts the vertex
 * shader's placement: scr = flipY(R(-angle) * unit * r) + pin tip-anchor shift.
 */
export function markerDistancePx(
	shape: MarkerShape,
	dx: number,
	dyDown: number,
	radiusPx: number,
	angleDeg = 0,
): number {
	const dyUp = -dyDown;
	const sx = dx;
	const sy = shape === "pin" ? dyUp - 0.9 * radiusPx : dyUp;
	const vx = sx;
	const vy = -sy;
	const a = (angleDeg * Math.PI) / 180;
	const c = Math.cos(a);
	const s = Math.sin(a);
	const ux = (c * vx - s * vy) / radiusPx;
	const uy = (s * vx + c * vy) / radiusPx;
	return sdShape(shape, ux, uy) * radiusPx;
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(Math.max(v, lo), hi);
}

// ---------------------------------------------------------------------------
// Interior meshes
// ---------------------------------------------------------------------------

type Pt = [number, number];

/** Circle outline at the SDF radius. */
function circleOutline(): Pt[] {
	const n = 24;
	const pts: Pt[] = [];
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2;
		pts.push([Math.cos(a), Math.sin(a)]);
	}
	return pts;
}

/** Arrow union outline (triangle head + shaft box), directly in unit space. */
function arrowOutline(): Pt[] {
	return [
		[0, -0.5],
		[0.6, 0.1],
		[0.2, 0.1],
		[0.2, 0.6],
		[-0.2, 0.6],
		[-0.2, 0.1],
		[-0.6, 0.1],
	];
}

/** Pin outline: tip, tangent edges, head arc — built in the SDF's internal frame
 *  (tip at y=-0.9, head circle at (0, 0.3)), then flipped to unit space (sdPin
 *  negates y on entry). */
function pinOutline(): Pt[] {
	const trx = PIN_SIN_A * PIN_EDGE_LEN;
	const trY = PIN_TIP + PIN_COS_A * PIN_EDGE_LEN;
	const a0 = Math.atan2(trY - PIN_CY, trx);
	const a1 = Math.PI - a0;
	const arcSteps = 20;
	const pts: Pt[] = [[0, PIN_TIP]];
	for (let i = 0; i <= arcSteps; i++) {
		const a = a0 + ((a1 - a0) * i) / arcSteps;
		pts.push([PIN_CR * Math.cos(a), PIN_CY + PIN_CR * Math.sin(a)]);
	}
	return pts.map(([x, y]) => [x, -y]);
}

/** Per-vertex miter normals pointing outward, scaled so `v - normal * margin` offsets
 *  both adjacent edges by `margin`. Winding-agnostic via the signed-area test. */
function outlineNormals(pts: Pt[]): Pt[] {
	const n = pts.length;
	let area = 0;
	for (let i = 0; i < n; i++) {
		const [x0, y0] = pts[i];
		const [x1, y1] = pts[(i + 1) % n];
		area += x0 * y1 - x1 * y0;
	}
	const ccw = area > 0;
	return pts.map((p, i) => {
		const prev = pts[(i + n - 1) % n];
		const next = pts[(i + 1) % n];
		const edgeNormal = (from: Pt, to: Pt): Pt => {
			const ex = to[0] - from[0];
			const ey = to[1] - from[1];
			const len = Math.hypot(ex, ey) || 1;
			return ccw ? [ey / len, -ex / len] : [-ey / len, ex / len];
		};
		const n0 = edgeNormal(prev, p);
		const n1 = edgeNormal(p, next);
		let mx = n0[0] + n1[0];
		let my = n0[1] + n1[1];
		const len = Math.hypot(mx, my) || 1;
		mx /= len;
		my /= len;
		const cos = Math.max(0.25, mx * n0[0] + my * n0[1]);
		return [mx / cos, my / cos];
	});
}

export interface InteriorMesh {
	/** xyz per vertex; vertex 0 is the fan center (normal 0). */
	positions: Float32Array;
	/** xy outward miter normal per vertex. */
	normals: Float32Array;
	indices: Uint16Array;
}

const FAN_CENTER: Record<MarkerShape, Pt> = {
	circle: [0, 0],
	arrow: [0, 0.05],
	pin: [0, -0.3],
};

const OUTLINES: Record<MarkerShape, () => Pt[]> = {
	circle: circleOutline,
	arrow: arrowOutline,
	pin: pinOutline,
};

const meshCache = new Map<MarkerShape, InteriorMesh>();

export function interiorMesh(shape: MarkerShape): InteriorMesh {
	const cached = meshCache.get(shape);
	if (cached) return cached;
	const outline = OUTLINES[shape]();
	const normals = outlineNormals(outline);
	const n = outline.length;
	const positions = new Float32Array((n + 1) * 3);
	const norms = new Float32Array((n + 1) * 2);
	const [cx, cy] = FAN_CENTER[shape];
	positions[0] = cx;
	positions[1] = cy;
	for (let i = 0; i < n; i++) {
		positions[(i + 1) * 3] = outline[i][0];
		positions[(i + 1) * 3 + 1] = outline[i][1];
		norms[(i + 1) * 2] = normals[i][0];
		norms[(i + 1) * 2 + 1] = normals[i][1];
	}
	const indices = new Uint16Array(n * 3);
	for (let i = 0; i < n; i++) {
		indices[i * 3] = 0;
		indices[i * 3 + 1] = i + 1;
		indices[i * 3 + 2] = ((i + 1) % n) + 1;
	}
	const mesh: InteriorMesh = { positions, normals: norms, indices };
	meshCache.set(shape, mesh);
	return mesh;
}
