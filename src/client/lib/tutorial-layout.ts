import { computeBoardSize } from "./board-layout";

type TutorialLayout = {
	boardSize: number;
};

const clamp = (value: number, min: number, max: number): number => {
	return Math.min(max, Math.max(min, value));
};

export const computeTutorialSideInset = (availableWidth: number): number => {
	return clamp(Math.round(availableWidth * 0.2), 60, 108);
};

export const computeTutorialLayout = (
	availableWidth: number,
	availableHeight: number,
): TutorialLayout => {
	const boardSize = computeBoardSize(
		Math.max(0, availableWidth - computeTutorialSideInset(availableWidth)),
		availableHeight,
	);

	return {
		boardSize,
	};
};
