import {
	waitForReady,
	createAndOpenMap,
	closeMap,
	deleteMap,
	flushAndWait,
	openMap,
	addLocs,
	getLoc,
	makeLoc,
	withApi,
} from "./helpers";

describe("Tag CRUD", () => {
	let mapId: string;
	let t1Id: number;
	let t3Id: number;

	before(async () => {
		await waitForReady();
		mapId = await createAndOpenMap("E2E Tags");
	});

	after(async () => {
		await closeMap();
		await deleteMap(mapId);
	});

	it("add a tag", async () => {
		const result = await withApi(async (api) => {
			const resolved = await api.resolveTagNames(["Red Tag"]);
			const tagInfo = resolved[0];
			await api.addTag({ id: tagInfo.id, name: "Red Tag", color: "#ff0000", visible: true });
			const map = api.getCurrentMap()!;
			const tagKey = String(tagInfo.id);
			return {
				count: Object.keys(map.meta.tags).length,
				tag: map.meta.tags[tagKey],
				tagId: tagInfo.id,
			};
		});
		expect(result.count).toBe(1);
		expect(result.tag.name).toBe("Red Tag");
		expect(result.tag.color).toBe("#ff0000");
		t1Id = result.tagId;
	});

	it("add multiple tags", async () => {
		const result = await withApi(async (api) => {
			const resolved = await api.resolveTagNames(["Blue Tag", "Green Tag"]);
			await api.addTag({ id: resolved[0].id, name: "Blue Tag", color: "#0000ff", visible: true });
			await api.addTag({ id: resolved[1].id, name: "Green Tag", color: "#00ff00", visible: true });
			return {
				count: Object.keys(api.getCurrentMap()!.meta.tags).length,
				ids: [resolved[0].id, resolved[1].id],
			};
		});
		expect(result.count).toBe(3);
		t3Id = result.ids[1];
	});

	it("update tag name", async () => {
		const result = await withApi(async (api, tagId) => {
			await api.updateTag(tagId, { name: "Renamed Red" });
			return api.getCurrentMap()!.meta.tags[String(tagId)].name;
		}, t1Id);
		expect(result).toBe("Renamed Red");
	});

	it("update tag color", async () => {
		const result = await withApi(async (api, tagId) => {
			await api.updateTag(tagId, { color: "#ff8800" });
			return api.getCurrentMap()!.meta.tags[String(tagId)].color;
		}, t1Id);
		expect(result).toBe("#ff8800");
	});

	it("update tag visibility", async () => {
		const result = await withApi(async (api, tagId) => {
			await api.updateTag(tagId, { visible: false });
			return api.getCurrentMap()!.meta.tags[String(tagId)].visible;
		}, t1Id);
		expect(result).toBe(false);
	});

	it("delete tag hides it but keeps the definition", async () => {
		const result = await withApi(async (api, tagId) => {
			await api.deleteTag(tagId);
			const tags = api.getCurrentMap()!.meta.tags;
			return {
				count: Object.keys(tags).length,
				hasTag: String(tagId) in tags,
				visible: tags[String(tagId)]?.visible,
			};
		}, t3Id);
		// Deleting a tag hides it (visible: false) rather than removing the definition.
		expect(result.count).toBe(3);
		expect(result.hasTag).toBe(true);
		expect(result.visible).toBe(false);
	});
});

