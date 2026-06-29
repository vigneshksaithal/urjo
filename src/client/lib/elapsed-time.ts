export const getElapsedSeconds = (
	startTimeMs: number,
	nowMs: number = Date.now(),
): number => Math.max(Math.floor((nowMs - startTimeMs) / 1000), 0);
