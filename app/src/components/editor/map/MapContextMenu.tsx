import { forwardRef } from "react";
import { ContextMenu } from "@base-ui-components/react/context-menu";
import {
	useMeasureState,
	startMeasure,
	endMeasure,
	getLatLngAnchor,
	setLatLngAnchor,
} from "@/lib/sv/measure";
import { useEventValue } from "@/lib/events";
import { getContextMenuTarget } from "@/lib/map/contextMenu";
import { hostInstance, type MapHost } from "@/lib/map/host";

interface MapContextMenuProps {
	host: MapHost | null;
}

export const MapContextMenuContent = forwardRef<HTMLDivElement, MapContextMenuProps>(
	({ host }, ref) => {
		const { isMeasuring } = useMeasureState();
		const anchor = useEventValue("anchor:changed", getLatLngAnchor);
		// The measure tool is Google-only (measuretool-googlemaps-v3).
		const gMap = hostInstance(host, "google");

		return (
			<ContextMenu.Positioner>
				<ContextMenu.Popup className="context-menu" ref={ref}>
					{isMeasuring ? (
						<ContextMenu.Item className="context-menu__item" onClick={endMeasure}>
							End measurement
						</ContextMenu.Item>
					) : (
						gMap && (
							<ContextMenu.Item
								className="context-menu__item"
								onClick={() => {
									startMeasure(gMap, getContextMenuTarget().latLng);
								}}
							>
								Start measurement
							</ContextMenu.Item>
						)
					)}
					<ContextMenu.Item
						className="context-menu__item"
						onClick={() => {
							const { lat, lng } = getContextMenuTarget().latLng;
							navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
						}}
					>
						Copy coordinates
					</ContextMenu.Item>
					<ContextMenu.Item
						className="context-menu__item"
						onClick={() => setLatLngAnchor(getContextMenuTarget().latLng)}
					>
						Set latitude/longitude anchors
					</ContextMenu.Item>
					<ContextMenu.Item
						className="context-menu__item"
						disabled={!anchor}
						onClick={() => setLatLngAnchor(null)}
					>
						Clear latitude/longitude anchors
					</ContextMenu.Item>
				</ContextMenu.Popup>
			</ContextMenu.Positioner>
		);
	},
);
