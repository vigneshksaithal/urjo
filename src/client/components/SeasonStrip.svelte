<script lang="ts">
    /**
     * Always-on progression strip.
     *
     * The critique called out that Urjo's meta-progression (season,
     * achievements) all live in modals — players have to *go look* to see
     * their progress. CoC and Subway Surfers solve this by putting a
     * persistent strip of "your stuff" on the home screen that updates as
     * you play.
     *
     * This compact strip renders the current season name + player rank
     * (clickable → opens modal). Streak progress lives in the header.
     *
     * All sections are graceful — any missing data hides only its own
     * section so the strip never goes blank.
     */

    import type { SeasonInfo } from "../../shared/growth-types";

    type SeasonProgress = {
        rank: number | null;
        score: number;
    };

    type Props = {
        currentSeason?: SeasonInfo | undefined;
        seasonProgress?: SeasonProgress | undefined;
        onOpenSeason?: () => void;
    };

    let {
        currentSeason,
        seasonProgress,
        onOpenSeason,
    }: Props = $props();
</script>

<div
    class="flex-none flex items-center justify-center px-3 py-1.5 bg-theme-bg-secondary/40 border-y border-theme-border/60"
>
    {#if currentSeason?.isActive}
        <button
            onclick={onOpenSeason}
            class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 transition-colors"
            title="Open season leaderboard"
        >
            <span class="text-xs">🏆</span>
            <span class="text-[11px] font-semibold text-yellow-300">
                Season {currentSeason.seasonNumber}
            </span>
            {#if seasonProgress && seasonProgress.rank !== null}
                <span class="text-[10px] text-yellow-200/80"
                    >· #{seasonProgress.rank}</span
                >
            {:else if seasonProgress}
                <span class="text-[10px] text-yellow-200/60">· unranked</span>
            {/if}
            {#if seasonProgress && seasonProgress.score > 0}
                <span class="text-[10px] text-yellow-200/80"
                    >· {seasonProgress.score}pt</span
                >
            {/if}
        </button>
    {/if}
</div>
