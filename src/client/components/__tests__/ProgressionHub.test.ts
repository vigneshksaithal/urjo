import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const componentPath = join(
    process.cwd(),
    "src/client/components/ProgressionHub.svelte",
);

const componentSource = readFileSync(componentPath, "utf-8");

describe("ProgressionHub.svelte", () => {
    it("uses one focused daily-goal view instead of a dense progression dashboard", () => {
        expect(componentSource).toContain("Today’s goal");
        expect(componentSource).toContain("Daily quests");
        expect(componentSource).not.toContain("grid-cols-3 gap-2 text-center");
        expect(componentSource).not.toContain("Balance {snapshot.coins} coins");
    });

    it("renders mission rewards as large action targets", () => {
        expect(componentSource).toContain("min-h-20");
        expect(componentSource).toContain("Claim reward");
    });

    it("opens daily quests in a viewport-capped game sheet", () => {
        expect(componentSource).toContain('role="dialog"');
        expect(componentSource).toContain('aria-modal="true"');
        expect(componentSource).toContain("max-h-[calc(100dvh-1rem)]");
        expect(componentSource).toContain("rounded-t-[2rem]");
    });

    it("keeps the quest deck independently scrollable on short screens", () => {
        expect(componentSource).toContain('data-testid="quest-scroll-region"');
        expect(componentSource).toContain(
            "flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y",
        );
        expect(componentSource).toContain("[-webkit-overflow-scrolling:touch]");
    });

    it("keeps sheet chrome fixed while long quest content scrolls", () => {
        expect(componentSource).toContain('data-testid="quest-sheet-header"');
        expect(componentSource).toContain('data-testid="quest-sheet-footer"');
        expect(componentSource).toContain("shrink-0");
        expect(componentSource).toContain("pb-[max(0.75rem,env(safe-area-inset-bottom))]");
    });
});
