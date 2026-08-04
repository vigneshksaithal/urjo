import { describe, expect, it } from "vitest";

import {
	computeTutorialLayout,
	computeTutorialSideInset,
} from "../tutorial-layout";

describe("computeTutorialSideInset", () => {
	it("reserves extra breathing room on narrow screens", () => {
		expect(computeTutorialSideInset(320)).toBe(64);
	});

	it("caps the reserved space on wider screens", () => {
		expect(computeTutorialSideInset(720)).toBe(108);
	});
});

describe("computeTutorialLayout", () => {
	it("keeps the tutorial board inside a padded mobile viewport", () => {
		expect(computeTutorialLayout(343, 430)).toEqual({ boardSize: 274 });
	});

	it("uses the available height when it is the limiting dimension", () => {
		expect(computeTutorialLayout(768, 360)).toEqual({ boardSize: 360 });
	});

	it("never returns negative sizes", () => {
		expect(computeTutorialLayout(0, 0)).toEqual({ boardSize: 0 });
	});
});
