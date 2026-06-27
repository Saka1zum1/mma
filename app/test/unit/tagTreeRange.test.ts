import { describe, it, expect } from "vitest";
import {
	rangeToggleTagIds,
	reorderSiblingsFlatOrder,
	buildTagTree,
	isLeafTag,
	sumCounts,
	type TagTreeNode,
} from "@/components/editor/tags/tagTreeRange";
import type { Tag } from "@/bindings.gen";

interface N {
	fullPath: string;
	tag: { id: number } | null;
	children: N[];
}
const leaf = (path: string, id: number): N => ({ fullPath: path, tag: { id }, children: [] });

const rows = [
	{ descendantTagIds: [1] },
	{ descendantTagIds: [2] },
	{ descendantTagIds: [3] },
	{ descendantTagIds: [4] },
];

describe("rangeToggleTagIds", () => {
	it("collects rows between anchor and target, excluding the anchor", () => {
		expect(rangeToggleTagIds(rows, 0, 2)).toEqual([2, 3]);
	});

	it("is direction-agnostic (anchor below target)", () => {
		expect(rangeToggleTagIds(rows, 3, 1)).toEqual([2, 3]);
	});

	it("returns empty when anchor equals target", () => {
		expect(rangeToggleTagIds(rows, 1, 1)).toEqual([]);
	});

	it("unions and de-dupes descendant ids across rows (parent + child overlap)", () => {
		const nested = [
			{ descendantTagIds: [10] },
			{ descendantTagIds: [20, 21, 22] }, // a collapsed parent
			{ descendantTagIds: [21] }, // child also visible elsewhere
		];
		expect(rangeToggleTagIds(nested, 0, 2)).toEqual([20, 21, 22]);
	});

	it("does not re-toggle the anchor's descendants when it's an expanded parent", () => {
		// idx0 parent P selects 1,2,3; its child rows sit inside the range to idx3.
		const rows = [
			{ descendantTagIds: [1, 2, 3] }, // P (anchor)
			{ descendantTagIds: [2] }, // P's child
			{ descendantTagIds: [3] }, // P's child
			{ descendantTagIds: [9] }, // unrelated node below
		];
		expect(rangeToggleTagIds(rows, 0, 3)).toEqual([9]);
	});
});

describe("reorderSiblingsFlatOrder", () => {
	const tree: N[] = [leaf("a", 1), leaf("b", 2), leaf("c", 3)];

	it("moves a root sibling after another", () => {
		expect(reorderSiblingsFlatOrder(tree, "a", "c", "after")).toEqual([2, 3, 1]);
	});

	it("moves a root sibling before another", () => {
		expect(reorderSiblingsFlatOrder(tree, "c", "a", "before")).toEqual([3, 1, 2]);
	});

	it("reorders within a parent and preserves other subtrees + relative order", () => {
		const nested: N[] = [
			{
				fullPath: "p",
				tag: null,
				children: [leaf("p/x", 10), leaf("p/y", 11), leaf("p/z", 12)],
			},
			leaf("q", 20),
		];
		// move p/z before p/x -> z,x,y under p; q untouched
		expect(reorderSiblingsFlatOrder(nested, "p/z", "p/x", "before")).toEqual([12, 10, 11, 20]);
	});

	it("returns null for non-siblings (different parent)", () => {
		const nested: N[] = [
			{ fullPath: "p", tag: null, children: [leaf("p/x", 10)] },
			leaf("q", 20),
		];
		expect(reorderSiblingsFlatOrder(nested, "p/x", "q", "after")).toBeNull();
	});

	it("returns null when source equals target", () => {
		expect(reorderSiblingsFlatOrder(tree, "a", "a", "after")).toBeNull();
	});
});

describe("buildTagTree", () => {
	const mkTag = (id: number, name: string, order = id): Tag => ({
		id,
		name,
		color: "#888888",
		order,
	});
	const segs = (nodes: TagTreeNode[]) => nodes.map((n) => n.segment);

	it("floats leaf tags above sub-branches at the root (default sort)", () => {
		// 'Europe' becomes a branch (has France); Red/Blue are plain leaves.
		const tags = [mkTag(1, "Europe/France"), mkTag(2, "Red"), mkTag(3, "Blue")];
		const tree = buildTagTree(tags, "default", {});
		expect(segs(tree)).toEqual(["Red", "Blue", "Europe"]);
		expect(tree[2].tag).toBeNull(); // pure folder node, no bare 'Europe' tag
		expect(segs(tree[2].children)).toEqual(["France"]);
	});

	it("floats leaf tags above sub-branches within a nested folder", () => {
		const tags = [mkTag(1, "A/m"), mkTag(2, "A/Z/q"), mkTag(3, "A/b")];
		const a = buildTagTree(tags, "default", {})[0];
		expect(segs(a.children)).toEqual(["m", "b", "Z"]); // leaves m,b before branch Z
		expect(isLeafTag(a.children[0])).toBe(true);
		expect(isLeafTag(a.children[1])).toBe(true);
		expect(isLeafTag(a.children[2])).toBe(false); // Z is a branch
	});

	it("keeps leaves first under name and amount sort too", () => {
		const tags = [mkTag(1, "Europe/France"), mkTag(2, "Red"), mkTag(3, "Blue")];
		expect(segs(buildTagTree(tags, "name", {}))).toEqual(["Blue", "Red", "Europe"]);
		expect(segs(buildTagTree(tags, "amount", { 1: 5, 2: 10, 3: 1 }))).toEqual([
			"Red",
			"Blue",
			"Europe",
		]);
	});

	it("every childless node carries a tag, so leaf pills are always tag-backed", () => {
		const tags = [mkTag(1, "A/B"), mkTag(2, "A/C/D"), mkTag(3, "E"), mkTag(4, "A")];
		const tree = buildTagTree(tags, "default", {});
		const walk = (nodes: TagTreeNode[]) => {
			for (const n of nodes) {
				if (n.children.length === 0) expect(n.tag).not.toBeNull();
				walk(n.children);
			}
		};
		walk(tree);
	});

	it("sumCounts totals a node's whole subtree", () => {
		const tree = buildTagTree([mkTag(1, "A/B"), mkTag(2, "A/C")], "default", { 1: 3, 2: 4 });
		expect(sumCounts(tree[0], { 1: 3, 2: 4 })).toBe(7);
	});

	it("colors a virtual folder node from virtualTags and propagates to tagless descendants", () => {
		const tree = buildTagTree([mkTag(1, "a/b/x")], "default", {}, { a: { color: "#ff0000" } });
		const a = tree[0];
		expect(a.tag).toBeNull();
		expect(a.inheritedColor).toBe("#ff0000");
		const ab = a.children[0]; // 'a/b' is virtual too — inherits a's color
		expect(ab.tag).toBeNull();
		expect(ab.inheritedColor).toBe("#ff0000");
	});

	it("leaves a virtual folder node gray when unconfigured", () => {
		const tree = buildTagTree([mkTag(1, "a/b")], "default", {});
		expect(tree[0].tag).toBeNull();
		expect(tree[0].inheritedColor).toBe("#888888");
	});
});