describe("Tag operations on locations", () => {
	let mapId: string;
	let bulkTagId: number;
	let otherTagId: number;
	let locIds: number[];

	before(async () => {
		await waitForReady();
		mapId = await createAndOpenMap("E2E Tag Ops");

		const tagResult = await withApi(async (api) => {
			const resolved = await api.resolveTagNames(["Bulk", "Other"]);
			await api.addTag({ id: resolved[0].id, name: "Bulk", color: "#aabbcc", visible: true });
			await api.addTag({ id: resolved[1].id, name: "Other", color: "#ccbbaa", visible: true });
			return { bulkId: resolved[0].id, otherId: resolved[1].id };
		});
		bulkTagId = tagResult.bulkId;
		otherTagId = tagResult.otherId;

		const locs = [];
		for (let i = 0; i < 50; i++) {
			locs.push(makeLoc({ lat: i, lng: i }));
		}
		locIds = await addLocs(locs);
	});

	after(async () => {
		await closeMap();
		await deleteMap(mapId);
	});

	it("add tag to individual location", async () => {
		const tags = await withApi(
			async (api, locId, tagId) => {
				api.updateLocation(locId, { tags: [tagId] });
				const loc = await api.fetchLocation(locId);
				return loc?.tags;
			},
			locIds[0],
			bulkTagId,
		);
		expect(tags).toEqual([bulkTagId]);
	});

	it("bulkAddTag adds tag to all selected locations", async () => {
		const result = await withApi(async (api, tagId) => {
			await api.selectEverything();
			await api.bulkAddTag(tagId);
			const locs = await api.fetchAllLocations();
			const tagged = locs.filter((l: any) => l.tags.includes(tagId));
			return tagged.length;
		}, otherTagId);
		expect(result).toBe(50);
	});

	it("bulkAddTag is idempotent (no duplicates)", async () => {
		const result = await withApi(
			async (api, tagId, locId) => {
				await api.selectEverything();
				await api.bulkAddTag(tagId);
				const loc = await api.fetchLocation(locId);
				return loc!.tags.filter((t: number) => t === tagId).length;
			},
			otherTagId,
			locIds[1],
		);
		expect(result).toBe(1);
	});

	it("undo bulkAddTag removes tag from all", async () => {
		await withApi(async (api) => {
			await api.undo();
			return "ok";
		});

		const result = await withApi(async (api, tagId) => {
			const locs = await api.fetchAllLocations();
			return locs.filter((l: any) => l.tags.includes(tagId)).length;
		}, otherTagId);
		// The no-op bulkAddTag didn't record an edit, so undo undoes the first bulkAddTag.
		expect(result).toBe(0);
	});

	it("remove tag from location", async () => {
		await withApi(async (api, locId) => {
			api.updateLocation(locId, { tags: [] });
			return "ok";
		}, locIds[0]);
		const loc = await getLoc(locIds[0]);
		expect(loc.tags).toEqual([]);
	});

	it("multiple tags on one location", async () => {
		const tags = await withApi(
			async (api, locId, bulkId, otherId) => {
				api.updateLocation(locId, { tags: [bulkId, otherId] });
				const loc = await api.fetchLocation(locId);
				return loc!.tags;
			},
			locIds[5],
			bulkTagId,
			otherTagId,
		);
		expect(tags).toContain(bulkTagId);
		expect(tags).toContain(otherTagId);
		expect(tags.length).toBe(2);
	});
});

describe("Tag persistence", () => {
	let mapId: string;
	let pt1Id: number;
	let pt2Id: number;

	before(async () => {
		await waitForReady();
		mapId = await createAndOpenMap("E2E Tag Persist");
	});

	after(async () => {
		await closeMap();
		await deleteMap(mapId);
	});

	it("tags survive save/load", async () => {
		const result = await withApi(async (api) => {
			const resolved = await api.resolveTagNames(["Persist Tag", "Persist Tag 2"]);
			await api.addTag({
				id: resolved[0].id,
				name: "Persist Tag",
				color: "#112233",
				visible: true,
			});
			await api.addTag({
				id: resolved[1].id,
				name: "Persist Tag 2",
				color: "#445566",
				visible: false,
			});
			return { pt1Id: resolved[0].id, pt2Id: resolved[1].id };
		});
		pt1Id = result.pt1Id;
		pt2Id = result.pt2Id;

		await flushAndWait();
		await closeMap();
		await openMap(mapId);

		const tags = await withApi((api) => {
			return api.getCurrentMap()!.meta.tags;
		});
		const pt1Key = String(pt1Id);
		const pt2Key = String(pt2Id);
		expect(tags[pt1Key].name).toBe("Persist Tag");
		expect(tags[pt1Key].color).toBe("#112233");
		expect(tags[pt1Key].visible).toBe(true);
		expect(tags[pt2Key].name).toBe("Persist Tag 2");
		expect(tags[pt2Key].visible).toBe(false);
	});

	it("tag assignments on locations survive save/load", async () => {
		const locs = [makeLoc({ lat: 10, lng: 20, tags: [pt1Id, pt2Id] })];
		const ids = await addLocs(locs);
		const locId = ids[0];

		await flushAndWait();
		await closeMap();
		await openMap(mapId);

		const tags = await withApi(async (api, id) => {
			const loc = await api.fetchLocation(id);
			return loc?.tags;
		}, locId);
		expect(tags).toContain(pt1Id);
		expect(tags).toContain(pt2Id);
	});

	it("tag reorder persists", async () => {
		await withApi(
			async (api, id1, id2) => {
				await api.reorderTags([id2, id1]);
				return "ok";
			},
			pt1Id,
			pt2Id,
		);

		await flushAndWait();
		await closeMap();
		await openMap(mapId);

		const tags = await withApi((api) => {
			return api.getCurrentMap()!.meta.tags;
		});
		const pt1Key = String(pt1Id);
		const pt2Key = String(pt2Id);
		// pt2 should come before pt1 now
		expect(tags[pt2Key].order!).toBeLessThan(tags[pt1Key].order!);
	});
});
