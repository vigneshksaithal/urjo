import { describe, expect, it } from "vitest";

import {
	buildLevelPath,
	getNextPlayableLevel,
} from "../level-path";

describe("level path model", () => {
	it("builds a compact forward path with one current node and locked future nodes", () => {
		const path = buildLevelPath({
			currentLevel: 12,
			visibleLevels: 7,
		});

		expect(path.map((level) => level.level)).toEqual([12, 13, 14, 15, 16, 17, 18]);
		expect(path.map((level) => level.state)).toEqual([
			"current",
			"locked",
			"locked",
			"locked",
			"locked",
			"locked",
			"locked",
		]);
		expect(path.find((level) => level.state === "current")?.level).toBe(12);
	});

	it("keeps early players anchored at level one", () => {
		const path = buildLevelPath({
			currentLevel: 1,
			visibleLevels: 5,
		});

		expect(path.map((level) => level.level)).toEqual([1, 2, 3, 4, 5]);
		expect(path[0]?.state).toBe("current");
		expect(path.slice(1).every((level) => level.state === "locked")).toBe(true);
	});

	it("returns the single playable node users must tap to continue", () => {
		const path = buildLevelPath({
			currentLevel: 4,
			visibleLevels: 6,
		});

		expect(getNextPlayableLevel(path)).toMatchObject({
			level: 4,
			state: "current",
		});
	});
});
