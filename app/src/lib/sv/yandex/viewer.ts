import type { YandexPanoMeta } from "./api";
import { createYandexViewer, type YandexViewerHandle } from "./psv/createYandexViewer";

function ensurePsvCssVars(container: HTMLElement): void {
	container.style.setProperty("--psv-core-loaded", "true");
	container.style.setProperty("--psv-markers-plugin-loaded", "true");
}

export type { YandexViewerHandle };

export async function openYandexPano(
	container: HTMLElement,
	meta: YandexPanoMeta,
): Promise<YandexViewerHandle> {
	ensurePsvCssVars(container);
	return createYandexViewer(container, meta);
}
