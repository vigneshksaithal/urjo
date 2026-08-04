import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(join(process.cwd(), "src/client/App.svelte"), "utf-8");

describe("App growth Pareto wiring", () => {
	it("uses the centralized initial-view decision instead of a mandatory tutorial branch", () => {
		expect(appSource).toContain("getInitialView(");
		expect(appSource).not.toContain('currentView = "tutorial"');
	});

	it("starts Journey telemetry on the first real cell only", () => {
		expect(appSource).toContain("urjoJourney.beginPuzzle(gridSize)");
		expect(appSource).not.toContain('urjoJourney.startPlay("first_screen")');
	});

	it("keeps Rival creation and native sharing as two explicit actions", () => {
		const createStart = appSource.indexOf("async function handleChallenge")
		const shareStart = appSource.indexOf("async function handleShareChallenge")
		const nextStart = appSource.indexOf("async function handleNextChallenge")

		expect(createStart).toBeGreaterThan(-1)
		expect(shareStart).toBeGreaterThan(createStart)
		expect(appSource.slice(createStart, shareStart)).not.toContain("showShareSheet")
		expect(appSource.slice(shareStart, nextStart)).toContain("showShareSheet")
		expect(appSource).toContain("challengePostId = data.postId")
	});
});
