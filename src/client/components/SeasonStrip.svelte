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
     * This compact strip renders:
     *   1. A 7-day streak calendar (today glows; past days filled)
     *   2. The current season name + player rank (clickable → opens modal)
     *
     * All sections are graceful — any missing data hides only its own
     * section so the strip never goes blank.
     */

    import type { StreakData } from "../../shared/types";
    import type { SeasonInfo } from "../../shared/growth-types";

    type SeasonProgress = {
        rank: number | null;
        score: number;
    };

    type Props = {
        streak: StreakData;
        currentSeason?: SeasonInfo | undefined;
        seasonProgress?: SeasonProgress | undefined;
        onOpenSeason?: () => void;
    };

    let {
        streak,
        currentSeason,
        seasonProgress,
        onOpenSeason,
    }: Props = $props();

    /**
     * Build the 7-day streak calendar. Today is "filled and glowing".
     * Each prior day shows filled if currentStreak covers it, dim otherwise.
     * The boxes always span the last 7 days regardless of total streak length
     * — this is "what does my last week look like", not "all-time history".
     */
    const calendar = $derived(buildCalendar(streak.currentStreak));

    function buildCalendar(currentStreak: number): {
        filled: boolean;
        isToday: boolean;
    }[] {
        const days: { filled: boolean; isToday: boolean }[] = [];
        for (let offsetFromToday = 6; offsetFromToday >= 0; offsetFromToday--) {
            const isToday = offsetFromToday === 0;
            // Day at this offset is "filled" if the player has a streak
            // covering it. currentStreak=1 covers today only; 2 covers today
            // and yesterday; etc.
            const filled = offsetFromToday < currentStreak;
            days.push({ filled, isToday });
        }
        return days;
    }
</script>

<div
    class="flex-none flex items-center gap-3 justify-between px-3 py-1.5 bg-theme-bg-secondary/40 border-y border-theme-border/60"
>
    <!-- 7-day streak calendar — Subway Surfers daily-reward grid pattern. -->
    <div class="flex items-center gap-1.5" title="Last 7 days of play">
        <span class="text-xs text-theme-text-muted">🔥</span>
        <div class="flex gap-0.5">
            {#each calendar as day, i (i)}
                <div
                    class="w-3 h-3 rounded-sm transition-colors
                        {day.filled
                        ? day.isToday
                            ? 'bg-orange-400 shadow-[0_0_6px_2px_rgba(251,146,60,0.6)]'
                            : 'bg-orange-500/70'
                        : day.isToday
                          ? 'bg-orange-500/20 border border-orange-400'
                          : 'bg-theme-hover border border-theme-border'}"
                ></div>
            {/each}
        </div>
        <span class="text-xs font-bold text-orange-300 tabular-nums">
            {streak.currentStreak}d
        </span>
    </div>

    <!-- Season chip -->
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
