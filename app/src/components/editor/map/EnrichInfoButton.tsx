import { useState } from "react";
import { Icon } from "@/components/primitives/Icon";
import { mdiInformationOutline } from "@mdi/js";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";

export function EnrichInfoButton() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button
				className="icon-button icon-button--inline"
				onClick={(e) => {
					e.preventDefault();
					setOpen(true);
				}}
				title="What is metadata enrichment?"
				style={{ marginLeft: "0.4rem" }}
			>
				<Icon path={mdiInformationOutline} size={18} />
			</button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent title="Metadata Enrichment">
					<p style={{ margin: "0 0 0.5rem" }}>
						When enabled, opening a location will automatically fetch additional metadata from
						Google Street View and persist it to the location (per preference):
					</p>
					<ul style={{ margin: "0 0 0.5rem", paddingLeft: "1.25rem", fontSize: "0.9rem" }}>
						<li>Altitude</li>
						<li>Country code</li>
						<li>Camera type (Gen1, Gen2, etc.)</li>
						<li>Panorama type (official, unofficial)</li>
						<li>Image capture date</li>
						<li>Exact capture timestamp</li>
					</ul>
					<p style={{ margin: 0, fontSize: "0.85rem", color: "#666" }}>
						Metadata is always fetched for display. This setting controls whether it gets saved to
						the location. Disable if you want to browse without modifying location data.
					</p>
				</DialogContent>
			</Dialog>
		</>
	);
}
