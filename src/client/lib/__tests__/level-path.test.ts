import { describe, expect, it } from "vitest";

import {
	buildLevelPath,
	getNextPlayableLevel,
} from "../level-path";

describe("level path model", () => {
	it("builds a three-node window with the previous level, current level, and next locked level", () => {
		const path = buildLevelPath({
			currentLevel: 12,
			visibleLevels: 3,
		});

		expect(path.map((level) => level.level)).toEqual([11, 12, 13]);
		expect(path.map((level) => level.state)).toEqual([
			"completed",
			"current",
			"locked",
		]);
		expect(path.find((level) => level.state === "current")?.level).toBe(12);
	});

	it("clamps the previous level at one for early players", () => {
		const path = buildLevelPath({
			currentLevel: 1,
			visibleLevels: 3,
		});

		expect(path.map((level) => level.level)).toEqual([1, 2, 3]);
		expect(path[0]?.state).toBe("current");
		expect(path.slice(1).every((level) => level.state === "locked")).toBe(true);
	});

	it("returns the single playable node users must tap to continue", () => {
		const path = buildLevelPath({
			currentLevel: 4,
			visibleLevels: 3,
		});

		expect(getNextPlayableLevel(path)).toMatchObject({
			level: 4,
			state: "current",
		});
	});
});
