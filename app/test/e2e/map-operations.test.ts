import {
	waitForReady,
	createAndOpenMap,
	closeMap,
	deleteMap,
	flushAndWait,
	openMap,
	addLocs,
	getLocCount,
	makeLoc,
	withApi,
} from "./helpers";

describe("Map rename", () => {
	let mapId: string;

	before(async () => {
		await waitForReady();
		mapId = await createAndOpenMap("E2E Original Name");
	});

	after(async () => {
		await closeMap();
		await deleteMap(mapId);
	});

	it("rename open map updates in-memory name", async () => {
		await withApi(async (api, id) => {
			await api.renameMap(id, "Renamed Map");
		}, mapId);

		const name = await withApi(async (api) => api.getCurrentMap()?.meta.name);
		expect(name).toBe("Renamed Map");
	});

	it("rename persists after save/load", async () => {
		await flushAndWait();
		await closeMap();
		await openMap(mapId);

		const name = await withApi(async (api) => api.getCurrentMap()?.meta.name);
		expect(name).toBe("Renamed Map");
	});

	it("rename shows in map list", async () => {
		const maps = await withApi(async (api) => {
			return await api.listMaps();
		});
		const ourMap = maps.find((m) => m.id === mapId);
		expect(ourMap).toBeTruthy();
		expect(ourMap!.name).toBe("Renamed Map");
	});
});

describe("Folder operations", () => {
	const mapIds: string[] = [];

	before(async () => {
		await waitForReady();
	});

	afterEach(async () => {
		await closeMap();
	});

	after(async () => {
		for (const id of mapIds) await deleteMap(id);
	});

	it("move map to folder", async () => {
		const id = await createAndOpenMap("Folder Test 1");
		mapIds.push(id);

		await withApi(async (api, mapId) => {
			await api.moveMapToFolder(mapId, "MyFolder");
		}, id);

		const maps = await withApi(async (api) => {
			return await api.listMaps();
		});
		const ourMap = maps.find((m) => m.id === id);
		expect(ourMap!.folder).toBe("MyFolder");
	});

	it("move map to root (folder=null)", async () => {
		await withApi(async (api, mapId) => {
			await api.moveMapToFolder(mapId, null);
		}, mapIds[0]);

		const maps = await withApi(async (api) => {
			return await api.listMaps();
		});
		const ourMap = maps.find((m) => m.id === mapIds[0]);
		expect(ourMap!.folder).toBeNull();
	});

	it("rename folder updates all maps in it", async () => {
		// Create two maps in a folder
		const id1 = await createAndOpenMap("RF Map 1");
		mapIds.push(id1);
		await closeMap();
		const id2 = await createAndOpenMap("RF Map 2");
		mapIds.push(id2);

		await withApi(
			async (api, a, b) => {
				await api.moveMapToFolder(a, "OldFolder");
				await api.moveMapToFolder(b, "OldFolder");
				await api.renameFolder("OldFolder", "NewFolder");
			},
			id1,
			id2,
		);

		const maps = await withApi(async (api) => {
			return await api.listMaps();
		});
		const m1 = maps.find((m) => m.id === id1);
		const m2 = maps.find((m) => m.id === id2);
		expect(m1!.folder).toBe("NewFolder");
		expect(m2!.folder).toBe("NewFolder");
	});

	it("deleteFolder moves maps to root, does not delete them", async () => {
		await withApi(async (api) => {
			await api.deleteFolder("NewFolder");
		});

		const maps = await withApi(async (api) => {
			return await api.listMaps();
		});

		// Maps still exist but in root
		const m1 = maps.find((m) => m.id === mapIds[1]);
		const m2 = maps.find((m) => m.id === mapIds[2]);
		expect(m1).toBeTruthy();
		expect(m2).toBeTruthy();
		expect(m1!.folder).toBeNull();
		expect(m2!.folder).toBeNull();
	});
});

describe("Map metadata updates", () => {
	let mapId: string;

	before(async () => {
		await waitForReady();
		mapId = await createAndOpenMap("E2E Meta Update");
	});

	after(async () => {
		await closeMap();
		await deleteMap(mapId);
	});

	it("update description", async () => {
		await withApi(async (api) => {
			await api.updateMapMeta({ description: "Test map for E2E" });
		});

		const desc = await withApi(async (api) => api.getCurrentMap()?.meta.description);
		expect(desc).toBe("Test map for E2E");
	});

	it("update settings", async () => {
		await withApi(async (api) => {
			const cur = api.getCurrentMap()!.meta.settings;
			await api.updateMapMeta({ settings: { ...cur, enrichMetadata: true } });
		});

		const settings = await withApi(async (api) => api.getCurrentMap()!.meta.settings);
		expect(settings.enrichMetadata).toBe(true);
	});

	it("update scoreBounds", async () => {
		await withApi(async (api) => {
			await api.updateMapMeta({
				scoreBounds: [100, 200, 300, 400],
			});
		});

		const bounds = await withApi(async (api) => api.getCurrentMap()?.meta.scoreBounds);
		expect(bounds).toEqual([100, 200, 300, 400]);
	});

	it("meta updates persist after save/load", async () => {
		await flushAndWait();
		await closeMap();
		await openMap(mapId);

		const meta = await withApi(async (api) => api.getCurrentMap()!.meta);
		expect(meta.description).toBe("Test map for E2E");
		expect(meta.settings.enrichMetadata).toBe(true);
		expect(meta.scoreBounds).toEqual([100, 200, 300, 400]);
	});
});

