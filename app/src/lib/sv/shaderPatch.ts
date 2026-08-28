/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-function-type */
// WebGL shader patching for Street View panorama
// Intercepts canvas creation, hooks the WebGL context, and replaces shaders
// when defines (like NO_CAR) are active. Must be imported before any panorama
// canvas is created (i.e. at app startup).

const FRAG_SHADER = `precision highp float;
const float h = 3.1415926;
varying vec3 a;
#ifdef NO_CAR
varying vec3 eyeDirection;
uniform float uBaiduCarRotate;
#endif
uniform vec4 b;
uniform float f;
uniform sampler2D g;
void main() {
    vec2 texCoord = a.xy / a.z;
    vec4 color = vec4(1.0, 0.0, 0.0, 1.0);
    color = vec4(texture2D(g, texCoord).rgb, f);
#ifdef NO_CAR
    vec2 normalizedEyeDirection = eyeDirection.xy / a.z;
    normalizedEyeDirection.x = abs(normalizedEyeDirection.x * 4.0 - 2.0);
    normalizedEyeDirection.x = smoothstep(0.0, 1.0, normalizedEyeDirection.x > 1.0 ? 2.0 - normalizedEyeDirection.x : normalizedEyeDirection.x);
    if (uBaiduCarRotate > 0.5) {
        float phiI = 1.0 - normalizedEyeDirection.x;
        float grayMask  = step(normalizedEyeDirection.y, mix(0.6, 0.7, phiI));
        color.rgb = mix(vec3(0.6, 0.6, 0.6), color.rgb, grayMask);
    } else {
        float carMask = step(normalizedEyeDirection.y, mix(0.6, 0.7, normalizedEyeDirection.x));
        color.rgb = mix(vec3(0.6, 0.6, 0.6), color.rgb, carMask);
    }
#endif
    gl_FragColor = color;
}`;

const VERT_SHADER = `varying vec3 a;
#ifdef NO_CAR
varying vec3 eyeDirection;
#endif
uniform vec4 b;
attribute vec3 c;
attribute vec2 d;
uniform mat4 e;
void main() {
    vec4 g = vec4(c, 1);
    gl_Position = e * g;
#ifdef NO_CAR
    eyeDirection = vec3(d.x, d.y, 1.0) * length(c);
#endif
    a = vec3(d.xy * b.xy + b.zw, 1);
    a *= length(c);
}`;

function patchFn(obj: any, name: string, wrapper: (original: Function) => Function) {
	obj[name] = wrapper(obj[name]);
}

function patchAll(obj: any, patches: Record<string, (original: Function) => Function>) {
	for (const name in patches) {
		if (typeof patches[name] === "function") patchFn(obj, name, patches[name]);
	}
}

let activeDefines: string[] | null = [];
let activeUniforms: any[] = [];

// Listen for the global message that sets defines
const globalListener = (e: MessageEvent) => {
	const t = e.data;
	if (t.type === "update-material") {
		activeDefines = t.shaderMessage.defines || [];
		activeUniforms = t.shaderMessage.uniforms || [];
	}
};
window.addEventListener("message", globalListener);

patchAll(document, {
	createElement: (origCreate) =>
		function (this: Document, ...args: any[]) {
			const el = origCreate.apply(this, args);
			const tagName = args[0];
			if (tagName && tagName.toLowerCase() === "canvas") {
				patchAll(el, {
					getContext: (origGetContext) =>
						function (this: HTMLCanvasElement, ...ctxArgs: any[]) {
							const ctxType = ctxArgs[0];
							const ctxAttrs = ctxArgs[1];
							const isSvCanvas =
								ctxType &&
								ctxType.startsWith("webgl") &&
								ctxAttrs &&
								"preserveDrawingBuffer" in ctxAttrs;

							const gl = origGetContext.apply(this, ctxArgs);
							if (!isSvCanvas || gl == null) return gl;

							// Skip GeoGuessr game panoramas
							if (document.querySelector("bmap > .game-layout__panorama") != null) return gl;

							installShaderHooks(gl, el);
							return gl;
						},
				});
			}
			return el;
		},
});

