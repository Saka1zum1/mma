declare const __APP_VERSION__: string;

/** Running app version, or null when the bundler did not stamp one. */
export function appVersion(): string | null {
	return typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null;
}
