import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const overlayPath = join(
	process.cwd(),
	"src/client/components/LevelPathOverlay.svelte",
);

const overlaySource = readFileSync(overlayPath, "utf-8");

describe("LevelPathOverlay.svelte", () => {
	it("sizes the level window from a named display constant", () => {
		expect(overlaySource).toContain("const VISIBLE_LEVEL_COUNT = 3");
		expect(overlaySource).toContain("visibleLevels: VISIBLE_LEVEL_COUNT");
	});

	it("labels the endless path separately from skill levels", () => {
		expect(overlaySource).toContain("Journey");
		expect(overlaySource).not.toContain("Level {props.currentLevel}");
	});

	it("uses a completion mark for completed nodes", () => {
		expect(overlaySource).toContain('level.state === "completed"');
		expect(overlaySource).toContain("<Check");
	});

	it("uses the Urjo dark progression design without decorative scenery", () => {
		expect(overlaySource).toContain('bg-[#1C1C1E]');
		expect(overlaySource).toContain('bg-[#2C2C2E]');
		expect(overlaySource).toContain('bg-[#2563EB]');
		expect(overlaySource).toContain('pt-[max(1rem,env(safe-area-inset-top))]');
		expect(overlaySource).toContain('Play level');
		expect(overlaySource).not.toContain('linear-gradient');
		expect(overlaySource).not.toContain('border-');
		expect(overlaySource).not.toContain('orange-');
		expect(overlaySource).not.toContain('⛺');
		expect(overlaySource).not.toContain('🏝️');
		expect(overlaySource).not.toContain('🎁');
	});
});