function installShaderHooks(gl: WebGLRenderingContext, canvas: HTMLCanvasElement) {
	let currentDefineKey = "default";
	let needsRefresh = false;
	const compiledPrograms: Record<string, WebGLProgram> = {};
	const programKeys = new Map<WebGLProgram, string>();
	const uniformLocCache: Record<string, Record<string, WebGLUniformLocation | null>> = {};
	const savedUniforms: Record<string, { func: Function; args: any[] }> = {};
	let currentProgram: any = null;
	let activeProgram: any = null;
	// The real (unmodified) Street View material program, captured the first
	// time Google binds it. Lets us eagerly re-sync the shader swap the instant
	// a new define/uniform message arrives, instead of waiting for Google to
	// happen to call useProgram again — which may never happen soon for a
	// static scene with no navigation UI (e.g. a Baidu pano with no
	// links/neighbors has nothing to hover/redraw for).
	let defaultProgramRef: any = null;
	let uniforms: any[] = [];

	const origShaderSource = gl.shaderSource.bind(gl);
	const origGetUniformLocation = gl.getUniformLocation.bind(gl);
	const origAttachShader = gl.attachShader.bind(gl);
	const origUseProgram = gl.useProgram.bind(gl);
	const origUniform1fv = gl.uniform1fv.bind(gl);
	const origUniform2fv = gl.uniform2fv.bind(gl);
	const origUniform3fv = gl.uniform3fv.bind(gl);

	// Best-effort nudge to make Google's renderer actually redraw a frame so a
	// GPU state change becomes visible without waiting for the user to
	// pan/zoom/hover. Purely cosmetic now — correctness no longer depends on
	// this firing (see syncNow below), it only affects how soon the change
	// becomes visible on screen.
	const nudgeRepaint = () => {
		window.requestAnimationFrame(() => {
			const prevDisplay = canvas.style.display;
			canvas.style.display = "none";
			void canvas.offsetHeight;
			canvas.style.display = prevDisplay;
			canvas.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
		});
	};

	const scheduleRefresh = () => {
		window.requestAnimationFrame(() => {
			needsRefresh = true;
			nudgeRepaint();
		});
	};

	const ensureCompiled = (defines: string[]): string => {
		if (defines.length === 0) return "default";
		defines.sort();
		const key = defines.join("_");
		if (key in compiledPrograms) return key;

		const header = "//Custom shader\n" + defines.map((d) => `#define ${d}`).join("\n") + "\n";
		const vs = gl.createShader(gl.VERTEX_SHADER)!;
		const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
		origShaderSource(vs, header + VERT_SHADER);
		gl.compileShader(vs);
		origShaderSource(fs, header + FRAG_SHADER);
		gl.compileShader(fs);
		const prog = gl.createProgram()!;
		origAttachShader(prog, vs);
		origAttachShader(prog, fs);
		gl.linkProgram(prog);
		// Complete linking now so a toggle frame only swaps programs.
		gl.getProgramParameter(prog, gl.LINK_STATUS);
		compiledPrograms[key] = prog;
		programKeys.set(prog, key);
		uniformLocCache[key] = {};
		return key;
	};

	const compileDefines = (defines: string[]) => {
		currentDefineKey = ensureCompiled(defines);
	};

	// A fresh pano canvas (including LocalGuessr fullscreen) must not compile
	// the car-toggle variant in the middle of its first toggle frame.
	ensureCompiled(["NO_CAR"]);

	/**
	 * Re-apply all known uniform state (Google's own default-program uniforms,
	 * plus our custom shaderMessage.uniforms) onto `replacement`. Shared by the
	 * lazy path (Google happens to call useProgram again) and the eager path
	 * (we force the swap ourselves — see syncNow).
	 */
	const applyUniformState = (replacement: any) => {
		uniformLocCache[currentDefineKey] ??= {};

		for (const uName in savedUniforms) {
			const { func, args: uArgs } = savedUniforms[uName];
			uniformLocCache[currentDefineKey][uName] ||= origGetUniformLocation(replacement, uName);
			uArgs[0] = uniformLocCache[currentDefineKey][uName];
			func.apply(gl, uArgs);
		}

		const timeLoc =
			uniformLocCache[currentDefineKey].time || origGetUniformLocation(replacement, "time");
		if (timeLoc && typeof timeLoc !== "string") {
			uniformLocCache[currentDefineKey].time = timeLoc;
			const t = (Date.now() / 1000) % 1000;
			scheduleRefresh();
			origUniform1fv(timeLoc, [t]);
		} else if (!timeLoc) {
			uniformLocCache[currentDefineKey].time = "fake" as any;
		}

		if (currentDefineKey !== "default") {
			for (const u of uniforms) {
				uniformLocCache[currentDefineKey][u.name] ||= origGetUniformLocation(replacement, u.name);
				const loc = uniformLocCache[currentDefineKey][u.name];
				if (u.type === "float") origUniform1fv(loc, u.value);
				else if (u.type === "vec2") origUniform2fv(loc, u.value);
				else if (u.type === "vec3") origUniform3fv(loc, u.value);
			}
		}
	};

	/**
	 * Eagerly perform the shader swap the moment defines/uniforms change,
	 * instead of waiting for Google to call useProgram again on its own.
	 *
	 * This keeps the intended define and bound program in sync immediately.
	 * The uniform wrappers below additionally translate writes against the
	 * program GL actually has bound, covering any remaining mid-frame handoff.
	 *
	 * Calling this synchronously on every "update-material" message removes
	 * the gap entirely: `currentDefineKey` and `activeProgram` always change
	 * together, atomically.
	 */
	const syncNow = () => {
		if (!defaultProgramRef) return; // no pano bound on this canvas yet — the
		// pre-canvas `activeDefines` global mechanism below handles that case.
		const replacement =
			currentDefineKey === "default" ? defaultProgramRef : compiledPrograms[currentDefineKey];
		if (replacement == null) return;
		origUseProgram(replacement);
		currentProgram = defaultProgramRef;
		activeProgram = replacement;
		needsRefresh = false;
		applyUniformState(replacement);
		nudgeRepaint();
	};

	window.addEventListener("message", (e) => {
		const t = e.data;
		if (t.type === "update-material") {
			compileDefines(t.shaderMessage.defines || []);
			uniforms = t.shaderMessage.uniforms || [];
			syncNow();
		}
	});

	patchAll(gl, {
		shaderSource: (orig) =>
			function (this: WebGLRenderingContext, ...args: any[]) {
				const shader = args[0];
				const source = args[1];
				const result = orig.apply(this, args);
				if (source.includes("texture2DProj") && !source.startsWith("//Custom shader")) {
					shader.defaultShader = true;
				}
				return result;
			},

		attachShader: (orig) =>
			function (this: WebGLRenderingContext, ...args: any[]) {
				const program = args[0];
				if (args[1].defaultShader) program.defaultProgram = true;
				return orig.apply(this, args);
			},

		getUniformLocation: (orig) =>
			function (this: WebGLRenderingContext, ...args: any[]) {
				const program = args[0];
				const name = args[1];
				const loc = orig.apply(this, args);
				if (program.defaultProgram) {
					loc.uniformVariableName = name;
					loc.program = program;
				}
				return loc;
			},

		useProgram: (origUseProgramWrapped) =>
			function (this: WebGLRenderingContext, ...args: any[]) {
				const prog = args[0];
				currentProgram = prog;
				activeProgram = prog;

				if (prog != null && prog.defaultProgram) {
					defaultProgramRef = prog;

					if (activeDefines) {
						compileDefines(activeDefines);
						activeDefines = null;
						uniforms = activeUniforms;
						needsRefresh = true;
					}

					const replacement =
						currentDefineKey === "default" ? prog : compiledPrograms[currentDefineKey];
					args[0] = replacement;
					activeProgram = replacement;

					if (needsRefresh) {
						needsRefresh = false;
						origUseProgramWrapped.apply(this, args);
						applyUniformState(replacement);
						return;
					}
				}

				activeProgram = args[0];
				return origUseProgramWrapped.apply(this, args);
			},
	});

	// Patch all uniform* functions to track saved uniforms
	const uniformFns = [
		"uniform1f",
		"uniform1fv",
		"uniform1i",
		"uniform1iv",
		"uniform2f",
		"uniform2fv",
		"uniform2i",
		"uniform2iv",
		"uniform3f",
		"uniform3fv",
		"uniform3i",
		"uniform3iv",
		"uniform4f",
		"uniform4fv",
		"uniform4i",
		"uniform4iv",
		"uniformMatrix2fv",
		"uniformMatrix3fv",
		"uniformMatrix4fv",
	];

	const glr = gl as unknown as Record<string, (...a: unknown[]) => unknown>;
	for (const fn of uniformFns) {
		const orig = (glr[fn] as Function).bind(gl);
		glr[fn] = function (...args: unknown[]) {
			const prog = currentProgram;
			const loc = args[0] as { uniformVariableName: string };

			if (prog?.defaultProgram) {
				savedUniforms[loc.uniformVariableName] = { func: orig, args };

				// Translate against the program GL actually has bound, not the
				// define key a pending toggle intends to use.
				const boundKey = activeProgram === prog ? "default" : programKeys.get(activeProgram);
				if (boundKey === undefined) return;
				if (boundKey !== "default") {
					const boundProgram = compiledPrograms[boundKey];
					uniformLocCache[boundKey] ??= {};
					uniformLocCache[boundKey][loc.uniformVariableName] ||= origGetUniformLocation(
						boundProgram,
						loc.uniformVariableName,
					);
					args[0] = uniformLocCache[boundKey][loc.uniformVariableName];
				}
			}

			return orig.apply(gl, args);
		};
	}

	window.removeEventListener("message", globalListener);
}

export {};
