import { describe, expect, it } from "vitest";
import { getElapsedSeconds } from "../elapsed-time";

describe("getElapsedSeconds", () => {
	it("floors fractional seconds instead of rounding up", () => {
		expect(getElapsedSeconds(1_000, 1_999)).toBe(0);
		expect(getElapsedSeconds(1_000, 2_000)).toBe(1);
		expect(getElapsedSeconds(1_000, 2_999)).toBe(1);
		expect(getElapsedSeconds(1_000, 3_000)).toBe(2);
	});

	it("never returns a negative duration", () => {
		expect(getElapsedSeconds(5_000, 4_999)).toBe(0);
	});
});
