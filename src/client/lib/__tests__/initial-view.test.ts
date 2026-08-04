import { describe, expect, it } from "vitest";

import { getInitialView } from "../initial-view";

describe("getInitialView", () => {
    it("asks first-time players to choose between a warm-up and the advertised board", () => {
        expect(
            getInitialView({
                isChallenge: false,
                isFirstTimeUser: true,
                warmupChoiceAvailable: true,
                hasPlayedToday: false,
                variant: undefined,
                firstScreenAvailable: false,
            }),
        ).toEqual({
            view: "warmup-choice",
            showOnboardingOverlay: false,
        });
    });

    it("starts a first-time player in the real game with lightweight guidance", () => {
        expect(
            getInitialView({
                isChallenge: false,
                isFirstTimeUser: true,
                warmupChoiceAvailable: false,
                hasPlayedToday: false,
                variant: undefined,
                firstScreenAvailable: false,
            }),
        ).toEqual({
            view: "game",
            showOnboardingOverlay: true,
        });
    });

    it("starts challenge visitors directly without onboarding", () => {
        expect(
            getInitialView({
                isChallenge: true,
                isFirstTimeUser: true,
                warmupChoiceAvailable: true,
                hasPlayedToday: false,
                variant: "A",
                firstScreenAvailable: true,
            }),
        ).toEqual({
            view: "game",
            showOnboardingOverlay: false,
        });
    });

    it("starts eligible returning players directly in the inline game", () => {
        expect(
            getInitialView({
                isChallenge: false,
                isFirstTimeUser: false,
                warmupChoiceAvailable: false,
                hasPlayedToday: false,
                variant: "B",
                firstScreenAvailable: true,
            }),
        ).toEqual({
            view: "game",
            showOnboardingOverlay: false,
        });
    });

    it("uses the non-blocking overlay for eligible variant C players", () => {
        expect(
            getInitialView({
                isChallenge: false,
                isFirstTimeUser: false,
                warmupChoiceAvailable: false,
                hasPlayedToday: false,
                variant: "C",
                firstScreenAvailable: true,
            }),
        ).toEqual({
            view: "game",
            showOnboardingOverlay: true,
        });
    });

    it("skips acquisition screens after the player has acted today", () => {
        expect(
            getInitialView({
                isChallenge: false,
                isFirstTimeUser: false,
                warmupChoiceAvailable: false,
                hasPlayedToday: true,
                variant: "A",
                firstScreenAvailable: true,
            }),
        ).toEqual({
            view: "game",
            showOnboardingOverlay: false,
        });
    });
});
