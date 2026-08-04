import type { CoinReward } from "../../shared/types";

type CompletionRewardInput = {
	coinReward?: CoinReward;
	sessionRunBonusCoins?: number;
	weekendBonusCoins?: number;
};

export const getEarnedCoins = (input: CompletionRewardInput): number => {
	const reward = input.coinReward;
	if (!reward) {
		return (input.sessionRunBonusCoins ?? 0) + (input.weekendBonusCoins ?? 0);
	}

	const multiplierBonus = reward.multiplier
		? reward.base * (reward.multiplier - 1)
		: 0;
	const mysteryCoins =
		reward.mysteryBox?.type === "coins" ? reward.mysteryBox.value : 0;

	return (
		reward.total +
		multiplierBonus +
		mysteryCoins +
		(input.sessionRunBonusCoins ?? 0) +
		(input.weekendBonusCoins ?? 0)
	);
};
