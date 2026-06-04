// tauri-plugin-webserve bootstrap. Injected into <head> before the app bundle.
// Defines window.__TAURI_INTERNALS__ so the UNMODIFIED desktop bundle runs in a
// plain browser: real commands go to the HTTP /__ipc bridge; plugin:* protocols
// (events, window, dialog, ...) are emulated generically here.
(function () {
	if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.__webserve) return;

	// --- callback registry (transformCallback) ---
	let cbId = 0;
	const callbacks = new Map();

	function transformCallback(cb, once) {
		const id = ++cbId;
		callbacks.set(id, (payload) => {
			if (once) callbacks.delete(id);
			return cb && cb(payload);
		});
		return id;
	}

	// --- in-tab event bus (plugin:event) ---
	let eventId = 0;
	const listeners = []; // { event, cbId, id }

	function eventInvoke(name, args) {
		if (name === "listen") {
			const id = ++eventId;
			listeners.push({ event: args.event, cbId: args.handler, id });
			return id;
		}
		if (name === "unlisten") {
			const i = listeners.findIndex((l) => l.id === args.eventId);
			if (i >= 0) listeners.splice(i, 1);
			return null;
		}
		if (name === "emit" || name === "emit_to") {
			const evt = args.event;
			const payload = args.payload;
			for (const l of listeners.slice()) {
				if (l.event !== evt) continue;
				const cb = callbacks.get(l.cbId);
				if (cb) cb({ event: evt, id: l.id, payload });
			}
			return null;
		}
		return null;
	}

	// --- dialog (plugin:dialog) ---
	// open: browser file picker -> upload bytes to a server temp file -> return its
	// path, so the app's existing "read file at path" commands work unchanged.
	function dialogInvoke(name, args) {
		const opts = (args && args.options) || {};
		if (name === "open") {
			return new Promise((resolve) => {
				const input = document.createElement("input");
				input.type = "file";
				if (opts.multiple) input.multiple = true;
				input.onchange = async () => {
					const file = input.files && input.files[0];
					if (!file) return resolve(null);
					const text = await file.text();
					const path = await realInvoke("write_temp_file", {
						name: file.name,
						content: text,
					});
					resolve(opts.multiple ? [path] : path);
				};
				input.click();
			});
		}
		// save / message / ask / confirm: degrade gracefully on web.
		if (name === "save") return Promise.resolve(null);
		if (name === "ask" || name === "confirm") return Promise.resolve(window.confirm(opts.message || ""));
		if (name === "message") {
			window.alert(opts.message || "");
			return Promise.resolve(null);
		}
		return Promise.resolve(null);
	}

	// --- generic plugin:* dispatch ---
	function pluginInvoke(cmd, args) {
		const m = cmd.match(/^plugin:([^|]+)\|(.+)$/);
		if (!m) return Promise.resolve(null);
		const ns = m[1];
		const name = m[2];
		switch (ns) {
			case "event":
				return Promise.resolve(eventInvoke(name, args || {}));
			case "log": {
				/* eslint-disable no-console */
				const msg = (args && args.message) || "";
				console.log(msg);
				return Promise.resolve(null);
			}
			case "webview":
			case "webviewWindow":
			case "webview-window": {
				if (name.includes("create")) {
					const o = (args && (args.options || args)) || {};
					if (o.url) window.open(new URL(o.url, location.href).href, o.label || "_blank");
					return Promise.resolve(null);
				}
				if (name.includes("get_all")) return Promise.resolve([]); // label list, must be array
				return Promise.resolve(null);
			}
			case "window":
				if (name.includes("get_all")) return Promise.resolve([]); // get_all_windows -> array
				if (name === "is_visible") return Promise.resolve(true);
				if (name.startsWith("is_")) return Promise.resolve(false); // minimized/maximized/fullscreen
				return Promise.resolve(null); // show/hide/focus/close/etc -> no-op
			case "dialog":
				return dialogInvoke(name, args || {});
			case "updater":
			case "process":
			case "notification":
			case "os":
			default:
				return Promise.resolve(null);
		}
	}

	// --- real command bridge (-> HTTP /__ipc) ---
	function realInvoke(cmd, args) {
		return fetch("/__ipc/" + cmd, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(args ?? {}),
		}).then(async (r) => {
			const body = await r.json();
			if (!r.ok) {
				const e = body && typeof body === "object" && "error" in body ? body.error : body;
				return Promise.reject(e);
			}
			return body;
		});
	}

	function invoke(cmd, args) {
		if (typeof cmd === "string" && cmd.startsWith("plugin:")) return pluginInvoke(cmd, args);
		return realInvoke(cmd, args);
	}

	// Rewrite custom-scheme URLs (http://<scheme>.localhost/...) to /__scheme/.
	// Two layers: (1) a synchronous fetch() patch so fetch-based calls (e.g. the
	// render buffer) work IMMEDIATELY — no service-worker activation race; (2) a
	// service worker for subresources that bypass fetch (e.g. <img> map tiles).
	function rewriteSchemeUrl(url) {
		try {
			const u = new URL(url, location.href);
			if (!u.hostname.endsWith(".localhost")) return null;
			const scheme = u.hostname.slice(0, -".localhost".length);
			return location.origin + "/__scheme/" + scheme + u.pathname + u.search;
		} catch {
			return null;
		}
	}
	const _fetch = window.fetch.bind(window);
	window.fetch = (input, init) => {
		const url = typeof input === "string" ? input : input && input.url;
		const rewritten = url && rewriteSchemeUrl(url);
		return rewritten ? _fetch(rewritten, init) : _fetch(input, init);
	};
	if ("serviceWorker" in navigator) {
		navigator.serviceWorker.register("/__webserve/sw.js").catch(() => {});
	}

	window.__TAURI_INTERNALS__ = {
		__webserve: true,
		metadata: {
			currentWindow: { label: "main" },
			currentWebview: { windowLabel: "main", label: "main" },
		},
		invoke,
		transformCallback,
		convertFileSrc: (path) => path,
		// Some builds probe these; provide harmless stubs.
		ipc: (msg) => {},
		unregisterCallback: (id) => callbacks.delete(id),
	};
})();
