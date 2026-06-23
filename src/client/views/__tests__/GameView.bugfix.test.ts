/**
 * Bug condition exploration test for missing showAchievements state variable.
 *
 * **Validates: Requirements 2.1, 2.2**
 *
 * This test verifies the bug condition: GameView.svelte references showAchievements
 * in its template but does not declare it in the script section.
 *
 * **IMPORTANT**: This test is expected to FAIL on unfixed code. The failure
 * (detecting the missing declaration) confirms the bug exists.
 *
 * After the fix is applied, this test will PASS, confirming the bug is fixed.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Read the GameView.svelte source code
const gameViewPath = join(process.cwd(), "src/client/views/GameView.svelte");
const gameViewSource = readFileSync(gameViewPath, "utf-8");

// ============================================================================
// TASK 1: Bug Condition Exploration Tests
// ============================================================================

describe("GameView.svelte - Bug Condition: showAchievements state variable", () => {
	it("declares showAchievements state variable when it is used in the template", () => {
		// Check that showAchievements is used in the template
		const templateUsagePattern = /isOpen=\{showAchievements\}/;
		const templateUsesShowAchievements = templateUsagePattern.test(gameViewSource);
		expect(templateUsesShowAchievements).toBe(true);

		// Check that showAchievements is declared in the script section
		// The declaration should follow the pattern: let showAchievements = $state(false);
		const declarationPattern = /let\s+showAchievements\s*=\s*\$state\s*\(/;
		const hasDeclaration = declarationPattern.test(gameViewSource);

		// This assertion will FAIL on unfixed code (bug exists)
		// and PASS after the fix is applied
		expect(hasDeclaration).toBe(true);
	});

	it("initializes showAchievements to false", () => {
		// Check that showAchievements is initialized to false
		const initPattern = /let\s+showAchievements\s*=\s*\$state\s*\(\s*false\s*\)/;
		const isInitializedToFalse = initPattern.test(gameViewSource);

		expect(isInitializedToFalse).toBe(true);
	});

	it("places showAchievements declaration alongside other modal state variables", () => {
		// Verify that other modal state variables exist (preservation check)
		const otherModalStates = [
			"showLeaderboard",
			"showSettings",
			"showModPreview",
		];

		for (const varName of otherModalStates) {
			const pattern = new RegExp(`let\\s+${varName}\\s*=\\s*\\$state\\s*\\(`);
			expect(pattern.test(gameViewSource)).toBe(true);
		}

		// Verify showAchievements follows the same pattern
		const showAchievementsPattern = /let\s+showAchievements\s*=\s*\$state\s*\(/;
		expect(showAchievementsPattern.test(gameViewSource)).toBe(true);
	});
});

// ============================================================================
// TASK 2: Preservation Property Tests
// ============================================================================

/**
 * Preservation tests verify that existing modal state variables continue to work correctly.
 * These tests should PASS on unfixed code (confirming baseline behavior to preserve).
 *
 * **Validates: Requirements 3.1, 3.2**
 */

describe("GameView.svelte - Preservation: Existing modal state behavior", () => {
	it("declares showLeaderboard state variable with correct pattern", () => {
		const pattern = /let\s+showLeaderboard\s*=\s*\$state\s*\(\s*false\s*\)/;
		expect(pattern.test(gameViewSource)).toBe(true);
	});

	it("declares showSettings state variable with correct pattern", () => {
		const pattern = /let\s+showSettings\s*=\s*\$state\s*\(\s*false\s*\)/;
		expect(pattern.test(gameViewSource)).toBe(true);
	});

	it("declares showModPreview state variable with correct pattern", () => {
		const pattern = /let\s+showModPreview\s*=\s*\$state\s*\(\s*false\s*\)/;
		expect(pattern.test(gameViewSource)).toBe(true);
	});

	it("uses showLeaderboard in LeaderboardModal component", () => {
		const pattern = /isOpen=\{showLeaderboard\}/;
		expect(pattern.test(gameViewSource)).toBe(true);
	});

	it("uses showSettings in SettingsSheet component", () => {
		const pattern = /isOpen=\{showSettings\}/;
		expect(pattern.test(gameViewSource)).toBe(true);
	});

	it("uses showModPreview in ModPreviewPanel component", () => {
		// ModPreviewPanel uses {#if isMod} block with showModPreview
		const pattern = /onShowModPreview=\{\(\)\s*=>\s*\(showModPreview\s*=\s*true\)\}/;
		expect(pattern.test(gameViewSource)).toBe(true);
	});

	it("does not render the season strip banner", () => {
		expect(gameViewSource).not.toContain("SeasonStrip");
		expect(gameViewSource).not.toContain("showSeasonLeaderboard");
	});

	it("has close handler for showLeaderboard that sets it to false", () => {
		const pattern = /onClose=\{\(\)\s*=>\s*\(showLeaderboard\s*=\s*false\)\}/;
		expect(pattern.test(gameViewSource)).toBe(true);
	});

	it("has close handler for showSettings that sets it to false", () => {
		const pattern = /onClose=\{\(\)\s*=>\s*\(showSettings\s*=\s*false\)\}/;
		expect(pattern.test(gameViewSource)).toBe(true);
	});

});
