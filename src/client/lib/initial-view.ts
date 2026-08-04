export type InitialView = "game" | "warmup-choice";

type InitialViewInput = {
    isChallenge: boolean;
    firstScreenAvailable: boolean;
    isFirstTimeUser: boolean;
    warmupChoiceAvailable: boolean;
    hasPlayedToday: boolean;
    variant: "A" | "B" | "C" | undefined;
};

export type InitialViewDecision = {
    view: InitialView;
    showOnboardingOverlay: boolean;
};

const GAME_WITHOUT_ONBOARDING: InitialViewDecision = {
    view: "game",
    showOnboardingOverlay: false,
};

export const getInitialView = (input: InitialViewInput): InitialViewDecision => {
    if (input.isChallenge) return GAME_WITHOUT_ONBOARDING;

    if (input.isFirstTimeUser) {
        if (input.warmupChoiceAvailable) {
            return {
                view: "warmup-choice",
                showOnboardingOverlay: false,
            };
        }
        return {
            view: "game",
            showOnboardingOverlay: true,
        };
    }

    const isEligible = !input.hasPlayedToday && input.firstScreenAvailable;
    if (!isEligible) return GAME_WITHOUT_ONBOARDING;

    if (input.variant === "C") {
        return {
            view: "game",
            showOnboardingOverlay: true,
        };
    }

    return GAME_WITHOUT_ONBOARDING;
};
