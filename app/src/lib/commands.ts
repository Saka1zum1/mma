import { commands } from "@/bindings.gen";
import { mmaBufUrl } from "@/lib/util/util";

type ExtractOk<T> = [T] extends [{ status: "ok"; data: infer D } | { status: "error"; error: unknown }] ? D : T;

type Unwrapped = {
	[K in keyof typeof commands]: (...args: Parameters<(typeof commands)[K]>) =>
		Promise<ExtractOk<Awaited<ReturnType<(typeof commands)[K]>>>>;
};

function unwrap(result: unknown) {
	if (result && typeof result === "object" && "status" in result) {
		const r = result as { status: string; data?: unknown; error?: unknown };
		if (r.status === "error") throw r.error;
		return r.data;
	}
	return result;
}

export const cmd = new Proxy(commands, {
	get(target, prop) {
		const fn = target[prop as keyof typeof commands];
		if (typeof fn !== "function") return fn;
		return (...args: unknown[]) => (fn as (...a: unknown[]) => Promise<unknown>)(...args).then(unwrap);
	},
}) as unknown as Unwrapped;

export async function fetchViaFile<T>(pathPromise: Promise<string | null>): Promise<T | null> {
	const path = await pathPromise;
	if (!path) return null;
	const resp = await fetch(mmaBufUrl(path));
	return resp.json();
}
