import { emit as emitEvent } from "@/lib/events";

interface ToastEntry {
	id: number;
	message: string;
	progress?: { fraction: number; label?: string };
}

let toasts: ToastEntry[] = [];
let nextId = 0;

export function toast(message: string, duration = 2500, container?: HTMLElement) {
	if (container) {
		const el = document.createElement("div");
		el.textContent = message;
		el.style.cssText =
			"position:absolute;bottom:2rem;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:.5rem 1rem;border-radius:4px;font-size:.875rem;z-index:100;pointer-events:none;user-select:none;white-space:nowrap";
		container.appendChild(el);
		setTimeout(() => el.remove(), duration);
		return;
	}
	const id = nextId++;
	toasts = [...toasts, { id, message }];
	emitEvent("toasts:changed");
	setTimeout(() => {
		toasts = toasts.filter((t) => t.id !== id);
		emitEvent("toasts:changed");
	}, duration);
}

export interface ProgressHandle {
	update(fraction: number, label?: string): void;
	finish(message?: string, duration?: number): void;
}

export function progressToast(message: string): ProgressHandle {
	const id = nextId++;
	toasts = [...toasts, { id, message, progress: { fraction: 0 } }];
	emitEvent("toasts:changed");
	return {
		update(fraction: number, label?: string) {
			toasts = toasts.map((t) => (t.id === id ? { ...t, progress: { fraction, label } } : t));
			emitEvent("toasts:changed");
		},
		finish(message?: string, duration = 2500) {
			if (message) {
				toasts = toasts.map((t) => (t.id === id ? { ...t, message, progress: undefined } : t));
				emitEvent("toasts:changed");
				setTimeout(() => {
					toasts = toasts.filter((t) => t.id !== id);
					emitEvent("toasts:changed");
				}, duration);
			} else {
				toasts = toasts.filter((t) => t.id !== id);
				emitEvent("toasts:changed");
			}
		},
	};
}

export function getToasts() {
	return toasts;
}
