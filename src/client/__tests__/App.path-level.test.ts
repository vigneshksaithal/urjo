import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const appPath = join(process.cwd(), "src/client/App.svelte");
const appSource = readFileSync(appPath, "utf-8");

describe("App.svelte path level plumbing", () => {
	it("hydrates pathLevel from game state separately from skillLevel", () => {
		expect(appSource).toContain("let pathLevel = $state(1);");
		expect(appSource).toContain("pathLevel = data.pathLevel;");
		expect(appSource).toContain("skillLevel = data.skillLevel;");
	});

	it("updates pathLevel from completion response", () => {
		expect(appSource).toContain('typeof data.pathLevel === "number"');
		expect(appSource).toContain("pathLevel = data.pathLevel;");
	});

	it("passes pathLevel into GameView", () => {
		expect(appSource).toMatch(/@const gameProps = \{[\s\S]*\n\s+pathLevel,/);
	});
});
