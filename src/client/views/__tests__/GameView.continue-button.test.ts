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
	it("routes the completion Continue action directly to onNextChallenge", () => {
		const handlePrimaryCtaMatch = gameViewSource.match(
			/function handlePrimaryCta\(\): void \{([\s\S]*?)\n\t\}/,
		);

		expect(handlePrimaryCtaMatch).not.toBeNull();

		const handlePrimaryCtaBody = handlePrimaryCtaMatch?.[1] ?? "";

		expect(handlePrimaryCtaBody).toContain('void fireOnce(postId ?? "", "next-puzzle");');
		expect(handlePrimaryCtaBody).toContain("onNextChallenge();");
		expect(handlePrimaryCtaBody).not.toContain('if (id === "next-puzzle")');
		expect(handlePrimaryCtaBody).not.toContain("simplifiedCtas.primary.id");
	});

	it("wires victory comments through explicit confirmation before posting", () => {
		const actionButtonsStart = completionOverlaySource.indexOf("<!-- Action buttons -->");
		const actionButtonsSource = completionOverlaySource.slice(actionButtonsStart);

		expect(completionOverlaySource).toContain("Comment Your Victory");
		expect(completionOverlaySource).toContain("onCommentVictory");
		expect(completionOverlaySource).toContain("onChallenge");
		expect(completionOverlaySource).not.toContain("onChallengeAndContinue");
		expect(actionButtonsSource.indexOf("Comment Your Victory")).toBeLessThan(
			actionButtonsSource.indexOf("Continue"),
		);

		expect(gameViewSource).toContain("showVictoryCommentConfirm");
		expect(gameViewSource).toContain(
			"onCommentVictory={() => (showVictoryCommentConfirm = true)}",
		);
		expect(gameViewSource).toContain('fetch("/api/game/result-comment"');
		expect(gameViewSource).toContain("puzzleNumber,");
		expect(gameViewSource).toContain("timeTaken: Math.max(timeTaken ?? 0, 1)");
		expect(gameViewSource).toContain("Posts your victory publicly");
	});

	it("keeps Continue and Challenge together in the second success-screen row", () => {
		expect(completionOverlaySource).toContain('class="grid grid-cols-2 gap-3 w-full"');
		// Button text is conditional: {#if hasChallenged}✓ Challenge Created{:else}Challenge{/if}
		expect(completionOverlaySource).toMatch(/\{:else\}\s*Challenge\s*\{\/if\}/);
		expect(completionOverlaySource).toContain("border-white/70 text-white");
		expect(completionOverlaySource).toContain("bg-yellow-500 text-yellow-950");
		expect(gameViewSource).toContain("onChallenge={() => (showChallengeConfirm = true)}");
		expect(gameViewSource).not.toContain("showChallengeAndContinueConfirm");
		expect(gameViewSource).not.toContain("confirmChallengeAndContinue");
	});

	it("makes challenge post consent clear before posting as the user", () => {
		expect(gameViewSource).toContain("This posts a public challenge to Reddit");
		expect(gameViewSource).toContain("as u/");
		expect(gameViewSource).toContain("using an Urjo-generated title");
		expect(completionOverlaySource).not.toContain("Challenge title");
		expect(completionOverlaySource).not.toContain("Write your challenge title");
	});

	it("does not render the mystery box bonus reward modal after completion", () => {
		expect(gameViewSource).not.toContain("<MysteryBoxAnimation");
		expect(gameViewSource).not.toContain("showMysteryBoxOverlay");
	});
});
