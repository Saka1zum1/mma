// Drives the built bundle against a stubbed host. Both RPCs arrive through
// `mma.fetchMany`, so the request URL picks the decoder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchAnswer } from "../../arrayJson.mjs";
import { PbfReader, PbfWriter } from "pbf";
import {
	readGetMetadataRequest,
	writeGetMetadataResponse,
} from "../../../src/lib/proto/getmetadata.gen.js";

const { configure, run } = await import(
	new URL("../../../src-tauri/procedures/validate.js", import.meta.url).href
);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// --- ValidationFlag (app/src/types/index.ts) ---

const NONE = 0;
const NEWER = 1;
const OFF_DEFAULT = 2;
const DEFAULT_STALE = 4;
const PANO_ID_BROKE = 8;
const UNOFFICIAL = 16;
const GOODCAM_AVAILABLE = 32;
const NOT_FOUND = 64;

const found = (flags, pinned) => ({ flags, pinned });

const PINNED = 1;

// --- Fixtures ---

const A = "aaaaaaaaaaaaaaaaaaaaaA";
const B = "bbbbbbbbbbbbbbbbbbbbbQ";
const C = "cccccccccccccccccccccg";
const LONG = "ddddddddddddddddddddddddw";

/** ImageMetadata for `pano`, with per-case overrides. */
function meta(pano, over = {}) {
	const location = {
		location: { lat: over.lat ?? 35.6, lng: over.lng ?? 139.7 },
		altitude: { meters: 12.5 },
		pov: { heading: 123.5 },
		countryCode: over.countryCode ?? "JP",
	};
	if (over.level) location.level = over.level;
	const information = { location, time: [] };
	if (over.timeline) {
		// Each timeline entry names a relation; the image itself is appended by the module.
		information.relations = {
			pano: over.timeline.map((t) => ({ key: { frontend: 2, id: t.pano } })),
		};
		information.time = over.timeline.map((t, i) => ({ target: i, date: t.date }));
	}
	return {
		status: { code: 1 },
		pano: { frontend: 2, id: pano },
		tiles: { worldSize: { height: over.height ?? 8192, width: 16384 } },
		attribution: {
			item: [{ name: { name: over.copyright ?? "© 2021 Google" } }],
			author: [{ name: { text: "Some Uploader" } }],
		},
		information: [information],
		date: {
			sourceInfo: { source: over.source ?? "launch" },
			date: over.date ?? { year: 2021, month: 6, day: 15 },
		},
	};
}

/** A gen2 capture in a country and month the badcam table covers. */
const badcam = (pano, over = {}) =>
	meta(pano, { height: 6656, countryCode: "GB", date: { year: 2021, month: 6, day: 1 }, ...over });

const NO_IMAGES = '[[5,"generic","Search returned no images."]]';

// --- Harness ---

const toRow = (r) => ({
	heading: 0,
	pitch: 0,
	zoom: 0,
	flags: 0,
	createdAt: 0,
	modifiedAt: null,
	panoId: null,
	tags: [],
	extra: null,
	...r,
});

/** Drives `run` over `rows`.
 *  `panos` maps a pano id to its ImageMetadata; a pano that is absent answers as
 *  unknown, and one listed in `failing` makes its whole request non-2xx.
 *  `coords` maps "lat,lng" to the pano the coordinate lookup finds.
 *  `abortAfter` makes `aborted()` true once that many requests have been answered. */
