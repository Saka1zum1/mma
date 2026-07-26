import type { MessageParams } from "./types";

/** Replace `{name}` placeholders. Missing params leave the brace intact. */
export function interpolate(template: string, params?: MessageParams): string {
	if (!params) return template;
	return template.replace(/\{(\w+)\}/g, (match, key: string) => {
		const value = params[key];
		return value === undefined || value === null ? match : String(value);
	});
}
