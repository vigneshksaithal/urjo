import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const composerPath = join(
	process.cwd(),
	"src/client/components/ChallengeComposer.svelte",
);

const composerSource = readFileSync(composerPath, "utf-8");

describe("ChallengeComposer.svelte", () => {
	it("renders as a fullscreen challenge composer with a bare title field and submit bar", () => {
		expect(composerSource).toContain("fixed inset-0 z-[60]");
		expect(composerSource).toContain("CHALLENGE TITLE");
		expect(composerSource).toContain('placeholder=""');
		expect(composerSource).toContain('maxlength="120"');
		expect(composerSource).toContain("POST CHALLENGE");
		expect(composerSource).toContain("onClose");
		expect(composerSource).toContain("onSubmit");
		expect(composerSource).toContain("input");
		expect(composerSource).toContain("focusTrap");
		expect(composerSource).not.toContain("Create a challenge title");
		expect(composerSource).not.toContain("Challenge title");
		expect(composerSource).not.toContain("Added automatically:");
		expect(composerSource).not.toContain("Beat my time if you can!");
		expect(composerSource).not.toContain("defaultChallengeTitle");
		expect(composerSource).not.toContain("rounded-[1.1rem]");
		expect(composerSource).not.toContain("bg-white/8");
	});

	it("clears the draft title on open and falls back to the default title when blank", () => {
		// onMount only fires once per component instance, so re-opening the
		// composer without unmounting it would show stale text left over from a
		// previous open. Resetting must be reactive to `isOpen`.
		expect(composerSource).not.toContain("onMount");
		expect(composerSource).toMatch(
			/\$effect\(\(\) => \{\s*if \(isOpen\) \{\s*challengeTitle = "";/,
		);
		expect(composerSource).toContain("DEFAULT_CHALLENGE_TITLE");
		expect(composerSource).toContain(
			"trimmed.length > 0 ? trimmed : DEFAULT_CHALLENGE_TITLE",
		);
	});
});
