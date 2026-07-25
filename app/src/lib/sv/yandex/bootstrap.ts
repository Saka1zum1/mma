/**
 * Bootstrap Yandex Street View as a first-class PSV provider (like Look Around):
 * pano provider, enrichment, coverage — no opensv inject bridge.
 */
import { initYandexCoverage } from "@/lib/sv/yandex/coverage";
import { registerYandexEnrichment } from "@/lib/sv/yandex/enrich";
import { registerYandexPanoProvider } from "@/lib/sv/yandex/panoProvider";

let started = false;
let teardown: (() => void) | null = null;

export function startYandexProvider(): () => void {
	if (started) return () => {};
	started = true;

	registerYandexEnrichment();
	const unbindPano = registerYandexPanoProvider();
	const unbindCoverage = initYandexCoverage();

	teardown = () => {
		unbindCoverage();
		unbindPano();
		started = false;
		teardown = null;
	};

	return teardown;
}

export function stopYandexProvider(): void {
	teardown?.();
}
