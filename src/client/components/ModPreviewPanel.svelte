<script lang="ts">
    import { fly, fade } from "svelte/transition";
    import { cubicOut } from "svelte/easing";
    import GameView from "../views/GameView.svelte";
    import AchievementsPanel from "./AchievementsPanel.svelte";
    import LeaderboardModal from "./LeaderboardModal.svelte";
    import { deserializeGrid } from "../lib/utils";
    import type { Grid, StreakData } from "../../shared/types";
    import type { EngagementCompletionData } from "../../shared/engagement-types";
    import Grid2x2 from "lucide-svelte/icons/grid-2x2";
    import Grid3x3 from "lucide-svelte/icons/grid-3x3";
    import LayoutGrid from "lucide-svelte/icons/layout-grid";
    import Trophy from "lucide-svelte/icons/trophy";
    import Medal from "lucide-svelte/icons/medal";
    import BarChart2 from "lucide-svelte/icons/bar-chart-2";
    import Microscope from "lucide-svelte/icons/microscope";

    type Icon = typeof Grid2x2;

    type Props = {
        isOpen: boolean;
        onClose: () => void;
    };

    let { isOpen, onClose }: Props = $props();

    // ─── Mock data ───────────────────────────────────────────────────────────

    const MOCK_STREAK: StreakData = {
        currentStreak: 7,
        longestStreak: 14,
        lastPlayedDate: null,
    };

    const MOCK_ENGAGEMENT: EngagementCompletionData = {
        variableReward: { bonusMultiplier: null, mysteryBox: null },
        newAchievements: [],
        streakMilestone: null,
    };

    function buildColors(size: number): string {
        return Array.from({ length: size * size }, (_, i) =>
            i % 2 === 0 ? "r" : "b",
        ).join("");
    }

    function buildNumbers(size: number): string {
        const chars = new Array<string>(size * size).fill("-");
        chars[2] = "3";
        chars[size + 3] = "2";
        return chars.join("");
    }

    function buildGrid(size: number): Grid {
        const colors = buildColors(size);
        const numbers = buildNumbers(size);
        return deserializeGrid(colors, numbers, colors, size).map((row) =>
            row.map((cell) => ({ ...cell, isLoading: false })),
        );
    }

    // ─── Preview modes ───────────────────────────────────────────────────────

    type PreviewMode =
        | { kind: "game"; gridSize: 4 | 6 | 8 }
        | { kind: "completion"; gridSize: 4 | 6 | 8 }
        | { kind: "achievements" }
        | { kind: "leaderboard" };

    let preview = $state<PreviewMode | null>(null);

    function open(mode: PreviewMode): void {
        preview = mode;
    }

    function close(): void {
        preview = null;
    }

    const previewGridSize = $derived(
        preview?.kind === "game" || preview?.kind === "completion"
            ? preview.gridSize
            : 4,
    );
    const previewGrid = $derived(buildGrid(previewGridSize));
    const previewColors = $derived(buildColors(previewGridSize));
    const previewCompleted = $derived(preview?.kind === "completion");

    // Spread object avoids passing `undefined` explicitly for optional props
    // when exactOptionalPropertyTypes is enabled.
    const gameViewProps = $derived({
        grid: previewGrid,
        gridSize: previewGridSize,
        isCompleted: previewCompleted,
        streakData: MOCK_STREAK,
        hasChallenged: false as const,
        challengeUrl: null as null,
        coins: 240,
        timeTaken: 42,
        mistakes: 0,
        username: "mod_preview",
        isLoggedIn: true,
        isMod: true,
        skillLevel: 3,
        puzzleNumber: 1,
        seasonRank: 5,
        seasonPoints: 420,
        sessionRun: previewCompleted ? 2 : 0,
        sessionRunMultiplier: 1.1,
        onCellChange: () => {},
        onNextChallenge: close,
        onRestart: close,
        onChallenge: () => {},
        onShareChallenge: () => {},
        ...(previewCompleted && { puzzleColors: previewColors }),
        ...(previewCompleted && { engagement: MOCK_ENGAGEMENT }),
    });

    type PreviewItem = {
        label: string;
        icon: Icon;
        iconClass: string;
        mode: PreviewMode;
    };

    const PREVIEW_ITEMS: PreviewItem[] = [
        {
            label: "4×4 Game",
            icon: Grid2x2,
            iconClass: "text-urjo-blue",
            mode: { kind: "game", gridSize: 4 },
        },
        {
            label: "6×6 Game",
            icon: Grid3x3,
            iconClass: "text-urjo-blue",
            mode: { kind: "game", gridSize: 6 },
        },
        {
            label: "8×8 Game",
            icon: LayoutGrid,
            iconClass: "text-urjo-blue",
            mode: { kind: "game", gridSize: 8 },
        },
        {
            label: "Completion",
            icon: Trophy,
            iconClass: "text-yellow-400",
            mode: { kind: "completion", gridSize: 4 },
        },
        {
            label: "Achievements",
            icon: Medal,
            iconClass: "text-yellow-400",
            mode: { kind: "achievements" },
        },
        {
            label: "Leaderboard",
            icon: BarChart2,
            iconClass: "text-blue-400",
            mode: { kind: "leaderboard" },
        },
    ];
