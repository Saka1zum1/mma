export interface SyncStore {
	subscribe: (fn: () => void) => () => void;
	getSnapshot: () => number;
	notify: () => void;
}

export function createSyncStore(): SyncStore {
	let listeners: (() => void)[] = [];
	let version = 0;
	return {
		subscribe(fn: () => void) {
			listeners.push(fn);
			return () => {
				listeners = listeners.filter((l) => l !== fn);
			};
		},
		getSnapshot: () => version,
		notify() {
			version++;
			for (const fn of listeners) fn();
		},
	};
}
