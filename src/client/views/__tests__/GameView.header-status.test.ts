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

const createGrid = (): Grid => [
	[
		{ color: null, number: null, locked: false, isLoading: false },
		{ color: null, number: null, locked: false, isLoading: false },
	],
	[
		{ color: null, number: null, locked: false, isLoading: false },
		{ color: null, number: null, locked: false, isLoading: false },
	],
];

const baseProps: ComponentProps<typeof GameView> = {
	grid: createGrid(),
	gridSize: 2,
	isCompleted: false,
	streakData: {
		currentStreak: 3,
		longestStreak: 7,
		lastPlayedDate: "2026-06-29",
	},
	hasChallenged: false,
	challengeUrl: null,
	coins: 25,
	liveElapsedSeconds: 12,
	onCellChange: vi.fn(),
	onNextChallenge: vi.fn(),
	onRestart: vi.fn(),
	onChallenge: vi.fn(),
};

let app: ReturnType<typeof mount> | undefined;

const renderGameView = (
	props: Partial<ComponentProps<typeof GameView>> = {},
): void => {
	app = mount(GameView, {
		target: document.body,
		props: {
			...baseProps,
			...props,
		},
	});
	flushSync();
};

beforeEach(() => {
	document.body.innerHTML = "";
	vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null))));
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
	document.body.innerHTML = "";
});

describe("GameView header status", () => {
	it("shows the timer to logged-out players without showing account-only streak UI", () => {
		renderGameView({
			isLoggedIn: false,
			coins: undefined,
		});

		expect(
			document.querySelector('[aria-label="12 seconds elapsed"]'),
		).not.toBeNull();
		expect(document.body.textContent).toContain("12s");
		expect(document.body.textContent).not.toContain("3 Days");
		expect(document.body.textContent).toContain("Sign in to save");
	});

	it("shows both timer and streak to logged-in players", () => {
		renderGameView({
			isLoggedIn: true,
			coins: 25,
		});

		expect(
			document.querySelector('[aria-label="12 seconds elapsed"]'),
		).not.toBeNull();
		expect(document.body.textContent).toMatch(/3\s*Days/);
		expect(document.body.textContent).toContain("12s");
	});
});
