export const getElapsedSeconds = (
	startTimeMs: number,
	nowMs: number = Date.now(),
): number => Math.max(Math.floor((nowMs - startTimeMs) / 1000), 0);

export const getCompletedSeconds = (
	startTimeMs: number,
	nowMs: number = Date.now(),
): number => Math.max(getElapsedSeconds(startTimeMs, nowMs), 1);
