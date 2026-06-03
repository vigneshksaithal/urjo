<script lang="ts">
    import { showToast } from "@devvit/web/client";
    import type { ResultCardData } from "../../shared/growth-types";
    import { getResultTier } from "../../shared/result-tiers";
    import { fireOnce } from "../stores/first-action";
    import MessageSquare from "lucide-svelte/icons/message-square";
    import Loader2 from "lucide-svelte/icons/loader-2";

    type Props = {
        puzzleColors: string;
        gridSize: number;
        skillLevel: number;
        puzzleNumber: number;
        streak: number;
        timeTaken: number;
        mistakes: number;
        seasonNumber?: number | null;
        seasonRank?: number | null;
        seasonPoints?: number;
        onCommentResult?: () => void;
        hasCommented?: boolean;
        /** When false, the "Comment Result" social action is hidden (used for
         *  logged-out viewers who can't post). Defaults to true. */
        showCommentAction?: boolean;
    };

    let {
        puzzleColors,
        gridSize,
        skillLevel,
        puzzleNumber,
        streak,
        timeTaken,
        mistakes,
        seasonNumber = null,
        seasonRank = null,
        seasonPoints = 0,
        onCommentResult,
        hasCommented = false,
        showCommentAction = true,
    }: Props = $props();

    let commenting = $state(false);
    let commentError = $state<string | null>(null);

    const colorGrid = $derived(buildColorGrid(puzzleColors, gridSize));
    const resultCardData = $derived<ResultCardData>({
        puzzleNumber,
        gridSize: gridSize as 4 | 6 | 8,
        skillLevel,
        colorGrid,
        timeTaken,
        mistakes,
        streak,
    });
    // Tier label shown on the embedded share card. We always use the positive
    // spectrum (Flawless / Sharp / Solid / Scrappy) rather than "N mistakes".
    const tier = $derived(getResultTier(mistakes, gridSize as 4 | 6 | 8));

    function buildColorGrid(
        colors: string,
        size: number,
    ): ("red" | "blue")[][] {
        const grid: ("red" | "blue")[][] = [];
        for (let row = 0; row < size; row++) {
            const rowCells: ("red" | "blue")[] = [];
            for (let col = 0; col < size; col++) {
                const ch = colors[row * size + col];
                rowCells.push(ch === "r" ? "red" : "blue");
            }
            grid.push(rowCells);
        }
        return grid;
    }

    async function handleComment() {
        if (commenting || hasCommented) return;
        void fireOnce("", "result-comment");
        commenting = true;
        commentError = null;

        try {
            const res = await fetch("/api/game/result-comment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(resultCardData),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to post result");
            }

            onCommentResult?.();
            showToast("Result posted!");
        } catch (e) {
            commentError =
                e instanceof Error ? e.message : "Failed to post result";
        } finally {
            commenting = false;
        }
    }
</script>

<div class="flex flex-col gap-2 w-full">
    <!-- Emoji grid preview -->
    <div
        class="bg-theme-bg-secondary rounded-lg p-3 border border-theme-border text-center"
    >
        <p class="text-xs text-theme-text-muted mb-1">
            Urjo #{puzzleNumber} 🧩 {gridSize}×{gridSize} ⭐{skillLevel}
        </p>
        <div class="flex flex-col items-center gap-0 leading-none">
            {#each colorGrid as row, rowIndex (rowIndex)}
                <div class="flex">
                    {#each row as cell, colIndex (colIndex)}
                        <span class="text-sm leading-none"
                            >{cell === "red" ? "🟥" : "🟦"}</span
                        >
                    {/each}
                </div>
            {/each}
        </div>
        <p class="text-xs text-theme-text-muted mt-1">
            ⏱️ {timeTaken}s | {tier.emoji}
            {tier.label} | 🔥 {streak} streak
        </p>
        {#if seasonNumber !== null && (seasonRank !== null || seasonPoints > 0)}
            <p class="text-xs text-theme-text-muted mt-0.5">
                🏆 Season {seasonNumber}
                {#if seasonRank !== null}<span
                        class="font-semibold text-yellow-400"
                    >
                        Rank #{seasonRank}</span
                    >{/if}
                {#if seasonPoints > 0}
                    · {seasonPoints} pts{/if}
            </p>
        {/if}
    </div>

    <!-- Comment result button -->
    {#if showCommentAction}
        <button
            onclick={handleComment}
            disabled={commenting || hasCommented}
            class="w-full px-4 py-2 border border-theme-border text-theme-text-secondary rounded-lg text-sm hover:bg-theme-hover active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
            {#if commenting}
                <Loader2 class="w-4 h-4 animate-spin" /><span>Posting...</span>
            {:else if hasCommented}
                <span>✅ Posted!</span>
            {:else}
                <MessageSquare class="w-4 h-4" /><span>Comment Result</span>
            {/if}
        </button>

        {#if commentError}
            <p class="text-xs text-red-400 text-center">{commentError}</p>
        {/if}
    {/if}
</div>