</script>

{#if isOpen}
    <!-- Backdrop -->
    <div
        transition:fade={{ duration: 250 }}
        class="fixed inset-0 z-50 bg-black/60"
        role="button"
        tabindex="-1"
        aria-label="Close mod preview"
        onclick={onClose}
        onkeydown={(e) => e.key === "Escape" && onClose()}
    ></div>

    <!-- Bottom sheet -->
    <div
        transition:fly={{ y: 400, duration: 380, easing: cubicOut }}
        class="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-theme-bg-primary border-t border-theme-border rounded-t-2xl shadow-2xl"
        style="max-height: 75vh;"
    >
        <!-- Drag handle -->
        <div class="flex justify-center pt-3 pb-1 shrink-0">
            <div class="w-10 h-1 rounded-full bg-theme-border"></div>
        </div>

        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-3 shrink-0">
            <div class="flex items-center gap-2">
                <Microscope class="w-5 h-5 text-theme-text-muted" />
                <div>
                    <h2 class="text-base font-bold text-theme-text-primary">
                        Component Preview
                    </h2>
                    <p class="text-xs text-theme-text-muted">
                        Mod only · mock data
                    </p>
                </div>
            </div>
            <button
                onclick={onClose}
                class="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-theme-hover transition-colors text-theme-text-muted"
                aria-label="Close">✕</button
            >
        </div>

        <!-- Grid of preview buttons -->
        <div class="grid grid-cols-3 gap-2 px-4 pb-8 overflow-y-auto">
            {#each PREVIEW_ITEMS as item (item.label)}
                <button
                    onclick={() => open(item.mode)}
                    class="flex flex-col items-center gap-2 px-2 py-3 border border-theme-border rounded-xl hover:bg-theme-hover active:scale-95 transition-all"
                >
                    <item.icon class="w-6 h-6 {item.iconClass}" />
                    <span
                        class="text-xs font-semibold text-theme-text-secondary text-center leading-tight"
                    >
                        {item.label}
                    </span>
                </button>
            {/each}
        </div>
    </div>
{/if}

<!-- ── Full-screen previews ──────────────────────────────────────────────── -->

{#if preview?.kind === "game" || preview?.kind === "completion"}
    <div class="fixed inset-0 z-[60] bg-theme-bg-primary">
        <!-- Close bar -->
        <div
            class="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 bg-theme-bg-primary/90 backdrop-blur-sm border-b border-theme-border"
        >
            <span
                class="text-xs font-semibold text-theme-text-muted uppercase tracking-wide"
            >
                Preview: {preview.kind === "completion"
                    ? "Completion"
                    : `${preview.gridSize}×${preview.gridSize} Game`}
            </span>
            <button
                onclick={close}
                class="px-3 py-1.5 text-xs font-semibold text-theme-text-secondary border border-theme-border rounded-lg hover:bg-theme-hover transition-colors"
            >
                Close Preview
            </button>
        </div>
        <div class="pt-10 h-full">
            <GameView {...gameViewProps} />
        </div>
    </div>
{/if}

<!-- Modal / panel previews -->
<AchievementsPanel isOpen={preview?.kind === "achievements"} onClose={close} />
<LeaderboardModal
    isOpen={preview?.kind === "leaderboard"}
    onClose={close}
    onNextChallenge={close}
/>
