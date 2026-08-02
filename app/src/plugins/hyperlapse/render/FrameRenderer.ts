import {
	PerspectiveCamera,
	Scene,
	WebGLRenderer,
	Mesh,
	SphereGeometry,
	MeshBasicMaterial,
	CanvasTexture,
	Vector3,
	SRGBColorSpace,
	ClampToEdgeWrapping,
	LinearFilter,
	Color,
} from "three";
import type { HyperlapseFrame } from "../types";

export interface FrameRendererOptions {
	width?: number;
	height?: number;
	fov?: number;
}

/**
 * Three.js equirectangular sphere renderer.
 *
 * Matches Hyperlapse.js: one reusable CanvasTexture; frame changes only swap
 * `texture.image` + `needsUpdate`. Look/roll updates never touch GPU uploads.
 */
export class FrameRenderer {
	readonly canvas: HTMLCanvasElement;
	private renderer: WebGLRenderer;
	private scene: Scene;
	private camera: PerspectiveCamera;
	private mesh: Mesh<SphereGeometry, MeshBasicMaterial>;
	private texture: CanvasTexture | null = null;
	private boundImage: HTMLCanvasElement | null = null;
	private width: number;
	private height: number;
	private fov: number;
	private disposed = false;
	private target = new Vector3();

	constructor(container: HTMLElement, opts: FrameRendererOptions = {}) {
		this.width = Math.max(1, (opts.width ?? container.clientWidth) || 800);
		this.height = Math.max(1, (opts.height ?? container.clientHeight) || 400);
		this.fov = opts.fov ?? 70;

		this.renderer = new WebGLRenderer({
			antialias: false,
			alpha: false,
			preserveDrawingBuffer: false,
			powerPreference: "low-power",
			depth: false,
			stencil: false,
		});
		this.renderer.setClearColor(new Color(0x111111), 1);
		// Keep DPR at 1 — hyperlapse is already soft from equirect sampling;
		// higher DPR multiplies fill-rate cost and fights the map/SV contexts.
		this.renderer.setPixelRatio(1);
		this.renderer.setSize(this.width, this.height, false);
		this.canvas = this.renderer.domElement;
		this.canvas.style.display = "block";
		this.canvas.style.width = "100%";
		this.canvas.style.height = "100%";
		container.appendChild(this.canvas);

		this.camera = new PerspectiveCamera(this.fov, this.width / this.height, 1, 1100);
		this.camera.position.set(0, 0, 0);
		this.scene = new Scene();

		// Fewer segments than Hyperlapse.js's 60/40 — still smooth enough for equirect.
		const geo = new SphereGeometry(500, 40, 24);
		geo.scale(-1, 1, 1);
		const mat = new MeshBasicMaterial({ toneMapped: false });
		this.mesh = new Mesh(geo, mat);
		this.scene.add(this.mesh);
	}

	setSize(width: number, height: number) {
		if (this.disposed) return;
		const w = Math.max(1, Math.floor(width));
		const h = Math.max(1, Math.floor(height));
		if (w === this.width && h === this.height) return;
		this.width = w;
		this.height = h;
		this.renderer.setSize(this.width, this.height, false);
		this.camera.aspect = this.width / this.height;
		this.camera.updateProjectionMatrix();
	}

	setFov(fov: number) {
		if (this.fov === fov) return;
		this.fov = fov;
		this.camera.fov = fov;
		this.camera.updateProjectionMatrix();
	}

	/**
	 * Bind a frame's canvas. Reuses a single CanvasTexture (Hyperlapse.js style)
	 * instead of dispose+recreate, which was a major GPU memory churn source.
	 */
	setTexture(frame: HyperlapseFrame) {
		if (this.disposed) return;
		const image = frame.image;
		if (!image || image.width <= 0 || image.height <= 0) return;
		if (this.boundImage === image) return;

		if (!this.texture) {
			const tex = new CanvasTexture(image);
			tex.colorSpace = SRGBColorSpace;
			tex.wrapS = ClampToEdgeWrapping;
			tex.wrapT = ClampToEdgeWrapping;
			tex.minFilter = LinearFilter;
			tex.magFilter = LinearFilter;
			tex.generateMipmaps = false;
			tex.needsUpdate = true;
			this.texture = tex;
			this.mesh.material.map = tex;
			this.mesh.material.needsUpdate = true;
		} else {
			this.texture.image = image;
			this.texture.needsUpdate = true;
		}
		this.boundImage = image;
	}

	/** Absolute camera look (already includes POV offsets). */
	setLook(headingDeg: number, pitchDeg: number, rollDeg = 0) {
		if (this.disposed) return;
		const lat = Math.max(-85, Math.min(85, pitchDeg));
		// Inverted sphere (scale -1,1,1): yaw vs equirect matches generatePerspectiveFromEquirect at +180°.
		const lon = headingDeg + 180;
		const phi = ((90 - lat) * Math.PI) / 180;
		const theta = (lon * Math.PI) / 180;

		this.target.set(
			500 * Math.sin(phi) * Math.cos(theta),
			500 * Math.cos(phi),
			500 * Math.sin(phi) * Math.sin(theta),
		);
		this.camera.lookAt(this.target);
		if (rollDeg) this.camera.rotateZ((-rollDeg * Math.PI) / 180);
	}

	render() {
		if (this.disposed) return;
		this.renderer.render(this.scene, this.camera);
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.mesh.geometry.dispose();
		this.texture?.dispose();
		this.mesh.material.dispose();
		this.texture = null;
		this.boundImage = null;
		// Aggressively free the GL context so map/SV can recover after heavy panos.
		try {
			const gl = this.renderer.getContext();
			const lose = gl?.getExtension?.("WEBGL_lose_context");
			lose?.loseContext();
		} catch {
			// ignore
		}
		this.renderer.dispose();
		this.canvas.remove();
	}
}
