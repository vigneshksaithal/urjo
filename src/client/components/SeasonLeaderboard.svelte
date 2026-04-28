<script lang="ts">
    import type {
        SeasonInfo,
        SeasonLeaderboardEntry,
    } from "../../shared/growth-types";
    import { focusTrap } from "../lib/focus-trap";
    import Trophy from "lucide-svelte/icons/trophy";
    import X from "lucide-svelte/icons/x";
    import Loader2 from "lucide-svelte/icons/loader-2";

    type Props = {
        isOpen: boolean;
        onClose: () => void;
    };

    let { isOpen, onClose }: Props = $props();

    let season = $state<SeasonInfo | null>(null);
    let entries = $state<SeasonLeaderboardEntry[]>([]);
    let playerRank = $state<number | null>(null);
    let playerScore = $state(0);
    let isLoading = $state(false);
    let error = $state<string | null>(null);
    let countdown = $state("");

    let countdownInterval: ReturnType<typeof setInterval> | undefined;

    $effect(() => {
        if (isOpen) {
            fetchData();
            startCountdown();
        } else {
            stopCountdown();
        }
    });

    function stopCountdown() {
        if (countdownInterval !== undefined) {
            clearInterval(countdownInterval);
            countdownInterval = undefined;
        }
    }

    function startCountdown() {
        stopCountdown();
        updateCountdown();
        countdownInterval = setInterval(updateCountdown, 1000);
    }

    function updateCountdown() {
        if (!season) {
            countdown = "";
            return;
        }
        const endDate = new Date(season.endDate + "T23:59:59Z");
        const now = new Date();
        const diff = endDate.getTime() - now.getTime();

        if (diff <= 0) {
            countdown = "Season ended";
            stopCountdown();
            return;
        }

        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);

        const parts: string[] = [];
        if (days > 0) parts.push(`${days}d`);
        parts.push(`${hours}h`);
        parts.push(`${minutes}m`);
        parts.push(`${seconds}s`);
        countdown = parts.join(" ");
    }

    async function fetchData() {
        isLoading = true;
        error = null;

        try {
            const [leaderboardRes, seasonRes] = await Promise.all([
                fetch("/api/season/leaderboard"),
                fetch("/api/season/current"),
            ]);

            if (!leaderboardRes.ok)
                throw new Error("Failed to load leaderboard");
            if (!seasonRes.ok) throw new Error("Failed to load season info");

            const leaderboardData = await leaderboardRes.json();
            const seasonData = await seasonRes.json();

            season = leaderboardData.season ?? seasonData;
            entries = leaderboardData.entries ?? [];
            playerRank = leaderboardData.playerRank ?? null;
            playerScore = leaderboardData.playerScore ?? 0;

            updateCountdown();
        } catch (e) {
            error =
                e instanceof Error ? e.message : "Failed to load season data";
        } finally {
            isLoading = false;
        }
    }
</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 bg-theme-overlay backdrop-blur-sm z-40 flex items-center justify-center p-4"
        onclick={onClose}
    >
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="bg-theme-bg-modal rounded-xl border border-theme-border w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
            onclick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            tabindex="-1"
            use:focusTrap={{ onClose }}
        >
            <!-- Header -->
            <div
                class="flex items-center justify-between p-4 border-b border-theme-border"
            >
                <div class="flex items-center gap-2">
                    <Trophy class="w-5 h-5 text-yellow-400" />
                    <h2 class="text-lg font-bold text-theme-text-primary">
                        Season {season?.seasonNumber ?? ""} Leaderboard
                    </h2>
                </div>
                <button
                    onclick={onClose}
                    class="text-theme-text-muted hover:text-theme-text-primary transition-colors p-1"
                    aria-label="Close"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>

            <!-- Season info bar -->
            {#if season && countdown}
                <div
                    class="flex items-center justify-between px-4 py-2 bg-theme-bg-secondary border-b border-theme-border text-xs"
                >
                    <span class="text-theme-text-muted">
                        Ends in <span
                            class="font-semibold text-theme-text-primary"
                            >{countdown}</span
                        >
                    </span>
                    {#if playerRank !== null}
                        <span class="text-theme-text-muted">
                            Your rank: <span
                                class="font-semibold text-yellow-400"
                                >#{playerRank}</span
                            >
                            · {playerScore} pts
                        </span>
                    {/if}
                </div>
            {/if}

            <!-- Content -->
            <div class="flex-1 overflow-y-auto">
                {#if isLoading}
                    <div class="flex items-center justify-center py-8">
                        <Loader2
                            class="w-8 h-8 text-theme-text-muted animate-spin"
                        />
                    </div>
                {:else if error}
                    <div class="text-center py-8 text-red-400">
                        <p>{error}</p>
                        <button
                            onclick={fetchData}
                            class="mt-4 px-4 py-2 border border-red-400 text-red-400 rounded-lg text-sm hover:bg-red-400/10 active:scale-95 transition-all"
                        >
                            Retry
                        </button>
                    </div>
                {:else if entries.length > 0}
                    <table class="w-full border-collapse">
                        <thead>
                            <tr
                                class="border-b border-theme-border text-left text-xs text-theme-text-muted"
                            >
                                <th class="px-4 py-2 font-medium">Rank</th>
                                <th class="px-4 py-2 font-medium">Player</th>
                                <th class="px-4 py-2 font-medium text-right"
                                    >Score</th
                                >
                            </tr>
                        </thead>
                        <tbody>
                            {#each entries as entry}
                                <tr
                                    class="border-b border-theme-border transition-colors
										{playerRank === entry.rank
                                        ? 'bg-green-500/20 text-green-400'
                                        : 'hover:bg-theme-hover'}"
                                >
                                    <td
                                        class="px-4 py-3 text-sm text-theme-text-primary"
                                    >
                                        {entry.rank === 1
                                            ? "🥇"
                                            : entry.rank === 2
                                              ? "🥈"
                                              : entry.rank === 3
                                                ? "🥉"
                                                : `${entry.rank}.`}
                                    </td>
                                    <td
                                        class="px-4 py-3 text-sm font-medium text-theme-text-primary"
                                    >
                                        {entry.username}
                                    </td>
                                    <td
                                        class="px-4 py-3 text-sm font-bold text-yellow-400 text-right"
                                    >
                                        {entry.score} pts
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                {:else}
                    <div class="text-center py-8 text-theme-text-muted">
                        <p>
                            No season data yet. Solve puzzles to earn season
                            points!
                        </p>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
