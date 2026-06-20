import { describe, it, expect } from "vitest";
import { rangeToggleTagIds, reorderSiblingsFlatOrder } from "@/components/editor/tags/tagTreeRange";

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
