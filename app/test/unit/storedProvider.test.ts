import { describe, expect, it } from "vitest";
import { storedProvider } from "@/plugins/generator/engine/types";

describe("stored provider for a generated location", () => {
	it("keeps each imagery service", () => {
		expect(storedProvider("baidu")).toBe("baidu");
		expect(storedProvider("apple")).toBe("apple");
		expect(storedProvider("tencent")).toBe("tencent");
		expect(storedProvider("yandex")).toBe("yandex");
	});

	it("stores photometa finds as Google", () => {
		expect(storedProvider("google")).toBe("google");
		expect(storedProvider("googleZoom")).toBe("google");
		expect(storedProvider(undefined)).toBe("google");
	});
});
