// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount, type ComponentProps } from "svelte";

import TutorialView from "../TutorialView.svelte";

const baseProps: ComponentProps<typeof TutorialView> = {
	onComplete: vi.fn(),
};

let app: ReturnType<typeof mount> | undefined;

const renderTutorialView = (
	props: Partial<ComponentProps<typeof TutorialView>> = {},
): void => {
	app = mount(TutorialView, {
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

describe("TutorialView guidance indicator", () => {
	it("does not render a hand image or arrow guide", () => {
		renderTutorialView();

		expect(document.querySelector('[data-tutorial-arrow="true"]')).toBeNull();
		expect(document.querySelector("img")).toBeNull();
	});

	it("renders the instruction in a dedicated top overlay area", () => {
		renderTutorialView();

		const instruction = document.querySelector(
			'[data-tutorial-instruction="top"]',
		);
		const headline = document.querySelector(
			'[data-tutorial-headline="compact"]',
		);
		expect(instruction).not.toBeNull();
		expect(headline).not.toBeNull();
		expect(instruction?.textContent).toContain("glowing");
		expect(instruction?.textContent).toContain("turn it blue");
	});

	it("renders a dedicated glow layer for the tutorial target cell", () => {
		renderTutorialView();

		expect(
			document.querySelector('[data-tutorial-glow="true"]'),
		).not.toBeNull();
		expect(
			document.querySelector('[data-tutorial-glow-halo="true"]'),
		).not.toBeNull();
		expect(
			document.querySelector('[data-tutorial-glow-ring="true"]'),
		).not.toBeNull();
		expect(
			document.querySelector('[data-tutorial-glow-spark="true"]'),
		).not.toBeNull();
	});

	it("stages the board with a dedicated spotlight shell", () => {
		renderTutorialView();

		expect(
			document.querySelector('[data-tutorial-stage="true"]'),
		).not.toBeNull();
		expect(
			document.querySelector('[data-tutorial-spotlight="true"]'),
		).not.toBeNull();
	});

	it("does not mark any tutorial arrow shape", () => {
		renderTutorialView();

		expect(
			document.querySelector('[data-tutorial-arrow-shape="refined"]'),
		).toBeNull();
	});
});
