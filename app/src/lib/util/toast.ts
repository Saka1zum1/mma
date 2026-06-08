import { createSyncStore } from "@/lib/util/syncStore";

interface ToastEntry {
	id: number;
	message: string;
}

let toasts: ToastEntry[] = [];
let nextId = 0;
const { subscribe: subscribeToasts, notify } = createSyncStore();
export { subscribeToasts };

export function toast(message: string, duration = 2500) {
	const id = nextId++;
	toasts = [...toasts, { id, message }];
	notify();
	setTimeout(() => {
		toasts = toasts.filter((t) => t.id !== id);
		notify();
	}, duration);
}

export function getToasts() {
	return toasts;
}
