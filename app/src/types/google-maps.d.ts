// Augment @types/google.maps with undocumented fields that opensv (patched Google Maps v3.63) exposes.

/** Shorthand for the full `typeof google` namespace provided by opensv. */
type Google = typeof google;

/** Undocumented metadata opensv attaches to StreetViewPanoramaData. */
interface SvExtra {
	altitude: number;
	panoType: import("@/types").PanoType;
	/** Null when the tile height matches no known generation. */
	cameraType: import("@/bindings.gen").CameraType | null;
	countryCode: string | null;
	uploaderName: string | null;
	/** Capture-time driving direction in degrees (0–360), per Google. */
	drivingDirection: number | null;
	/** Indoor level ID; non-null indicates a tripod/indoor pano. */
	_levelId: number | null;
	/** Capture source: "launch" = car, "scout" = trekker/alleycat. */
	_source: string | null;
}

declare namespace google.maps {
	interface StreetViewPanoramaData {
		/** Historical pano list at this location (undocumented, provided by opensv). */
		time?: { pano: string; date?: Date }[];
		/** Extended metadata (undocumented, provided by opensv). */
		extra?: SvExtra;
	}

	interface StreetViewTileData {
		originHeading?: number;
		originPitch?: number;
		originPitchYaw?: number;
	}

	/**
	 * StreetViewPanoramaData narrowed to guarantee `location` and `location.latLng` are present.
	 * Returned by `fetchPanoData` after validation; avoids null checks at every call site.
	 */
	type StreetViewResolvedPanoramaData = StreetViewPanoramaData & {
		location: StreetViewLocation & { latLng: LatLng };
		links: StreetViewLink[];
	};
}

interface TileCoord {
	x: number;
	y: number;
}
