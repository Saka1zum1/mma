import { describe, it, expect } from "vitest";
import { pickRelease, toRelease, type ApiRelease, type Release } from "@/lib/util/updateCheck";

const asset = (name: string): ApiRelease["assets"][number] => ({
	name,
	browser_download_url: `https://example.test/${name}`,
});

function release(
	tag: string,
	opts: { prerelease?: boolean; manifest?: boolean } = {},
): Release {
	return toRelease({
		tag_name: tag,
		body: "",
		draft: false,
		prerelease: opts.prerelease ?? false,
		published_at: "2026-01-01T00:00:00Z",
		assets: opts.manifest === false ? [] : [asset("latest.json")],
	});
}

describe("pickRelease", () => {
	it("picks the newest installable newer than current", () => {
		const picked = pickRelease(
			[release("v0.9.2"), release("v0.9.1"), release("v0.9.0")],
			"0.9.0",
			false,
		);
		expect(picked?.version).toBe("0.9.2");
	});

	it("skips pre-releases unless asked", () => {
		const list = [release("v0.10.0-rc.1", { prerelease: true }), release("v0.9.2")];
		expect(pickRelease(list, "0.9.1", false)?.version).toBe("0.9.2");
		expect(pickRelease(list, "0.9.1", true)?.version).toBe("0.10.0-rc.1");
	});

	it("does not roll back when current is a pre-release ahead of stable", () => {
		expect(pickRelease([release("v0.9.2")], "0.10.0-rc.1", false)).toBeNull();
	});

	it("ignores a release with no latest.json", () => {
		expect(pickRelease([release("v1.0.0", { manifest: false })], "0.9.1", true)).toBeNull();
	});
});
