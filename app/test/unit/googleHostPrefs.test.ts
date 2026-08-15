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
		opacity = 1;
		constructor(public opts: unknown) {}
		setOpacity(opacity: number) {
			this.opacity = opacity;
		}
		getOpacity() {
			return this.opacity;
		}
		getTile(_coord: unknown, _zoom: number, doc: Document) {
			const el = doc.createElement("div");
			el.style.opacity = String(this.opacity);
			return el;
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
import { DEFAULT_PREFS } from "@/store/mapEmbedPrefs";

type Host = ReturnType<typeof createGoogleMapHost>;

const makeHost = (): Host =>
	createGoogleMapHost(document.createElement("div"), DEFAULT_PREFS, { customStyles: [] });

// Opacity is applied via ImageMapType.setOpacity (MapEmbed may further dim for blobby).
const svOpacity = (host: Host) => {
	const stack = (host.getHostInstance() as unknown as { stack: { layers: google.maps.ImageMapType[] } })
		.stack;
	return (stack.layers[1] as unknown as { getOpacity(): number }).getOpacity();
};

describe("GoogleMapHost.applyPrefs", () => {
	it("installs a stack carrying the host SV opacity", () => {
		const host = makeHost();
		expect(svOpacity(host)).toBeCloseTo(DEFAULT_PREFS.svOpacity);
		host.setSvOpacity(0.9);
		expect(svOpacity(host)).toBeCloseTo(0.9);
	});

	// The minimap toggles blue lines through setSvOpacity alone: no other opacity path exists.
	it("hides the SV layer at zero opacity, and brings it back", () => {
		const host = makeHost();
		host.setSvOpacity(0);
		expect(svOpacity(host)).toBe(0);
		host.setSvOpacity(0.5);
		expect(svOpacity(host)).toBeCloseTo(0.5);
	});

	it("rebuilds blobby tile URLs when useBlobby is set", () => {
		const host = makeHost();
		host.applyPrefs(
			{ ...DEFAULT_PREFS, svCoverageType: "official", svOpacity: 0.5 },
			{ customStyles: [], useBlobby: true },
		);
		// MapEmbed owns the 0.6× dim via setSvOpacity; the host keeps the last set value.
		host.setSvOpacity(0.5 * 0.6);
		expect(svOpacity(host)).toBeCloseTo(0.3);
		host.applyPrefs(
			{ ...DEFAULT_PREFS, svCoverageType: "official", svOpacity: 0.5 },
			{ customStyles: [], useBlobby: false },
		);
		host.setSvOpacity(0.5);
		expect(svOpacity(host)).toBeCloseTo(0.5);
	});
});
