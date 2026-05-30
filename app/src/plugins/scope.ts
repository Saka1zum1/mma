/**
 * Plugin registration scope — generalized ownership + teardown.
 *
 * The registry runs each `plugin.activate()` inside `runAsPlugin(id, ...)`, which
 * sets the current owner. Any host registration made during that window calls
 * `trackDisposable(undo)` to enroll its teardown under that owner. `disposePlugin(id)`
 * then reverses every registration uniformly — so deactivating a plugin reclaims
 * everything it registered, without per-surface bookkeeping.
 *
 * Caveat: ownership is captured synchronously. Registrations made after an `await`
 * or in a later callback (outside the activate window) are not attributed.
 */
import { log } from "@/lib/util/log";

type Disposable = () => void;

let currentOwner: string | null = null;
const stores = new Map<string, Disposable[]>();

/** Run `fn` attributed to plugin `id`; host registrations during it are tracked for teardown. */
export function runAsPlugin<T>(id: string, fn: () => T): T {
	const prev = currentOwner;
	currentOwner = id;
	try {
		return fn();
	} finally {
		currentOwner = prev;
	}
}

/** Enroll a teardown callback under the currently-activating plugin. No-op outside activation. */
export function trackDisposable(dispose: Disposable): void {
	if (!currentOwner) return;
	let store = stores.get(currentOwner);
	if (!store) {
		store = [];
		stores.set(currentOwner, store);
	}
	store.push(dispose);
}

/** Run and clear every teardown a plugin registered, in reverse order. */
export function disposePlugin(id: string): void {
	const store = stores.get(id);
	if (!store) return;
	stores.delete(id);
	for (let i = store.length - 1; i >= 0; i--) {
		try {
			store[i]();
		} catch (e) {
			log.error(`[plugin] teardown failed for "${id}":`, e);
		}
	}
}
