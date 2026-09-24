// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { plainClueText } from "@/plugins/localguessr/learnableMeta";

describe("plainClueText", () => {
	it("keeps the words and drops markup", () => {
		expect(plainClueText("<b>Bollard</b> on the <i>right</i>")).toBe("Bollard on the right");
	});

	it("drops script and style contents", () => {
		expect(plainClueText("<script>alert(1)</script><style>.x{}</style><p>Pole</p>")).toBe("Pole");
	});
});
