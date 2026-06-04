// tauri-plugin-webserve service worker. Transparently rewrites custom Tauri URI
// scheme requests (e.g. http://mma-buf.localhost/..., http://svtile.localhost/...)
// to the sidecar's /__scheme/<name>/... HTTP routes — so the app's schemeBase()
// output works unchanged, including <img> tile loads that bypass fetch().
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
	let u;
	try {
		u = new URL(e.request.url);
	} catch {
		return;
	}
	if (!u.hostname.endsWith(".localhost")) return;
	const scheme = u.hostname.slice(0, -".localhost".length);
	const target = self.location.origin + "/__scheme/" + scheme + u.pathname + u.search;
	e.respondWith(
		(async () => {
			const init = { method: e.request.method, headers: e.request.headers };
			if (e.request.method !== "GET" && e.request.method !== "HEAD") {
				init.body = await e.request.arrayBuffer();
			}
			return fetch(target, init);
		})(),
	);
});
