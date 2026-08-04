import { describe, expect, it } from "vitest";
import { getEarnedCoins } from "../completion-reward";

describe("getEarnedCoins", () => {
	it("returns zero without a reward", () => {
		expect(getEarnedCoins({})).toBe(0);
	});

	it("includes the variable multiplier and session bonuses", () => {
		expect(
			getEarnedCoins({
				coinReward: {
					base: 20,
					streakBonus: 0,
					speedBonus: 0,
					dailyBonus: 0,
					perfectBonus: 0,
					loginBonus: 0,
					gridSizeMultiplier: 1,
					total: 25,
					multiplier: 2,
				},
				sessionRunBonusCoins: 5,
				weekendBonusCoins: 10,
			}),
		).toBe(60);
	});

	it("includes a coin mystery-box reward", () => {
		expect(
			getEarnedCoins({
				coinReward: {
					base: 10,
					streakBonus: 0,
					speedBonus: 0,
					dailyBonus: 0,
					perfectBonus: 0,
					loginBonus: 0,
					gridSizeMultiplier: 1,
					total: 10,
					mysteryBox: { type: "coins", value: 7 },
				},
			}),
		).toBe(17);
	});
});