function runProcedure(
	rows,
	{ panos = {}, coords = {}, failing = [], abortAfter = Infinity, config = null } = {},
) {
	const metaCalls = [];
	const coordCalls = [];
	let progress = 0;
	let hostCalls = 0;
	const requests = () => metaCalls.length + coordCalls.length;

	const metadataFor = (keys) => {
		metaCalls.push(keys);
		if (keys.some((k) => failing.includes(k))) return { status: 500, body: new Uint8Array(0) };
		const w = new PbfWriter();
		writeGetMetadataResponse(
			{ status: { code: 0 }, metadata: keys.map((k) => panos[k] ?? { status: { code: 2 } }) },
			w,
		);
		return { status: 200, body: w.finish().slice() };
	};

	const coordLookup = (body) => {
		const m = /\[null,null,(-?[\d.e+-]+),(-?[\d.e+-]+)\],(-?[\d.e+-]+)\]/.exec(body);
		const call = { lat: Number(m[1]), lng: Number(m[2]), radius: Number(m[3]) };
		coordCalls.push(call);
		// A search answers the pano's metadata with it, so the row never asks again.
		const pano = coords[`${call.lat},${call.lng}`];
		const answer = pano ? searchAnswer(panos[pano] ?? meta(pano)) : NO_IMAGES;
		return { status: 200, body: encoder.encode(answer) };
	};

	const respond = (req) => {
		if (req.url.endsWith("/SingleImageSearch")) {
			return coordLookup(typeof req.body === "string" ? req.body : decoder.decode(req.body));
		}
		const decoded = readGetMetadataRequest(new PbfReader(req.body));
		return metadataFor(decoded.key.map((k) => k.key.id));
	};

	globalThis.mma = {
		fetch: respond,
		fetch(reqs) {
			hostCalls++;
			return reqs.map(respond);
		},
		log() {},
		progress(units) {
			progress += units;
		},
		fail() {},
		aborted: () => requests() >= abortAfter,
	};

	configure({ fields: [], force: false, config });
	const answers = run(rows.map(toRow));
	for (const a of answers) {
		assert.equal(typeof a.patch, "object", "an answer is a ValidationAnswer");
		assert.equal(typeof a.patch.flags, "number");
	}
	return { answers, metaCalls, coordCalls, progress, hostCalls };
}

/** One row at (1, 2), with the state of a single answer. */
function stateOf(row, opts) {
	const { answers, ...rest } = runProcedure([{ id: 1, lat: 1, lng: 2, ...row }], opts);
	assert.equal(answers.length, 1);
	assert.equal(answers[0].id, 1);
	return { state: answers[0].patch, ...rest };
}

// --- Coverage ---

test("an unpinned row whose coordinate agrees is ok", () => {
	const { state, progress } = stateOf(
		{ panoId: A },
		{ panos: { [A]: meta(A) }, coords: { "1,2": A } },
	);
	assert.deepEqual(state, found(NONE, false));
	assert.equal(progress, 1);
});

test("a row with no coverage anywhere is not found", () => {
	const { state, coordCalls } = stateOf({ panoId: null }, { coords: {} });
	assert.deepEqual(state, found(NOT_FOUND, false));
	assert.equal(coordCalls.length, 1);
});

test("a stored pano that no longer resolves is not found when the coordinate is empty", () => {
	const { state } = stateOf({ panoId: A }, { panos: {}, coords: {} });
	assert.deepEqual(state, found(NOT_FOUND, false));
});

test("a pinned row whose pano is gone but has coverage reports the broken pano", () => {
	const { state } = stateOf(
		{ panoId: A, flags: PINNED },
		{ panos: { [B]: meta(B) }, coords: { "1,2": B } },
	);
	assert.deepEqual(state, found(PANO_ID_BROKE, true));
});

test("a pinned row with nothing at the coordinate is not found", () => {
	const { state } = stateOf({ panoId: A, flags: PINNED }, { panos: {}, coords: {} });
	assert.deepEqual(state, found(NOT_FOUND, true));
});

test("a failed metadata request counts as a missing pano", () => {
	const { state } = stateOf(
		{ panoId: A, flags: PINNED },
		{ panos: { [A]: meta(A) }, failing: [A], coords: {} },
	);
	assert.deepEqual(state, found(NOT_FOUND, true));
});

