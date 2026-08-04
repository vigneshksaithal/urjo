const INLINE_POST_MAX_HEIGHT = 512;

export const shouldCompactInlineBoard = (
	gridSize: number,
	postHeight: number,
): boolean => {
	return gridSize >= 8 && postHeight > 0 && postHeight <= INLINE_POST_MAX_HEIGHT;
};
