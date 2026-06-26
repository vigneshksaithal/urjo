export type LevelPathState = "completed" | "current" | "locked";

export type LevelPathNode = {
	level: number;
	state: LevelPathState;
};

type BuildLevelPathInput = {
	currentLevel: number;
	visibleLevels?: number;
};

const MIN_VISIBLE_LEVELS = 3;

export const buildLevelPath = ({
	currentLevel,
	visibleLevels = 7,
}: BuildLevelPathInput): LevelPathNode[] => {
	const safeCurrentLevel = Math.max(1, Math.floor(currentLevel));
	const safeVisibleLevels = Math.max(
		MIN_VISIBLE_LEVELS,
		Math.floor(visibleLevels),
	);
	return Array.from({ length: safeVisibleLevels }, (_, index) => {
		const level = safeCurrentLevel + index;
		return {
			level,
			state: getLevelState(level, safeCurrentLevel),
		};
	});
};

export const getNextPlayableLevel = (
	path: LevelPathNode[],
): LevelPathNode | null => {
	return path.find((level) => level.state === "current") ?? null;
};

const getLevelState = (
	level: number,
	currentLevel: number,
): LevelPathState => {
	if (level < currentLevel) return "completed";
	if (level === currentLevel) return "current";
	return "locked";
};