// bulkImportMaps was removed in the Rust migration — bulk import now requires files on disk
// via bulk_import_preview + bulk_import_confirm. Covered by bulk-import-rust.test.ts.
describe.skip("Bulk import", () => {
	const importedIds: string[] = [];

	before(async () => {
		await waitForReady();
	});

	after(async () => {
		await closeMap();
		for (const id of importedIds) await deleteMap(id);
	});

	it("bulk import creates multiple maps", async () => {
		await withApi(async (api) => {
			const maps = await api.listMaps();
			return maps.length;
		});

		await withApi(async (api) => {
			await (api as any).bulkImportMaps([
				{
					name: "Bulk Map 1",
					folder: "Imported",
					locations: [
						{
							lat: 10,
							lng: 20,
							heading: 0,
							pitch: 0,
							zoom: 1,
							panoId: null,
							flags: 0,
							tags: [],
							createdAt: new Date().toISOString(),
						},
					],
					tags: [],
				},
				{
					name: "Bulk Map 2",
					folder: "Imported",
					locations: [
						{
							lat: 30,
							lng: 40,
							heading: 0,
							pitch: 0,
							zoom: 1,
							panoId: null,
							flags: 0,
							tags: [],
							createdAt: new Date().toISOString(),
						},
						{
							lat: 50,
							lng: 60,
							heading: 0,
							pitch: 0,
							zoom: 1,
							panoId: null,
							flags: 0,
							tags: [],
							createdAt: new Date().toISOString(),
						},
					],
					tags: [{ name: "Imported", color: "#ff0000", visible: true }],
				},
			]);
		});

		const maps = await withApi(async (api) => {
			return await api.listMaps();
		});

		const bulkMaps = maps.filter((m: any) => m.name.startsWith("Bulk Map"));
		expect(bulkMaps.length).toBe(2);
		for (const m of bulkMaps) importedIds.push(m.id);

		const m1 = bulkMaps.find((m: any) => m.name === "Bulk Map 1");
		const m2 = bulkMaps.find((m: any) => m.name === "Bulk Map 2");
		expect(m1!.folder).toBe("Imported");
		expect(m2!.folder).toBe("Imported");
	});

	it("bulk imported maps have correct locations", async () => {
		// Open Bulk Map 2 and check
		const id = importedIds[1]; // second map
		await openMap(id);

		const count = await getLocCount();
		expect(count).toBe(2);
	});

	it("bulk imported maps have tags", async () => {
		const tags = await withApi(async (api) => {
			return api.getCurrentMap()?.meta.tags;
		});
		expect(Object.keys(tags!).length).toBeGreaterThanOrEqual(1);
		const tagValues = Object.values(tags!) as any[];
		expect(tagValues.some((t: any) => t.name === "Imported")).toBe(true);
	});
});

describe("Active location and work area", () => {
	let mapId: string;
	let locIds: number[];

	before(async () => {
		await waitForReady();
		mapId = await createAndOpenMap("E2E Active Loc");
		const locs = [
			makeLoc({ lat: 10, lng: 20, heading: 90, pitch: 5, zoom: 2, panoId: "P1", flags: 1 }),
			makeLoc({ lat: 30, lng: 40, heading: 180, pitch: 0, zoom: 1 }),
		];
		locIds = await addLocs(locs);
	});

	after(async () => {
		await closeMap();
		await deleteMap(mapId);
	});

	it("setActiveLocation switches to location work area", async () => {
		const id = locIds[0];
		await withApi(async (api, locId) => {
			await api.setActiveLocation(locId);
		}, id);

		const result = await withApi(async (api) => {
			return {
				workArea: api.getWorkArea(),
				activeId: api.getActiveLocation()?.id,
				activeLat: api.getActiveLocation()?.lat,
			};
		});
		expect(result.workArea).toBe("location");
		expect(result.activeId).toBe(id);
		expect(result.activeLat).toBe(10);
	});

	it("setActiveLocation(null) returns to overview", async () => {
		await withApi(async (api) => {
			await api.setActiveLocation(null);
		});

		const result = await withApi(async (api) => ({
			workArea: api.getWorkArea(),
			active: api.getActiveLocation(),
		}));
		expect(result.workArea).toBe("overview");
		expect(result.active).toBeNull();
	});

	it("switching active location changes work area target", async () => {
		const id0 = locIds[0];
		const id1 = locIds[1];
		await withApi(
			async (api, a, b) => {
				await api.setActiveLocation(a);
				await api.setActiveLocation(b);
			},
			id0,
			id1,
		);

		const result = await withApi(async (api) => ({
			activeId: api.getActiveLocation()?.id,
			activeLat: api.getActiveLocation()?.lat,
		}));
		expect(result.activeId).toBe(id1);
		expect(result.activeLat).toBe(30);
	});
});

describe("Extra field definitions", () => {
	let mapId: string;

	before(async () => {
		await waitForReady();
		mapId = await createAndOpenMap("E2E Extra Fields");
	});

	after(async () => {
		await closeMap();
		await deleteMap(mapId);
	});

	it("set extra field definitions on map", async () => {
		await withApi(async (api) => {
			await api.updateMapExtraFields({
				altitude: { type: "number", label: "Altitude (m)" },
				country: { type: "string", label: "Country" },
				region: { type: "enum", label: "Region", values: ["NA", "EU", "AS"] },
			});
		});

		const extra = await withApi(async (api) => api.getCurrentMap()?.meta.extra);
		expect(extra!.fields!.altitude.type).toBe("number");
		expect(extra!.fields!.country.type).toBe("string");
		expect(extra!.fields!.region.values).toEqual(["NA", "EU", "AS"]);
	});

	it("extra field definitions persist", async () => {
		await flushAndWait();
		await closeMap();
		await openMap(mapId);

		const extra = await withApi(async (api) => api.getCurrentMap()?.meta.extra);
		expect(extra!.fields!.altitude.type).toBe("number");
		expect(extra!.fields!.altitude.label).toBe("Altitude (m)");
	});
});
