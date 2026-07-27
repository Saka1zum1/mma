import { forwardRef } from "react";
import { ContextMenu } from "@base-ui-components/react/context-menu";
import {
	useIsMeasuring,
	startMeasure,
	endMeasure,
	getLatLngAnchor,
	setLatLngAnchor,
} from "@/lib/sv/measure";
import { useEventValue } from "@/lib/events";
import { getContextMenuTarget } from "@/lib/map/contextMenu";
import { selectBorderAt } from "@/lib/map/useCountrySelect";
import { polygonsAt, deletePolygonsAt } from "@/lib/map/useDeletePolygon";
import { getMapState, duplicateLocation, removeLocations } from "@/store/useMapStore";
import { openDialog } from "@/store/dialogBus";
import { mapsPanoUrl, fovForZoom, appendLinkTags, shortenMapsUrl } from "@/lib/sv/mapsLink";
import { downloadPano } from "@/lib/sv/panoDownload";
import { toast } from "@/lib/util/toast";
import { log } from "@/lib/util/log";
import { useT, t as translate } from "@/lib/i18n";
import type { Location } from "@/bindings.gen";

/** Copy a google.com/maps link aimed at the location's saved camera. Shortened when the
 *  service answers, long URL otherwise -- both open the same view. */
async function copyLocationLink(loc: Location) {
	const url = mapsPanoUrl({
		lat: loc.lat,
		lng: loc.lng,
		heading: loc.heading,
		pitch: loc.pitch,
		fov: fovForZoom(loc.zoom),
		panoId: loc.panoId ?? "",
	});
	appendLinkTags(url, loc, getMapState().tags);
	const long = url.toString();
	try {
		await navigator.clipboard.writeText(await shortenMapsUrl(long));
	} catch {
		await navigator.clipboard.writeText(long).catch(() => {});
	}
	toast(translate("toast.linkCopied"), 1500);
}

export const MapContextMenuContent = forwardRef<HTMLDivElement>((_props, ref) => {
	const { t, tp } = useT();
	const isMeasuring = useIsMeasuring();
	const anchor = useEventValue("anchor:changed", getLatLngAnchor);
	// Read during render: the popup unmounts on close, so this is the click just handled.
	const { location, latLng } = getContextMenuTarget();
	const polygonCount = polygonsAt(latLng.lat, latLng.lng).length;

	return (
		<ContextMenu.Positioner>
			<ContextMenu.Popup className="context-menu" ref={ref}>
				{location && (
					<>
						<ContextMenu.Item
							className="context-menu__item"
							onClick={() => void copyLocationLink(location)}
						>
							{t("context.copyStreetViewLink")}
						</ContextMenu.Item>
						<ContextMenu.Item
							className="context-menu__item"
							disabled={!location.panoId}
							onClick={() => navigator.clipboard.writeText(location.panoId ?? "")}
						>
							{t("context.copyPanoId")}
						</ContextMenu.Item>
						<ContextMenu.Item
							className="context-menu__item"
							disabled={!location.panoId}
							onClick={() => {
								if (location.panoId)
									downloadPano(location.panoId).catch((e) => log.error("[download] failed:", e));
							}}
						>
							{t("context.downloadPanorama")}
						</ContextMenu.Item>
						<ContextMenu.Item
							className="context-menu__item"
							onClick={() => openDialog("quick-copy-to-map", location.id)}
						>
							{t("context.copyToMap")}
						</ContextMenu.Item>
						<ContextMenu.Item
							className="context-menu__item"
							onClick={() => void duplicateLocation(location.id)}
						>
							{t("context.duplicateLocation")}
						</ContextMenu.Item>
						<ContextMenu.Item
							className="context-menu__item"
							onClick={() => void removeLocations(new Set([location.id]))}
						>
							{t("context.deleteLocation")}
						</ContextMenu.Item>
						<div className="context-menu__separator" />
					</>
				)}
				{isMeasuring ? (
					<ContextMenu.Item className="context-menu__item" onClick={endMeasure}>
						{t("context.endMeasurement")}
					</ContextMenu.Item>
				) : (
					<ContextMenu.Item className="context-menu__item" onClick={() => startMeasure(latLng)}>
						{t("context.startMeasurement")}
					</ContextMenu.Item>
				)}
				<ContextMenu.Item
					className="context-menu__item"
					onClick={() =>
						navigator.clipboard.writeText(`${latLng.lat.toFixed(6)}, ${latLng.lng.toFixed(6)}`)
					}
				>
					{t("context.copyCoordinates")}
				</ContextMenu.Item>
				<ContextMenu.Item
					className="context-menu__item"
					onClick={() => void selectBorderAt(latLng.lat, latLng.lng, false)}
				>
					{t("context.selectThisCountry")}
				</ContextMenu.Item>
				<ContextMenu.Item
					className="context-menu__item"
					onClick={() => void selectBorderAt(latLng.lat, latLng.lng, true)}
				>
					{t("context.selectThisSubdivision")}
				</ContextMenu.Item>
				<ContextMenu.Item
					className="context-menu__item"
					disabled={polygonCount === 0}
					onClick={() => deletePolygonsAt(latLng.lat, latLng.lng)}
				>
					{polygonCount > 1
						? tp("context.deleteNPolygons", polygonCount, { count: polygonCount })
						: t("context.deleteThisPolygon")}
				</ContextMenu.Item>
				<ContextMenu.Item className="context-menu__item" onClick={() => setLatLngAnchor(latLng)}>
					{t("context.setAnchors")}
				</ContextMenu.Item>
				<ContextMenu.Item
					className="context-menu__item"
					disabled={!anchor}
					onClick={() => setLatLngAnchor(null)}
				>
					{t("context.clearAnchors")}
				</ContextMenu.Item>
			</ContextMenu.Popup>
		</ContextMenu.Positioner>
	);
});
