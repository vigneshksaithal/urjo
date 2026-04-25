<script lang="ts">
    import { focusTrap } from "../lib/focus-trap";
    import X from "lucide-svelte/icons/x";
    import Loader2 from "lucide-svelte/icons/loader-2";
    import type { AchievementCategory } from "../../shared/engagement-types";

    type AchievementItem = {
        id: string;
        category: AchievementCategory;
        label: string;
        emoji: string;
        description: string;
        thresholdValue: number;
        coinBonus: number;
        unlocked: boolean;
        unlockedAt?: number;
        progressPercent: number;
    };

    type AchievementsResponse = {
        achievements: AchievementItem[];
    };

    type Props = {
        isOpen: boolean;
        onClose: () => void;
    };

    let { isOpen, onClose }: Props = $props();

    let data = $state<AchievementsResponse | null>(null);
    let isLoading = $state(false);
    let error = $state<string | null>(null);
    let activeCategory = $state<AchievementCategory | "all">("all");

    const CATEGORY_LABELS: Record<AchievementCategory, string> = {
        solve_count: "🧩 Solves",
        streak: "🔥 Streak",
        speed: "⚡ Speed",
        economy: "💰 Economy",
        mastery: "🏆 Mastery",
        social: "📢 Social",
    };

    const CATEGORIES: Array<AchievementCategory | "all"> = [
        "all",
        "solve_count",
        "streak",
        "speed",
        "economy",
        "mastery",
        "social",
    ];

    $effect(() => {
        if (isOpen) {
            fetchAchievements();
        }
    });

    async function fetchAchievements(): Promise<void> {
        isLoading = true;
        error = null;
        try {
            const res = await fetch("/api/achievements");
            if (!res.ok) throw new Error("Failed to load achievements");
            data = (await res.json()) as AchievementsResponse;
        } catch (e) {
            error =
                e instanceof Error ? e.message : "Failed to load achievements";
        } finally {
            isLoading = false;
        }
    }

    let filtered = $derived(
        data?.achievements.filter(
            (a) => activeCategory === "all" || a.category === activeCategory,
        ) ?? [],
    );

    let unlockedCount = $derived(
        data?.achievements.filter((a) => a.unlocked).length ?? 0,
    );
    let totalCount = $derived(data?.achievements.length ?? 0);

    function formatDate(ts: number): string {
        return new Date(ts).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
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
                <div>
                    <h2 class="text-lg font-bold text-theme-text-primary">
                        🏅 Achievements
                    </h2>
                    {#if data}
                        <p class="text-xs text-theme-text-muted">
                            {unlockedCount}/{totalCount} unlocked
                        </p>
                    {/if}
                </div>
                <button
                    onclick={onClose}
                    class="text-theme-text-muted hover:text-theme-text-primary transition-colors p-1"
                    aria-label="Close"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>

            <!-- Category tabs -->
            <div
                class="flex overflow-x-auto border-b border-theme-border px-2 gap-1 py-2"
            >
                {#each CATEGORIES as cat}
                    <button
                        onclick={() => {
                            activeCategory = cat;
                        }}
                        class="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors
							{activeCategory === cat
                            ? 'bg-blue-600 text-white'
                            : 'text-theme-text-muted hover:text-theme-text-primary bg-theme-bg-secondary'}"
                    >
                        {cat === "all" ? "All" : CATEGORY_LABELS[cat]}
                    </button>
                {/each}
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto p-4 space-y-2">
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
                            onclick={fetchAchievements}
                            class="mt-4 px-4 py-2 border border-red-400 text-red-400 rounded-lg text-sm hover:bg-red-400/10 transition-all"
                        >
                            Retry
                        </button>
                    </div>
                {:else}
                    {#each filtered as achievement}
                        <div
                            class="flex items-center gap-3 p-3 rounded-lg border transition-colors
								{achievement.unlocked
                                ? 'bg-theme-bg-secondary border-green-500/30'
                                : 'bg-theme-bg-secondary border-theme-border opacity-60'}"
                        >
                            <span
                                class="text-2xl {achievement.unlocked
                                    ? ''
                                    : 'grayscale'}">{achievement.emoji}</span
                            >
                            <div class="flex-1 min-w-0">
                                <div
                                    class="flex items-center justify-between gap-2"
                                >
                                    <p
                                        class="text-sm font-semibold text-theme-text-primary truncate"
                                    >
                                        {achievement.label}
                                    </p>
                                    <span
                                        class="text-xs text-yellow-400 whitespace-nowrap"
                                        >🪙 {achievement.coinBonus}</span
                                    >
                                </div>
                                <p class="text-xs text-theme-text-muted">
                                    {achievement.description}
                                </p>
                                {#if achievement.unlocked && achievement.unlockedAt}
                                    <p class="text-xs text-green-400 mt-0.5">
                                        ✓ {formatDate(achievement.unlockedAt)}
                                    </p>
                                {:else}
                                    <!-- Progress bar -->
                                    <div
                                        class="w-full bg-theme-bg-primary rounded-full h-1 mt-1.5"
                                    >
                                        <div
                                            class="h-1 rounded-full bg-blue-500 transition-all"
                                            style="width: {achievement.progressPercent}%"
                                        ></div>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/each}
                    {#if filtered.length === 0}
                        <div
                            class="text-center py-8 text-theme-text-muted text-sm"
                        >
                            No achievements in this category yet.
                        </div>
                    {/if}
                {/if}
            </div>
        </div>
    </div>
{/if}
