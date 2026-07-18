import { isOfficialPano } from "@/lib/sv/panoId";
import { fetchSvMetadata } from "@/lib/sv/svMeta";
import { findPanoProvider, type PanoCameraBadge } from "@/lib/sv/panoProvider";
import { getLocationProvider } from "@/lib/sv/providers/types";
import { BAIDU_CAMERA_BADGE, baiduSpawnPanoId } from "@/lib/sv/baidu/session";
import { isBaiduPanoId } from "@/lib/sv/baidu/prefix";
import { PanoType } from "@/types";
import { useAsync } from "@/lib/hooks/useAsync";
import { useActiveLocation } from "@/store/useMapStore";
import { usePanoViewer } from "./PanoViewerContext";

/** Google SV camera generations (+ unofficial). Provider badges are separate. */
export type BuiltinCameraType = CameraType | "unofficial";

export type DisplayCameraBadge =
	| { source: "builtin"; type: BuiltinCameraType }
	| { source: "provider"; badge: PanoCameraBadge };

export function useCameraType(panoId: string | null): DisplayCameraBadge | null {
	const active = useActiveLocation();
	const { panoDates, dateState } = usePanoViewer();
	const provider = active ? findPanoProvider(active) : null;
	const isBaidu =
		(active != null && getLocationProvider(active) === "baidu") || isBaiduPanoId(panoId);
	const providerId = isBaidu ? "baidu" : (provider?.id ?? "");
	const spawnId = active
		? isBaidu
			? baiduSpawnPanoId(active)
			: provider?.getSpawnPanoId
				? provider.getSpawnPanoId(active)
				: null
		: null;

	const fromDates =
		panoId != null
			? panoDates.find((d) => d.pano === panoId)?.cameraType ??
				(dateState.defaultEntry?.pano === panoId
					? dateState.defaultEntry.cameraType
					: undefined)
			: undefined;

	return useAsync<DisplayCameraBadge | null>(() => {
		if (!panoId || !active) return null;

		if (isBaidu) return { source: "provider", badge: BAIDU_CAMERA_BADGE };

		if (provider?.resolveCameraBadge) {
			const badge = provider.resolveCameraBadge(panoId, active, fromDates);
			if (badge) return { source: "provider", badge };
			// Provider owns the location but has no badge for this pano — don't fetch Google.
			if (provider.canHandle(active)) return null;
		}

		if (!isOfficialPano(panoId)) return { source: "builtin", type: "unofficial" };
		return fetchSvMetadata([panoId]).then(([data]) => {
			if (!data || !data.extra) return null;
			if (data.extra.panoType !== PanoType.Official) {
				return { source: "builtin", type: "unofficial" };
			}
			const t = data.extra.cameraType;
			return t ? { source: "builtin", type: t } : null;
		});
	}, [panoId, providerId, spawnId, fromDates, active?.id, isBaidu]).data;
}
