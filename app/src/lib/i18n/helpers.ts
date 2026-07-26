import type { MessageKey } from "@/locales/en";
import { t } from "./index";

/** Map enum/option keys to localized labels via a lookup function. */
export function localizeOptions<K extends string>(
	source: Record<K, string>,
	labelFor: (key: K) => string,
): Record<K, string> {
	const out = {} as Record<K, string>;
	for (const key of Object.keys(source) as K[]) {
		out[key] = labelFor(key);
	}
	return out;
}

/** Build localized labels for enum keys under a message-key prefix, e.g. `settings.movement.moving`. */
export function localizeEnum<K extends string>(
	prefix: MessageKey,
	keys: readonly K[],
): Record<K, string> {
	return localizeOptions(
		Object.fromEntries(keys.map((k) => [k, k])) as unknown as Record<K, string>,
		(key) => t(`${prefix}.${key}` as MessageKey),
	);
}
