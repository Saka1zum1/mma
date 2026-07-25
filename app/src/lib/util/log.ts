import {
	info as tauriInfo,
	warn as tauriWarn,
	error as tauriError,
	debug as tauriDebug,
	trace as tauriTrace,
} from "@tauri-apps/plugin-log";

function fmt(msg: string, ...args: unknown[]): string {
	if (args.length === 0) return msg;
	return (
		msg +
		" " +
		args
			.map((a) => {
				if (a instanceof Error) return `${a.message}\n${a.stack}`;
				if (typeof a === "object")
					try {
						return JSON.stringify(a);
					} catch {
						return String(a);
					}
				return String(a);
			})
			.join(" ")
	);
}

const DEV = import.meta.env.DEV;

/* eslint-disable no-console */
export const log = {
	info: (msg: string, ...args: unknown[]) => {
		if (DEV) console.info(msg, ...args);
		tauriInfo(fmt(msg, ...args));
	},
	warn: (msg: string, ...args: unknown[]) => {
		if (DEV) console.warn(msg, ...args);
		tauriWarn(fmt(msg, ...args));
	},
	error: (msg: string, ...args: unknown[]) => {
		if (DEV) console.error(msg, ...args);
		tauriError(fmt(msg, ...args));
	},
	debug: (msg: string, ...args: unknown[]) => {
		if (DEV) console.debug(msg, ...args);
		tauriDebug(fmt(msg, ...args));
	},
	trace: (msg: string, ...args: unknown[]) => {
		if (DEV) console.debug(msg, ...args);
		tauriTrace(fmt(msg, ...args));
	},
};
/* eslint-enable no-console */

/** Run a promise fire-and-forget, logging any rejection under `label` */
export function fireAndForget(p: Promise<unknown>, label: string): void {
	p.catch((e) => log.error(`[${label}] failed:`, e));
}

export async function initLogging() {
	window.addEventListener("error", (e) => {
		log.error("[uncaught]", e.error ?? e.message);
	});

	window.addEventListener("unhandledrejection", (e) => {
		// PSV / fetch cancellation on viewer teardown surfaces as AbortError.
		const reason = e.reason;
		const name =
			reason && typeof reason === "object" && "name" in reason
				? String((reason as { name: unknown }).name)
				: "";
		const message =
			reason instanceof Error
				? reason.message
				: typeof reason === "string"
					? reason
					: "";
		if (name === "AbortError" || /signal is aborted/i.test(message)) return;
		log.error("[unhandled rejection]", e.reason);
	});

	log.info("Frontend logging initialized");
}
