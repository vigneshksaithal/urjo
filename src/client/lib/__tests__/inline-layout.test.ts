import { describe, expect, it } from "vitest";

import { shouldCompactInlineBoard } from "../inline-layout";

describe("shouldCompactInlineBoard", () => {
	it("compacts an 8×8 board in a tall inline post", () => {
		expect(shouldCompactInlineBoard(8, 512)).toBe(true);
	});

	it("keeps smaller boards at the normal chrome density", () => {
		expect(shouldCompactInlineBoard(6, 512)).toBe(false);
	});

	it("keeps the full status chrome in larger inline post frames", () => {
		expect(shouldCompactInlineBoard(8, 513)).toBe(false);
	});
});
