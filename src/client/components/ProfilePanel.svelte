<script lang="ts">
    import { focusTrap } from "../lib/focus-trap";
    import X from "lucide-svelte/icons/x";
    import Loader2 from "lucide-svelte/icons/loader-2";
    import type {
        ProfileResponse,
        FlairTier,
    } from "../../shared/engagement-types";

    type Props = {
        isOpen: boolean;
        onClose: () => void;
    };

    let { isOpen, onClose }: Props = $props();

    let data = $state<ProfileResponse | null>(null);
    let isLoading = $state(false);
    let error = $state<string | null>(null);

    const TIER_EMOJIS: Record<FlairTier, string> = {
        bronze: "🥉",
        silver: "🥈",
        gold: "🥇",
        diamond: "💎",
        master: "👑",
    };

    const TIER_LABELS: Record<FlairTier, string> = {
        bronze: "Bronze",
        silver: "Silver",
        gold: "Gold",
        diamond: "Diamond",
        master: "Master",
    };

    const NEXT_TIER_THRESHOLD: Record<FlairTier, number | null> = {
        bronze: 4,
        silver: 8,
        gold: 13,
        diamond: 18,
        master: null,
    };

    $effect(() => {
        if (isOpen) {
            fetchProfile();
        }
    });

    async function fetchProfile(): Promise<void> {
        isLoading = true;
        error = null;
        try {
            const res = await fetch("/api/profile");
            if (!res.ok) throw new Error("Failed to load profile");
            data = (await res.json()) as ProfileResponse;
        } catch (e) {
            error = e instanceof Error ? e.message : "Failed to load profile";
        } finally {
            isLoading = false;
        }
    }

    let tierProgress = $derived(() => {
        if (!data) return 0;
        const next = NEXT_TIER_THRESHOLD[data.flairTier];
        if (next === null) return 100;
        const count = data.achievements.length;
        const tierStart: Record<FlairTier, number> = {
            bronze: 1,
            silver: 4,
            gold: 8,
            diamond: 13,
            master: 18,
        };
        const start = tierStart[data.flairTier];
        return Math.min(
            100,
            Math.round(((count - start) / (next - start)) * 100),
        );
    });
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
            class="bg-theme-bg-modal rounded-xl border border-theme-border w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
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
                <h2 class="text-lg font-bold text-theme-text-primary">
                    📊 Profile
                </h2>
                <button
                    onclick={onClose}
                    class="text-theme-text-muted hover:text-theme-text-primary transition-colors p-1"
                    aria-label="Close"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto p-4 space-y-4">
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
                            onclick={fetchProfile}
                            class="mt-4 px-4 py-2 border border-red-400 text-red-400 rounded-lg text-sm hover:bg-red-400/10 transition-all"
                        >
                            Retry
                        </button>
                    </div>
                {:else if data}
                    <!-- Flair Tier -->
                    <div
                        class="p-4 rounded-xl bg-theme-bg-secondary border border-theme-border text-center"
                    >
                        <div class="text-4xl mb-1">
                            {TIER_EMOJIS[data.flairTier]}
                        </div>
                        <p class="text-lg font-bold text-theme-text-primary">
                            {TIER_LABELS[data.flairTier]} Tier
                        </p>
                        <p class="text-xs text-theme-text-muted mb-2">
                            {data.achievements.length} achievements unlocked
                        </p>
                        {#if NEXT_TIER_THRESHOLD[data.flairTier] !== null}
                            <div
                                class="w-full bg-theme-bg-primary rounded-full h-1.5"
                            >
                                <div
                                    class="h-1.5 rounded-full bg-yellow-400 transition-all"
                                    style="width: {tierProgress()}%"
                                ></div>
                            </div>
                            <p class="text-xs text-theme-text-muted mt-1">
                                {NEXT_TIER_THRESHOLD[data.flairTier]! -
                                    data.achievements.length} more to next tier
                            </p>
                        {:else}
                            <p class="text-xs text-yellow-400">
                                Max tier reached! 👑
                            </p>
                        {/if}
                    </div>

                    <!-- Investment Score -->
                    <div
                        class="p-4 rounded-xl bg-theme-bg-secondary border border-theme-border"
                    >
                        <div class="flex items-center justify-between mb-3">
                            <h3
                                class="text-sm font-semibold text-theme-text-primary"
                            >
                                Investment Score
                            </h3>
                            <span class="text-lg font-bold text-yellow-400"
                                >{data.investmentScore.totalScore.toLocaleString()}</span
                            >
                        </div>
                        <div class="space-y-1.5 text-xs text-theme-text-muted">
                            <div class="flex justify-between">
                                <span>🪙 Coins earned</span>
                                <span class="text-theme-text-secondary"
                                    >+{data.investmentScore.totalCoinsEarned.toLocaleString()}</span
                                >
                            </div>
                            <div class="flex justify-between">
                                <span>🎭 Titles owned (×100)</span>
                                <span class="text-theme-text-secondary"
                                    >+{data.investmentScore.titlesScore}</span
                                >
                            </div>
                            <div class="flex justify-between">
                                <span>🏅 Achievements (×50)</span>
                                <span class="text-theme-text-secondary"
                                    >+{data.investmentScore
                                        .achievementsScore}</span
                                >
                            </div>
                            <div class="flex justify-between">
                                <span>🔥 Current streak (×10)</span>
                                <span class="text-theme-text-secondary"
                                    >+{data.investmentScore
                                        .currentStreakScore}</span
                                >
                            </div>
                            <div class="flex justify-between">
                                <span>📈 Longest streak (×5)</span>
                                <span class="text-theme-text-secondary"
                                    >+{data.investmentScore
                                        .longestStreakScore}</span
                                >
                            </div>
                        </div>
                    </div>

                    <!-- Stats row -->
                    <div class="grid grid-cols-2 gap-3">
                        <div
                            class="p-3 rounded-lg bg-theme-bg-secondary border border-theme-border text-center"
                        >
                            <p
                                class="text-xl font-bold text-theme-text-primary"
                            >
                                {data.rankPercentile}%
                            </p>
                            <p class="text-xs text-theme-text-muted">
                                Rank Percentile
                            </p>
                        </div>
                        <div
                            class="p-3 rounded-lg bg-theme-bg-secondary border border-theme-border text-center"
                        >
                            <p
                                class="text-xl font-bold text-theme-text-primary"
                            >
                                {data.totalReferrals}
                            </p>
                            <p class="text-xs text-theme-text-muted">
                                Referrals
                            </p>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