test("a pinned row whose pano differs from the default is pinned away from it", () => {
	const { state, coordCalls } = stateOf(
		{ panoId: A, flags: PINNED },
		{ panos: { [A]: meta(A), [B]: meta(B) }, coords: { "1,2": B } },
	);
	assert.equal(state.flags & OFF_DEFAULT, OFF_DEFAULT);
	assert.equal(state.flags & NEWER, 0, "the same capture month is not newer coverage");
	assert.equal(state.pinned, true);
	assert.equal(coordCalls.length, 1);
});

// --- Unofficial ---

test("a pano id longer than 22 characters is unofficial", () => {
	const { state } = stateOf({ panoId: LONG, flags: PINNED }, { panos: { [LONG]: meta(LONG) } });
	assert.deepEqual(state, found(UNOFFICIAL, true));
});

test("a user-photo copyright is unofficial", () => {
	for (const copyright of ["Photo by Someone", "USER-UPLOADED panorama", "user uploaded photo"]) {
		const { state } = stateOf(
			{ panoId: A, flags: PINNED },
			{ panos: { [A]: meta(A, { copyright }) } },
		);
		assert.deepEqual(state, found(UNOFFICIAL, true), copyright);
	}
});

test("a Google copyright is not unofficial", () => {
	const { state } = stateOf(
		{ panoId: A, flags: PINNED },
		{ panos: { [A]: meta(A, { copyright: "© 2021 Google" }) } },
	);
	assert.deepEqual(state, found(NONE, true));
});

// --- Badcam ---

test("a badcam capture with a better camera in its timeline reports one", () => {
	const { state, metaCalls } = stateOf(
		{ panoId: A },
		{
			panos: {
				[A]: badcam(A, { timeline: [{ pano: B, date: { year: 2019, month: 5, day: 1 } }] }),
				[B]: meta(B),
			},
			coords: { "1,2": A },
		},
	);
	assert.deepEqual(state, found(GOODCAM_AVAILABLE, false));
	// The timeline goes out as one request: the stored pano and its older capture.
	assert.deepEqual(metaCalls.at(-1), [B, A]);
});

test("a badcam capture with no better camera falls through to the timeline checks", () => {
	const { state } = stateOf(
		{ panoId: A },
		{
			panos: {
				[A]: badcam(A, { timeline: [{ pano: B, date: { year: 2019, month: 5, day: 1 } }] }),
				[B]: badcam(B),
			},
			coords: { "1,2": A },
		},
	);
	// A is the newest official capture and the stored one, so nothing is out of date.
	assert.deepEqual(state, found(NONE, false));
});

test("a pinned badcam row is checked for a better camera too", () => {
	const { state, metaCalls } = stateOf(
		{ panoId: A, flags: PINNED },
		{
			panos: {
				[A]: badcam(A, { timeline: [{ pano: B, date: { year: 2019, month: 5, day: 1 } }] }),
				[B]: meta(B),
			},
			coords: { "1,2": A },
		},
	);
	assert.equal(state.flags & GOODCAM_AVAILABLE, GOODCAM_AVAILABLE);
	assert.equal(state.pinned, true);
	assert.ok(metaCalls.length >= 2);
});

// --- Updates ---

test("a moved coordinate reports an applied update", () => {
	const { state } = stateOf(
		{ panoId: A },
		{
			panos: {
				[A]: meta(A),
				[B]: meta(B, { date: { year: 2024, month: 1, day: 1 } }),
			},
			coords: { "1,2": B },
		},
	);
	assert.deepEqual(state, found(NEWER, false));
});

test("a pinned row on an older official capture reports an available update", () => {
	const { state } = stateOf(
		{ panoId: A, flags: PINNED },
		{
			panos: {
				[A]: meta(A, {
					date: { year: 2019, month: 5, day: 1 },
					timeline: [{ pano: B, date: { year: 2021, month: 6, day: 1 } }],
				}),
			},
		},
	);
	assert.deepEqual(state, found(NEWER, true));
});

