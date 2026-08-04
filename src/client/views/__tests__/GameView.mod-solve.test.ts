// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount, type ComponentProps } from "svelte";
import type { Grid } from "../../../shared/types";
import GameView from "../GameView.svelte";

vi.mock("@devvit/web/client", () => ({
	navigateTo: vi.fn(),
	showLoginPrompt: vi.fn(),
	showToast: vi.fn(),
}));

const grid: Grid = [
	[
		{ color: null, number: null, locked: false, isLoading: false },
		{ color: "blue", number: null, locked: true, isLoading: false },
	],
	[
		{ color: null, number: null, locked: false, isLoading: false },
		{ color: null, number: null, locked: false, isLoading: false },
	],
];

const createProps = (
	overrides: Partial<ComponentProps<typeof GameView>> = {},
): ComponentProps<typeof GameView> => ({
	grid,
	gridSize: 2,
	isCompleted: false,
	streakData: {
		currentStreak: 3,
		longestStreak: 7,
		lastPlayedDate: "2026-07-14",
	},
	hasChallenged: false,
	challengeUrl: null,
	onCellChange: vi.fn(),
	onNextChallenge: vi.fn(),
	onRestart: vi.fn(),
	onChallenge: vi.fn(),
	onShareChallenge: vi.fn(),
	...overrides,
});

let app: ReturnType<typeof mount> | undefined;

const renderGame = (props: ComponentProps<typeof GameView>): void => {
	app = mount(GameView, { target: document.body, props });
	flushSync();
};

beforeEach(() => {
	document.body.innerHTML = "";
	Object.defineProperty(Element.prototype, "animate", {
		configurable: true,
		value: vi.fn(() => ({
			cancel: vi.fn(),
			finished: Promise.resolve(),
		})),
	});
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe(): void {}
			unobserve(): void {}
			disconnect(): void {}
		},
	);
});

afterEach(async () => {
	if (app) {
		await unmount(app);
		app = undefined;
	}
	vi.unstubAllGlobals();
	delete (Element.prototype as { animate?: unknown }).animate;
	document.body.innerHTML = "";
});

describe("GameView moderator solve control", () => {
	it("is hidden from non-moderators", () => {
		renderGame(createProps({ isMod: false }));

		expect(
			document.querySelector('[aria-label="Solve puzzle for moderator testing"]'),
		).toBeNull();
	});

	it("loads the protected solution and fills only editable cells", async () => {
		const onCellChange = vi.fn();
		const fetchMock = vi.fn(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						status: "success",
						data: { solution: "rbrb" },
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		),
		);
		vi.stubGlobal("fetch", fetchMock);
		renderGame(createProps({ isMod: true, onCellChange }));

		const solveButton = document.querySelector<HTMLButtonElement>(
			'[aria-label="Solve puzzle for moderator testing"]',
		);
		expect(solveButton).not.toBeNull();
		solveButton?.click();

		await vi.waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith("/api/game/mod-solution", {
				method: "POST",
			});
			expect(onCellChange).toHaveBeenCalledTimes(3);
		});
		expect(onCellChange.mock.calls).toEqual([
			[0, 0, "red"],
			[1, 0, "red"],
			[1, 1, "blue"],
		]);
	});
});
