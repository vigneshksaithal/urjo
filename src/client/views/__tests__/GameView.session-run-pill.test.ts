import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const gameViewPath = join(process.cwd(), "src/client/views/GameView.svelte");
const gameViewSource = readFileSync(gameViewPath, "utf-8");

describe("GameView.svelte session run pill", () => {
	it("does not show the in-a-row status pill on the game screen", () => {
		expect(gameViewSource).not.toContain("{sessionRun} in a row");
		expect(gameViewSource).not.toContain(
			'title="Keep playing for bigger coin bonuses"',
		);
	});
});