test("an unpinned row on an older official capture reports it as applied", () => {
	const { state } = stateOf(
		{ panoId: A },
		{
			panos: {
				[A]: meta(A, {
					date: { year: 2019, month: 5, day: 1 },
					timeline: [{ pano: B, date: { year: 2021, month: 6, day: 1 } }],
				}),
			},
			coords: { "1,2": A },
		},
	);
	assert.deepEqual(state, found(NEWER | DEFAULT_STALE, false));
});

test("a stored pano that is not in the timeline is left alone", () => {
	const { state } = stateOf(
		{ panoId: C, flags: PINNED },
		{
			panos: {
				[C]: meta(A, {
					date: { year: 2019, month: 5, day: 1 },
					timeline: [{ pano: B, date: { year: 2021, month: 6, day: 1 } }],
				}),
			},
		},
	);
	assert.deepEqual(state, found(NONE, true));
});

// --- Batch behaviour ---

test("every row is answered in order, once", () => {
	const rows = [
		{ id: 7, lat: 1, lng: 2, panoId: A },
		{ id: 8, lat: 3, lng: 4, panoId: null },
		{ id: 9, lat: 1, lng: 2, panoId: A, flags: PINNED },
	];
	const { answers, progress } = runProcedure(rows, {
		panos: { [A]: meta(A) },
		coords: { "1,2": A },
	});
	assert.deepEqual(answers, [
		{ id: 7, patch: found(NONE, false) },
		{ id: 8, patch: found(NOT_FOUND, false) },
		{ id: 9, patch: found(NONE, true) },
	]);
	assert.equal(progress, 3);
});

test("a batch costs the same host rounds however many rows it carries", () => {
	const rows = (n) =>
		Array.from({ length: n }, (_, i) => ({ id: i + 1, lat: 1, lng: 2, panoId: A }));
	const opts = { panos: { [A]: meta(A) }, coords: { "1,2": A } };

	// Stored metadata, then the coordinate lookups, which answer their own metadata.
	const one = runProcedure(rows(1), opts);
	assert.equal(one.hostCalls, 2);

	const many = runProcedure(rows(40), opts);
	assert.equal(many.hostCalls, one.hostCalls);
	assert.equal(many.answers.length, 40);
	assert.equal(many.coordCalls.length, 40, "every row still gets its own lookup");
	assert.deepEqual(
		many.answers.map((a) => a.patch),
		Array(40).fill(found(NONE, false)),
	);
});

test("badcam rows across a batch share one timeline round", () => {
	const rows = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, lat: 1, lng: 2, panoId: A }));
	const { answers, metaCalls, hostCalls } = runProcedure(rows, {
		panos: {
			[A]: badcam(A, { timeline: [{ pano: B, date: { year: 2019, month: 5, day: 1 } }] }),
			[B]: meta(B),
		},
		coords: { "1,2": A },
	});
	assert.equal(hostCalls, 3, "one extra round for the timeline, not one per row");
	assert.deepEqual(metaCalls.at(-1), [B, A], "the shared timeline is asked for once");
	assert.deepEqual(
		answers.map((a) => a.patch),
		Array(5).fill(found(GOODCAM_AVAILABLE, false)),
	);
});

test("the coordinate lookup uses the configured radius", () => {
	const { coordCalls } = stateOf({ panoId: null }, { config: { radius: 25 } });
	assert.equal(coordCalls[0].radius, 25);
});

test("the coordinate lookup defaults to 50 metres", () => {
	const { coordCalls } = stateOf({ panoId: null }, {});
	assert.equal(coordCalls[0].radius, 50);
});

test("an aborted run answers no row it could not decide", () => {
	const rows = [
		{ id: 1, lat: 1, lng: 2, panoId: A },
		{ id: 2, lat: 1, lng: 2, panoId: A },
	];
	const { answers } = runProcedure(rows, {
		panos: { [A]: meta(A) },
		coords: { "1,2": A },
		abortAfter: 1,
	});
	assert.deepEqual(answers, [], "a cancelled run must not report undecided rows as not found");
});
