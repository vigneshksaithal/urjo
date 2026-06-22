import { computeBoardSize } from "./board-layout";

type TutorialLayout = {
	boardSize: number;
	handWidth: number;
	handOffset: number;
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
		handWidth: clamp(Math.round(boardSize * 0.42), 108, 152),
		handOffset: clamp(Math.round(boardSize * 0.09), 18, 28),
	};
};
