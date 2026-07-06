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

	it("wires victory comments through explicit confirmation before posting", () => {
		expect(gameViewSource).toContain('import VictoryCommentComposer from "../components/VictoryCommentComposer.svelte";');
		expect(gameViewSource).toContain("let showVictoryCommentComposer = $state(false);");
		expect(gameViewSource).toContain(
			"onCommentVictory={() => (showVictoryCommentComposer = true)}",
		);
		expect(gameViewSource).toContain('<VictoryCommentComposer');
		expect(gameViewSource).toContain('isOpen={showVictoryCommentComposer}');
		expect(gameViewSource).toContain('onClose={() => (showVictoryCommentComposer = false)}');
		expect(gameViewSource).toContain('onSubmit={submitVictoryComment}');
		expect(gameViewSource).toContain('fetch("/api/game/result-comment"');
		expect(gameViewSource).toContain('commentMessage');
		expect(gameViewSource).not.toContain("showVictoryCommentConfirm");
		expect(gameViewSource).not.toContain("ConfirmDialog");
		expect(completionOverlaySource).toContain("Comment Your Victory");
		expect(completionOverlaySource).toContain("onCommentVictory");
		expect(completionOverlaySource).toContain("onChallenge");
		expect(completionOverlaySource).not.toContain("onChallengeAndContinue");
	});

	it("keeps Continue and Challenge together in the second success-screen row", () => {
		expect(completionOverlaySource).toContain('class="grid grid-cols-2 gap-3 w-full"');
		// Button text is conditional: {#if hasChallenged}✓ Challenge Created{:else}Challenge{/if}
		expect(completionOverlaySource).toMatch(/\{:else\}\s*Challenge\s*\{\/if\}/);
		expect(completionOverlaySource).toContain("border-white/60 text-white");
		expect(completionOverlaySource).toContain("bg-yellow-500 text-yellow-950");
		expect(gameViewSource).toContain("onChallenge={requestChallenge}");
		expect(gameViewSource).not.toContain("showChallengeAndContinueConfirm");
		expect(gameViewSource).not.toContain("confirmChallengeAndContinue");
	});

	it("makes challenge post consent clear before posting as the user", () => {
		expect(completionOverlaySource).toContain('import ChallengeComposer from "./ChallengeComposer.svelte";');
		expect(completionOverlaySource).toContain("<ChallengeComposer");
		expect(completionOverlaySource).toContain("isOpen={showChallengeComposer}");
		expect(completionOverlaySource).toContain('onClose={closeChallengeComposer}');
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
