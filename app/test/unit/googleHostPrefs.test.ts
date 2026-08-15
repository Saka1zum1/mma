// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/sv/opensv", () => {
	class Size {
		constructor(
			public w: number,
			public h: number,
		) {}
	}
	class ImageMapType {
		constructor(public opts: unknown) {}
		getTile(_coord: unknown, _zoom: number, doc: Document) {
			return doc.createElement("div");
		}
	}
	class MapMock {
		stack: { layers: google.maps.ImageMapType[] } | null = null;
		mapTypes = {
			set: (_id: string, stack: { layers: google.maps.ImageMapType[] }) => {
				this.stack = stack;
			},
		};
		private div = document.createElement("div");
		constructor(
			public container: HTMLElement,
			public opts: unknown,
		) {}
		setOptions() {}
		setMapTypeId() {}
		getDiv() {
			return this.div;
		}
		addListener() {
			return {};
		}
	}
	return {
		google: {
			maps: {
				Size,
				ImageMapType,
				Map: MapMock,
				event: { trigger: () => {}, clearInstanceListeners: () => {} },
			},
		},
	};
});

vi.mock("@/lib/geo/stackedMapType", () => ({
	createCompositeMapType: (layers: unknown[]) => ({ layers }),
}));

import { createGoogleMapHost } from "@/lib/map/googleHost";
import { BLOBBY_ZOOM_THRESHOLD } from "@/lib/sv/constants";
import { DEFAULT_PREFS } from "@/store/mapEmbedPrefs";

type Host = ReturnType<typeof createGoogleMapHost>;

const makeHost = (): Host =>
	createGoogleMapHost(document.createElement("div"), DEFAULT_PREFS, { customStyles: [] });

// The roadmap stack is [basemap, SV coverage, labels]; opacity rides each SV tile.
const svOpacity = (host: Host, zoom = 5) => {
	const stack = (host.getHostInstance() as unknown as { stack: { layers: google.maps.ImageMapType[] } })
		.stack;
	return Number((stack.layers[1].getTile(null, zoom, document) as HTMLElement).style.opacity);
};

describe("GoogleMapHost.applyPrefs", () => {
	it("installs a stack carrying the passed svOpacity", () => {
		const host = makeHost();
		expect(svOpacity(host)).toBeCloseTo(DEFAULT_PREFS.svOpacity);
		host.applyPrefs({ ...DEFAULT_PREFS, svOpacity: 0.9 }, { customStyles: [] });
		expect(svOpacity(host)).toBeCloseTo(0.9);
	});

	// The minimap toggles blue lines through applyPrefs alone: no other opacity path exists.
	it("hides the SV layer at zero opacity, and brings it back", () => {
		const host = makeHost();
		host.applyPrefs({ ...DEFAULT_PREFS, svOpacity: 0 }, { customStyles: [] });
		expect(svOpacity(host)).toBe(0);
		host.applyPrefs({ ...DEFAULT_PREFS, svOpacity: 0.5 }, { customStyles: [] });
		expect(svOpacity(host)).toBeCloseTo(0.5);
	});

	it("dims single-coverage blobby tiles only up to the threshold zoom", () => {
		const host = makeHost();
		host.applyPrefs(
			{ ...DEFAULT_PREFS, svBlobby: true, svCoverageType: "official", svOpacity: 0.5 },
			{ customStyles: [] },
		);
		expect(svOpacity(host, BLOBBY_ZOOM_THRESHOLD)).toBeCloseTo(0.3);
		expect(svOpacity(host, BLOBBY_ZOOM_THRESHOLD + 1)).toBeCloseTo(0.5);
	});
});
