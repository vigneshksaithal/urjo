import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const composerPath = join(
	process.cwd(),
	"src/client/components/ChallengeComposer.svelte",
);

const composerSource = readFileSync(composerPath, "utf-8");

describe("ChallengeComposer.svelte", () => {
	it("renders a fullscreen challenge preview with explicit Reddit consent", () => {
		expect(composerSource).toContain("fixed inset-0 z-[60]");
		expect(composerSource).toContain("CHALLENGE A PLAYER");
		expect(composerSource).toContain("Creates a Reddit challenge post");
		expect(composerSource).toContain("Puzzle #{puzzleNumber}");
		expect(composerSource).toContain("Solved in {timeTaken}s");
		expect(composerSource).toContain('maxlength="120"');
		expect(composerSource).toContain("POST CHALLENGE");
		expect(composerSource).toContain("onClose");
		expect(composerSource).toContain("onSubmit");
		expect(composerSource).toContain("input");
		expect(composerSource).toContain("focusTrap");
		expect(composerSource).not.toContain("Create a challenge title");
		expect(composerSource).not.toContain("Added automatically:");
		expect(composerSource).not.toContain("Beat my time if you can!");
		expect(composerSource).not.toContain("defaultChallengeTitle");
		expect(composerSource).not.toContain("rounded-[1.1rem]");
		expect(composerSource).not.toContain("bg-white/8");
	});

	it("prefills a fresh default title whenever the composer opens", () => {
		// onMount only fires once per component instance, so re-opening the
		// composer without unmounting it would show stale text left over from a
		// previous open. Resetting must be reactive to `isOpen`.
		expect(composerSource).not.toContain("onMount");
		expect(composerSource).toMatch(
			/\$effect\(\(\) => \{\s*if \(isOpen\) \{\s*challengeTitle = DEFAULT_CHALLENGE_TITLE;/,
		);
		expect(composerSource).toContain("DEFAULT_CHALLENGE_TITLE");
		expect(composerSource).toContain(
			"trimmed.length > 0 ? trimmed : DEFAULT_CHALLENGE_TITLE",
		);
	});
});
