// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount, type ComponentProps } from "svelte";

import Cell from "../Cell.svelte";

let app: ReturnType<typeof mount> | undefined;

const renderCell = (
	props: Partial<ComponentProps<typeof Cell>> = {},
): { cell: HTMLElement; onChange: ReturnType<typeof vi.fn> } => {
	const onChange = vi.fn();
	app = mount(Cell, {
		target: document.body,
		props: {
			color: null,
			number: null,
			locked: false,
			isLoading: false,
			onChange,
			...props,
		},
	});
	flushSync();

	const cell = document.body.firstElementChild;
	if (!(cell instanceof HTMLElement)) throw new Error("Cell did not render");
	return { cell, onChange };
};

beforeEach(() => {
	document.body.innerHTML = "";
});

afterEach(async () => {
	if (app) await unmount(app);
	app = undefined;
	document.body.innerHTML = "";
});

describe("Cell interaction", () => {
	it("ignores taps while the board skeleton is loading", () => {
		const { cell, onChange } = renderCell({ isLoading: true });

		cell.click();

		expect(onChange).not.toHaveBeenCalled();
		expect(cell.getAttribute("role")).toBeNull();
	});

	it("advances one color on one tap", () => {
		const { cell, onChange } = renderCell();

		cell.click();

		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith("blue");
	});

	it("uses non-sticky CSS press feedback instead of pointer state", () => {
		const { cell } = renderCell();
		const idleClassName = cell.className;

		cell.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
		flushSync();

		expect(cell.className).toBe(idleClassName);
		expect(cell.className).toContain("active:scale-[0.91]");
	});
});
