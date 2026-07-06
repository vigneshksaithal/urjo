import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const overlayPath = join(
	process.cwd(),
	"src/client/components/LevelPathOverlay.svelte",
);

const overlaySource = readFileSync(overlayPath, "utf-8");

describe("LevelPathOverlay.svelte", () => {
	it("sizes the level window from nodePositions.length instead of a hardcoded literal", () => {
		// The SVG path artwork is hand-drawn for exactly nodePositions.length
		// stops. If visibleLevels were hardcoded separately (e.g. to 3) and
		// nodePositions grew or shrank independently, extra nodes would stack
		// on the fallback position with no path to sit on. Deriving
		// visibleLevels from nodePositions.length keeps the two coupled.
		expect(overlaySource).toContain("visibleLevels: nodePositions.length");
		expect(overlaySource).not.toContain("visibleLevels: 3");
	});
});
