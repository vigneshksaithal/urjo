import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const gameViewPath = join(process.cwd(), "src/client/views/GameView.svelte");
const gameViewSource = readFileSync(gameViewPath, "utf-8");
const completionOverlayPath = join(
	process.cwd(),
	"src/client/components/CompletionOverlay.svelte",
);
const completionOverlaySource = readFileSync(completionOverlayPath, "utf-8");
const resultCardPath = join(
	process.cwd(),
	"src/client/components/ResultCard.svelte",
);
const resultCardSource = readFileSync(resultCardPath, "utf-8");

describe("GameView.svelte continue button flow", () => {
	it("routes the completion Continue action to the level path first", () => {
		const handlePrimaryCtaMatch = gameViewSource.match(
			/function handlePrimaryCta\(\): void \{([\s\S]*?)\n\t\}/,
		);

		expect(handlePrimaryCtaMatch).not.toBeNull();

		const handlePrimaryCtaBody = handlePrimaryCtaMatch?.[1] ?? "";

		expect(handlePrimaryCtaBody).toContain("showLevelPath = true;");
		expect(handlePrimaryCtaBody).not.toContain("onNextChallenge();");
	});

	it("starts the next puzzle only after the playable level is tapped", () => {
		const handleLevelSelectMatch = gameViewSource.match(
			/function handleLevelSelect\(\): void \{([\s\S]*?)\n\t\}/,
		);

		expect(handleLevelSelectMatch).not.toBeNull();

		const handleLevelSelectBody = handleLevelSelectMatch?.[1] ?? "";

		expect(handleLevelSelectBody).toContain('void fireOnce(postId ?? "", "next-puzzle");');
		expect(handleLevelSelectBody).toContain("showLevelPath = false;");
		expect(handleLevelSelectBody).toContain("onNextChallenge();");
		expect(handleLevelSelectBody).not.toContain('if (id === "next-puzzle")');
		expect(handleLevelSelectBody).not.toContain("simplifiedCtas.primary.id");
	});

	it("renders the optional victory comment separately from continuing", () => {
		expect(gameViewSource).not.toContain('import VictoryCommentComposer from "../components/VictoryCommentComposer.svelte";');
		expect(gameViewSource).not.toContain("let showVictoryCommentComposer = $state(false);");
		expect(gameViewSource).toContain("onCommentVictory={submitVictoryComment}");
		expect(gameViewSource).not.toContain("<VictoryCommentComposer");
		expect(gameViewSource).toContain('fetch("/api/game/result-comment"');
		expect(gameViewSource).toContain('commentMessage');
		expect(gameViewSource).not.toContain("showVictoryCommentComposer = $state(false);");
		expect(completionOverlaySource).toContain("Post comment");
		expect(completionOverlaySource).not.toContain("Comment and Continue");
		expect(completionOverlaySource).toContain("onCommentVictory");
		expect(completionOverlaySource).toContain("Comment");
		expect(completionOverlaySource).toContain('bind:value={commentMessage}');
		expect(completionOverlaySource).toContain('placeholder="Add an optional message"');
		expect(completionOverlaySource).toContain("<input");
		expect(completionOverlaySource).toContain('type="text"');
		expect(completionOverlaySource).not.toContain("textarea");
		expect(completionOverlaySource).toContain("onChallenge");
		expect(completionOverlaySource).not.toContain("onChallengeAndContinue");
	});

	it("keeps commenting primary while progression remains separate", () => {
		expect(completionOverlaySource).toContain("Continue");
		expect(completionOverlaySource).toContain("Post comment");
		expect(completionOverlaySource).toContain(">Challenge<");
		expect(completionOverlaySource).toMatch(/>\s*Open rival\s*</);
		expect(completionOverlaySource).toContain('"Share rival"');
		expect(completionOverlaySource).toContain('data-action-priority="comment-challenge-create-continue"');
		expect(completionOverlaySource).toContain("Post publicly in the score thread");
		expect(gameViewSource).toContain("onChallenge={requestChallenge}");
		expect(gameViewSource).not.toContain("showChallengeAndContinueConfirm");
		expect(gameViewSource).not.toContain("confirmChallengeAndContinue");
	});

	it("keeps Continue in a fixed result footer", () => {
		expect(completionOverlaySource).toContain(
			'<footer aria-label="Completion actions" data-action-priority="comment-challenge-create-continue" class="flex-none rounded-t-[28px] bg-[#2C2C2E] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">',
		);
		expect(completionOverlaySource).toContain(
			'<main class="flex min-h-0 flex-1 flex-col items-center justify-start overflow-hidden px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] text-center">',
		);
	});

	it("keeps the comment form with the result actions", () => {
		expect(completionOverlaySource).toContain('aria-label="Completion actions"');
		expect(completionOverlaySource).toContain('id="victory-comment"');
	});

	it("sends only the server completion receipt from both comment entry points", () => {
		expect(gameViewSource).toContain("completionId,");
		expect(gameViewSource).not.toContain("colorGrid: buildVictoryColorGrid");
		expect(gameViewSource).not.toContain("mistakes,");
		expect(resultCardSource).toContain("JSON.stringify({ completionId })");
		expect(resultCardSource).not.toContain("JSON.stringify(resultCardData)");
	});

	it("makes challenge post consent clear before posting as the user", () => {
		expect(completionOverlaySource).toContain('import ChallengeComposer from "./ChallengeComposer.svelte";');
		expect(completionOverlaySource).toContain("<ChallengeComposer");
		expect(completionOverlaySource).toContain("isOpen={showChallengeComposer}");
		expect(completionOverlaySource).toContain('onClose={() => (showChallengeComposer = false)}');
		expect(completionOverlaySource).toContain("onSubmit={submitChallenge}");
		expect(completionOverlaySource).not.toContain("Challenge title");
		expect(completionOverlaySource).not.toContain("Beat my time if you can!");
		expect(completionOverlaySource).not.toContain("maxlength=\"120\"");
		expect(gameViewSource).toContain("onChallenge={requestChallenge}");
	});

	it("does not render the mystery box bonus reward modal after completion", () => {
		expect(gameViewSource).not.toContain("<MysteryBoxAnimation");
		expect(gameViewSource).not.toContain("showMysteryBoxOverlay");
	});

	it("renders the level path as the post-completion interstitial", () => {
		expect(gameViewSource).toContain('import LevelPathOverlay from "../components/LevelPathOverlay.svelte";');
		expect(gameViewSource).toContain("let showLevelPath = $state(false);");
		expect(gameViewSource).toContain("{#if showLevelPath}");
		expect(gameViewSource).toContain("<LevelPathOverlay");
		expect(gameViewSource).toContain("isOpen={true}");
		expect(gameViewSource).toContain("currentLevel={pathLevel}");
		expect(gameViewSource).toContain("onLevelSelect={handleLevelSelect}");
	});
});
