/**
 * Street View mock, installed from the test side by monkey-patching the runtime
 * boundaries the app uses -- NO app code is touched. Enabled via the wdio `beforeSuite`
 * hook when MMA_TEST_MOCK_SV is set (scripts/e2e.sh --mock).
 *
 *  - window.fetch: the app fetches Google's internal RPCs directly for GetMetadata
 *    (fetchSvMetadata) and SingleImageSearch (resolveExactTimestamp). We return
 *    hand-built protobuf-array responses shaped exactly as parseResult expects.
 *  - google.maps.StreetViewService.getPanorama: fetchPanoData / getPanoAtCoords go
 *    through this (opensv sets window.google). We return canned pano data.
 *  - google.maps.StreetViewPanorama (the viewer): its `status_changed` event drives
 *    seen-recording. Real tiles never load offline, so we override getStatus/getPano/
 *    getPosition and fire the event after setPano.
 *
 * The function below is serialized and run in the webview via browser.execute, so it
 * must be entirely self-contained (no imports, no outer references).
 */
export function installSvMock(): void {
	type ViewerInst = { __mp?: string; __mpos?: { lat: number; lng: number } | null };
	type ProtoBag = Record<string, unknown> & { __mmaMocked?: boolean };
	interface GoogleLike {
		maps?: {
			StreetViewService?: { prototype: ProtoBag };
			StreetViewPanorama?: { prototype: ProtoBag };
			event?: { trigger: (target: unknown, name: string) => void };
		};
	}
	const w = window as unknown as {
		fetch: typeof fetch;
		google?: GoogleLike;
		__mmaSvMocked?: boolean;
	};
	if (w.__mmaSvMocked) return;
	w.__mmaSvMocked = true;

	interface Fix {
		lat: number;
		lng: number;
		cc: string;
		alt: number;
		dates: string[];
	}
	const FIX: Record<string, Fix> = {
		"-zrYsLR4Fh-cfJG_EMZ1-A": {
			lat: 52.10947502806108,
			lng: 34.90131410856584,
			cc: "RU",
			alt: 142,
			dates: ["2012-08", "2015-06", "2021-09"],
		},
		CAoSF0NJSE0wb2dLRUlDQWdJQ3FpZG1xM3dF: {
			lat: 64.44241333767505,
			lng: 46.193924009405855,
			cc: "RU",
			alt: 90,
			dates: ["2019-07"],
		},
		"5upMz1_zTGPdkIXG6_QM3g": {
			lat: 55.510656,
			lng: 157.636627,
			cc: "RU",
			alt: 30,
			dates: ["2018-05"],
		},
	};
	const isDead = (p: string) => !p || /DEAD|DOES_NOT_EXIST/i.test(p);
	const fixFor = (pano: string, lat = 0, lng = 0): Fix | null => {
		if (isDead(pano)) return null;
		if (FIX[pano]) return FIX[pano];
		// Coords are encoded in synthetic ids (MOCK_lat_lng) so a pano fetched by id
		// resolves to the same position it did when found by coordinate.
		const m = /^MOCK_(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)$/.exec(pano);
		const [la, ln] = m ? [+m[1], +m[2]] : [lat, lng];
		return { lat: la, lng: ln, cc: "US", alt: 100, dates: ["2020-06", "2022-06"] };
	};
	const panoAtCoords = (lat: number, lng: number): string | null => {
		if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return null; // ocean
		for (const [p, f] of Object.entries(FIX)) {
			if (Math.abs(f.lat - lat) < 0.01 && Math.abs(f.lng - lng) < 0.01) return p;
		}
		return `MOCK_${lat.toFixed(4)}_${lng.toFixed(4)}`;
	};
	const ymDate = (ym: string): Date => {
		const [y, m] = ym.split("-").map(Number);
		return new Date(y, (m ?? 1) - 1, 1);
	};

	// --- window.fetch -------------------------------------------------------
	const origFetch = w.fetch.bind(w);

	// Minimal protobuf wire-format writer: fetchSvMetadata requests alt=proto and parses
	// the binary response with the generated getmetadata schema reader.
	const varint = (n: number): number[] => {
		const o = [];
		while (n > 127) {
			o.push((n & 127) | 128);
			n >>>= 7;
		}
		o.push(n);
		return o;
	};
	const fVar = (field: number, v: number): number[] => [...varint(field << 3), ...varint(v)];
	const fMsg = (field: number, payload: number[]): number[] => [
		...varint((field << 3) | 2),
		...varint(payload.length),
		...payload,
	];
	const fStr = (field: number, s: string): number[] =>
		fMsg(field, [...new TextEncoder().encode(s)]);
	const fDbl = (field: number, v: number): number[] => {
		const b = new Uint8Array(8);
		new DataView(b.buffer).setFloat64(0, v, true);
		return [...varint((field << 3) | 1), ...b];
	};
	const fFlt = (field: number, v: number): number[] => {
		const b = new Uint8Array(4);
		new DataView(b.buffer).setFloat32(0, v, true);
		return [...varint((field << 3) | 5), ...b];
	};

	// One GetMetadata ImageMetadata message, matching the schema parseResult reads.
	// imageKey is echoed into pano (f2) so imageKeyToPanoId round-trips to the original id.
	const metaResult = (imageKey: [number, string] | undefined): number[] => {
		const pano = imageKey && imageKey[1] ? imageKey[1] : "";
		const f = fixFor(pano);
		if (!f) return fMsg(1, fVar(1, 3)); // status != 1 -> parseResult yields null
		const [y, m] = f.dates[f.dates.length - 1].split("-").map(Number);
		const locData = [
			...fMsg(1, [...fDbl(3, f.lat), ...fDbl(4, f.lng)]),
			...fMsg(2, fFlt(1, f.alt)),
			...fMsg(3, fFlt(1, 0)),
			...fStr(5, f.cc),
		];
		const tiles = [
			...fMsg(3, [...fVar(1, 8192), ...fVar(2, 16384)]), // worldH 8192 -> gen4
			...fMsg(4, fMsg(2, [...fVar(1, 512), ...fVar(2, 512)])),
		];
		return [
			...fMsg(1, fVar(1, 1)),
			...fMsg(2, [...fVar(1, imageKey?.[0] ?? 2), ...fStr(2, pano)]),
			...fMsg(3, tiles),
			...fMsg(6, fMsg(2, locData)),
			...fMsg(7, fMsg(8, [...fVar(1, y), ...fVar(2, m), ...fVar(3, 1)])),
		];
	};

	// Decode the binary GetMetadataRequest just enough to pull the requested image keys
	// (field 3 = KeyWrapper { 1: ImageKey { 1: type, 2: id } }).
	const readVarint = (b: Uint8Array, p: { i: number }): number => {
		let v = 0;
		let s = 0;
		for (;;) {
			const x = b[p.i++];
			v |= (x & 127) << s;
			if (x < 128) return v >>> 0;
			s += 7;
		}
	};
	const skipField = (b: Uint8Array, p: { i: number }, wire: number): void => {
		if (wire === 0) readVarint(b, p);
		else if (wire === 1) p.i += 8;
		else if (wire === 5) p.i += 4;
		else {
			const len = readVarint(b, p); // read first: it advances p.i
			p.i += len;
		}
	};
	const requestKeys = (body: unknown): [number, string][] => {
		const b =
			body instanceof Uint8Array
				? body
				: new Uint8Array(body instanceof ArrayBuffer ? body : new ArrayBuffer(0));
		const keys: [number, string][] = [];
		const p = { i: 0 };
		while (p.i < b.length) {
			const tag = readVarint(b, p);
			if (tag >> 3 !== 3 || (tag & 7) !== 2) {
				skipField(b, p, tag & 7);
				continue;
			}
			const wrapLen = readVarint(b, p);
			const wrapEnd = p.i + wrapLen;
			let type = 2;
			let id = "";
			while (p.i < wrapEnd) {
				const t2 = readVarint(b, p);
				if (t2 >> 3 === 1 && (t2 & 7) === 2) {
					const keyLen = readVarint(b, p);
					const keyEnd = p.i + keyLen;
					while (p.i < keyEnd) {
						const t3 = readVarint(b, p);
						if (t3 >> 3 === 1 && (t3 & 7) === 0) type = readVarint(b, p);
						else if (t3 >> 3 === 2 && (t3 & 7) === 2) {
							const len = readVarint(b, p);
							id = new TextDecoder().decode(b.slice(p.i, p.i + len));
							p.i += len;
						} else skipField(b, p, t3 & 7);
					}
				} else skipField(b, p, t2 & 7);
			}
			keys.push([type, id]);
			p.i = wrapEnd;
		}
		return keys;
	};

	w.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
		const url =
			typeof input === "string" ? input : input instanceof URL ? input.href : (input?.url ?? "");
		if (url.includes("GetMetadata")) {
			const results = requestKeys(init?.body).flatMap((k) => fMsg(2, metaResult(k)));
			const envelope = new Uint8Array([...fMsg(1, fVar(1, 0)), ...results]);
			return new Response(envelope, { status: 200 });
		}
		if (url.includes("SingleImageSearch")) {
			// Any non-"no images" body counts as "image found", so resolveExactTimestamp's
			// binary search always narrows downward and converges to a valid timestamp.
			return new Response(JSON.stringify([["img"]]), { status: 200 });
		}
		return origFetch(input, init);
	} as typeof fetch;

	// --- google.maps.StreetViewService.getPanorama --------------------------
	const viewerData = (pano: string, f: Fix): Record<string, unknown> => {
		const last = f.dates.length - 1;
		return {
			copyright: "",
			location: {
				latLng: { lat: () => f.lat, lng: () => f.lng },
				pano,
				shortDescription: "",
				description: "",
			},
			imageDate: f.dates[last],
			time: f.dates.map((d, i) => ({ pano: i === last ? pano : `${pano}~${i}`, AA: ymDate(d) })),
			links: [],
			tiles: {
				worldSize: { width: 16384, height: 8192 },
				tileSize: { width: 512, height: 512 },
				centerHeading: 0,
				originHeading: 0,
			},
		};
	};
	type PanoRequest = {
		pano?: string;
		location?: { lat: number | (() => number); lng: number | (() => number) };
	};
	const mockGetPanorama = async (req?: PanoRequest): Promise<{ data: Record<string, unknown> }> => {
		let pano: string | null = null;
		let rlat = 0;
		let rlng = 0;
		if (req?.pano) pano = req.pano;
		else if (req?.location) {
			const ll = req.location;
			rlat = typeof ll.lat === "function" ? ll.lat() : ll.lat;
			rlng = typeof ll.lng === "function" ? ll.lng() : ll.lng;
			pano = panoAtCoords(rlat, rlng);
		}
		const f = pano ? fixFor(pano, rlat, rlng) : null;
		if (!pano || !f) return { data: {} }; // no location -> app treats as null
		return { data: viewerData(pano, f) };
	};

	// --- google.maps.StreetViewPanorama (the viewer) ------------------------
	// Drives seen-recording via status_changed. Keep the real setPano (so getPov/getZoom
	// internals stay live) and only override status/pano/position + fire the event.
	const patchViewer = (g?: GoogleLike): void => {
		const proto = g?.maps?.StreetViewPanorama?.prototype;
		if (!proto || proto.__mmaMocked) return;
		const origSetPano = proto.setPano as ((this: unknown, p: string) => void) | undefined;
		proto.setPano = function (this: ViewerInst, p: string) {
			this.__mp = p;
			const f = p && !isDead(p) ? fixFor(p) : null;
			this.__mpos = f ? { lat: f.lat, lng: f.lng } : null;
			try {
				if (origSetPano) origSetPano.call(this, p);
			} catch {
				/* ignore */
			}
			setTimeout(() => {
				try {
					g?.maps?.event?.trigger(this, "pano_changed");
					g?.maps?.event?.trigger(this, "status_changed");
				} catch {
					/* ignore */
				}
			}, 0);
		};
		proto.getStatus = function (this: ViewerInst) {
			return this.__mp && !isDead(this.__mp) ? "OK" : "ZERO_RESULTS";
		};
		proto.getPano = function (this: ViewerInst) {
			return this.__mp || "";
		};
		proto.getPosition = function (this: ViewerInst) {
			const p = this.__mpos;
			return p ? { lat: () => p.lat, lng: () => p.lng } : null;
		};
		proto.__mmaMocked = true;
	};

	const patchSVS = (g?: GoogleLike): boolean => {
		const proto = g?.maps?.StreetViewService?.prototype;
		if (!proto) return false;
		if (!proto.__mmaMocked) {
			proto.getPanorama = mockGetPanorama;
			proto.__mmaMocked = true;
		}
		patchViewer(g);
		return true;
	};

	// opensv builds google.maps lazily and by mutation, so poll for StreetViewService
	// and patch the prototypes the moment it appears -- before the first pano lookup.
	if (!patchSVS(w.google)) {
		const iv = setInterval(() => {
			if (patchSVS((window as unknown as { google?: GoogleLike }).google)) clearInterval(iv);
		}, 10);
		setTimeout(() => clearInterval(iv), 20000);
	}
}
