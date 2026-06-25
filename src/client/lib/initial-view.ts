export type InitialView = "game" | "tutorial" | "first-screen";

type InitialViewInput = {
    firstScreenAvailable: boolean;
    isFirstTimeUser: boolean;
    tutorialCompleted: boolean;
};

export const getInitialView = (input: InitialViewInput): InitialView => {
    if (input.firstScreenAvailable) return "first-screen";
    if (input.isFirstTimeUser && !input.tutorialCompleted) return "tutorial";
    return "game";
};
