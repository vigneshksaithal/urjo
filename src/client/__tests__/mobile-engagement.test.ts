import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const readClientFile = (path: string): string =>
	readFileSync(join(process.cwd(), "src/client", path), "utf-8");

const appCss = readClientFile("app.css");
const app = readClientFile("App.svelte");
const cell = readClientFile("components/Cell.svelte");
const tutorialView = readClientFile("views/TutorialView.svelte");
const tutorialWalkthrough = readClientFile("lib/tutorial-walkthrough.ts");
const gameView = readClientFile("views/GameView.svelte");
const completionOverlay = readClientFile("components/CompletionOverlay.svelte");
const levelPath = readClientFile("components/LevelPathOverlay.svelte");
const challengeComposer = readClientFile("components/ChallengeComposer.svelte");
const settingsSheet = readClientFile("components/SettingsSheet.svelte");
const analyticsDashboard = readClientFile(
	"components/AnalyticsDashboard.svelte",
);

describe("mobile Hooked loop", () => {
	it("gives the app a complete dynamic viewport height chain", () => {
		expect(appCss).toContain("html,");
		expect(appCss).toContain("body,");
		expect(appCss).toContain("#app");
		expect(appCss).toContain("height: 100%;");
		expect(appCss).toContain("min-height: 100dvh;");
	});

	it("loads the playable board without a blocking inline launcher", () => {
		expect(app).not.toMatch(/<FirstScreen(?:\s|\/|>)/);
		expect(app).not.toContain('"first-screen"');
	});

	it("uses tap-only cells without preventing natural feed scrolling", () => {
		expect(cell).toContain("onclick={handleCellClick}");
		expect(cell).toContain("touch-manipulation");
		expect(cell).not.toContain("SWIPE_THRESHOLD");
		expect(cell).not.toContain("setPointerCapture");
		expect(cell).not.toContain("touch-none");
	});

	it("maximizes 8×8 board width for mobile-sized tap targets", () => {
		expect(gameView).toContain("class:px-1={gridSize >= 8}");
		expect(gameView).toContain("class:px-3={gridSize < 8}");
	});

	it("measures inline onboarding without an obsolete launcher-tap funnel", () => {
		expect(analyticsDashboard).toContain("Inline Onboarding Test");
		expect(analyticsDashboard).toContain("A · Direct");
		expect(analyticsDashboard).toContain("C · Guide");
		expect(analyticsDashboard).not.toContain("Screen Tap%");
	});

	it("teaches the real tap-to-cycle interaction with step progress", () => {
		expect(tutorialWalkthrough).not.toContain("Double-tap");
		expect(tutorialWalkthrough).toContain("Tap again to change the color");
		expect(tutorialView).toContain("Step {stepIndex + 1} of {TOTAL_WALKTHROUGH_STEPS}");
	});

	it("makes progression and settings reachable with mobile tap targets", () => {
		expect(gameView).toContain("showLeaderboard = true");
		expect(gameView).toContain("showAchievements = true");
		expect(gameView).toContain("min-h-11 min-w-11");
		expect(gameView).not.toContain("<GridSizeSelector");
	});

	it("separates progression from Reddit posting on the result screen", () => {
		expect(completionOverlay).toContain("Post comment");
		expect(completionOverlay).not.toContain("Comment and Continue");
		expect(completionOverlay).toContain("Continue");
		expect(completionOverlay).toContain("Post publicly in the score thread");
		expect(completionOverlay).toContain("Coins");
		expect(completionOverlay).toContain("grid-cols-2");
		expect(completionOverlay).toContain("Streak");
		expect(completionOverlay).not.toContain("Tomorrow:");
		expect(completionOverlay).not.toContain("streakForecast");
		expect(completionOverlay).toContain('completionPending ? "—"');
		expect(completionOverlay).not.toContain("Verifying result");
		expect(completionOverlay).not.toContain("Unranked result");
		expect(app).toContain("void startServerTimer();");
		expect(app).not.toContain("timerStartRequest");
	});

	it("shows completed journey nodes as completed rather than locked", () => {
		expect(levelPath).toContain("level.state === \"completed\"");
		expect(levelPath).toContain("<Check");
	});

	it("previews the explicit Reddit challenge action", () => {
		expect(challengeComposer).toContain("DEFAULT_CHALLENGE_TITLE");
		expect(challengeComposer).toContain("Creates a Reddit challenge post");
		expect(challengeComposer).toContain("Puzzle #{puzzleNumber}");
		expect(challengeComposer).toContain("Solved in {timeTaken}s");
	});

	it("keeps tutorial height allocation inside the inline post frame", () => {
		expect(tutorialView).toContain(
			"relative h-full w-full flex flex-col overflow-hidden",
		);
	});

	it("keeps completion actions in a fixed footer", () => {
		expect(completionOverlay).toContain(
			"flex min-h-0 flex-1 flex-col items-center justify-start overflow-hidden",
		);
		expect(completionOverlay).toContain(
			"flex-none rounded-t-[28px] bg-[#2C2C2E] px-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
		);
	});

	it("keeps every settings option reachable in the capped bottom sheet", () => {
		expect(settingsSheet).toMatch(
			/flex-1 min-h-0 flex-col gap-2 overflow-y-auto/,
		);
	});

	it("keeps the challenge form usable when the mobile keyboard reduces height", () => {
		expect(challengeComposer).toContain("h-[100dvh]");
		expect(challengeComposer).toContain("flex-1 min-h-0 overflow-y-auto");
	});

	it("uses compact status chrome for 8×8 puzzles in tall inline posts", () => {
		expect(gameView).toContain("shouldCompactInlineBoard");
		expect(gameView).toContain('data-testid="compact-game-status"');
	});
});
