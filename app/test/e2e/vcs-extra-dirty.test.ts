/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Invariant under scrutiny: does an extra-field-only change (the path enrichment and
 * manual extra edits take, via patchLocationExtra -> storeUpdateLocations(record_undo=false))
 * make the map committable?
 *
 * store_commit_diff walks the UNDO stack; non-undoable extra writes never land there,
 * so hasCommitDiff() reads 0 -- which disables the "Commit map" command. Yet the change
 * marks the overlay dirty, so a forced commit DOES capture it. These tests document that
 * actual behavior so a regression (data silently dropped, or the badge changing) is caught.
 */
import {
	waitForReady,
	createAndOpenMap,
	closeMap,
	deleteMap,
	addLocs,
	createLocation,
	getLoc,
	flushAndWait,
	withApi,
} from "./helpers";

describe("VCS — extra-only change commit semantics", () => {
	let mapId: string;
	let id: number;

	before(async () => {
		await waitForReady();
		mapId = await createAndOpenMap("E2E VCS Extra Dirty");
		[id] = await addLocs([createLocation({ lat: 1, lng: 2, heading: 0 })]);
		await flushAndWait();
		await withApi(async (api) => api.commitMap("base"));
	});

	after(async () => {
		await closeMap();
		await deleteMap(mapId);
	});

	it("an extra-only edit does NOT register on the commit-diff badge", async () => {
		const loc = await getLoc(id);
		await withApi(async (api, l) => api.patchLocationExtra(l, { score: 7 }), loc);
		// Undo-stack-derived diff is blind to non-undoable extra writes.
		expect(await withApi(async (api) => api.cmd.storeCommitDiff())).toEqual([0, 0, 0]);
		expect(await withApi(async (api) => api.hasCommitDiff())).toBe(false);
	});

	it("but a forced commit still captures the extra change (overlay is dirty)", async () => {
		const newCommit = await withApi(async (api) => api.commitMap("extra commit"));
		expect(newCommit).not.toContain("ERROR");

		// Mutate extra again post-commit, then checkout the "extra commit" to prove
		// it materialized the score=7 value (not lost, not the later value).
		const loc = await getLoc(id);
		await withApi(async (api, l) => api.patchLocationExtra(l, { score: 999 }), loc);
		await flushAndWait();

		await withApi(async (api, cid) => api.checkoutCommit(cid), newCommit);
		const restored = await getLoc(id);
		expect(restored.extra?.score).toBe(7);
	});

	it("checkout of the base (pre-extra) commit restores a location with no score", async () => {
		const commits = await withApi(async (api, m) => api.cmd.storeListCommits(m), mapId);
		const base = commits.find((c: any) => c.message === "base");
		await withApi(async (api, cid) => api.checkoutCommit(cid), base!.id);
		const restored = await getLoc(id);
		expect(restored.extra?.score).toBeUndefined();
	});
});
