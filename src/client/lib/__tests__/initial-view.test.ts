import { describe, expect, it } from "vitest";

import { getInitialView } from "../initial-view";

describe("getInitialView", () => {
    it("shows the first screen when the server provides one", () => {
        expect(
            getInitialView({
                firstScreenAvailable: true,
                isFirstTimeUser: true,
                tutorialCompleted: false,
            }),
        ).toBe("first-screen");
    });

    it("falls back to tutorial for first-time users without first-screen data", () => {
        expect(
            getInitialView({
                firstScreenAvailable: false,
                isFirstTimeUser: true,
                tutorialCompleted: false,
            }),
        ).toBe("tutorial");
    });

    it("shows the game for returning users", () => {
        expect(
            getInitialView({
                firstScreenAvailable: false,
                isFirstTimeUser: false,
                tutorialCompleted: true,
            }),
        ).toBe("game");
    });
});
