import {
	closeMap,
	flushAndWait,
	openMap,
	getAllLocs,
	getLocCount,
	randomLatLng,
	randomHeading,
	useMap,
	seedLocs,
} from "./helpers";

describe("Storage round-trip", () => {
	const map = useMap("E2E Storage Test");

	it("should open the map and add locations", async () => {
		await seedLocs(200, (i) => ({
			...randomLatLng(),
			...randomHeading(),
			panoId: i % 5 === 0 ? `pano_${i}` : null,
			flags: i % 3 === 0 ? 1 : 0,
		}));

		const count = await getLocCount();
		expect(count).toBe(200);
	});

	it("should persist after save", async () => {
		await flushAndWait();
		await closeMap();
		await openMap(map.id);

		const count = await getLocCount();
		expect(count).toBe(200);
	});

	it("should preserve location flags across save/load", async () => {
		const locs = await getAllLocs();
		const total = locs.length;
		const withFlag = locs.filter((l) => (l.flags & 1) !== 0).length;
		const withPano = locs.filter((l) => l.panoId != null).length;

		expect(total).toBe(200);
		expect(withFlag).toBeGreaterThan(50);
		expect(withFlag).toBeLessThan(80);
		expect(withPano).toBe(40);
	});

	it("should handle add + save correctly", async () => {
		await seedLocs(50, () => ({ ...randomLatLng(), ...randomHeading() }));

		const afterAdd = await getLocCount();
		expect(afterAdd).toBe(250);

		await flushAndWait();
		await closeMap();
		await openMap(map.id);

		const afterReopen = await getLocCount();
		expect(afterReopen).toBe(250);
	});
});
