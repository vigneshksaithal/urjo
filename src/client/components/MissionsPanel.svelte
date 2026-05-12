<script lang="ts">
    import { focusTrap } from "../lib/focus-trap";
    import X from "lucide-svelte/icons/x";
    import Loader2 from "lucide-svelte/icons/loader-2";
    import type {
        MissionsResponse,
        MissionInstance,
    } from "../../shared/engagement-types";

    type Props = {
        isOpen: boolean;
        onClose: () => void;
    };

    let { isOpen, onClose }: Props = $props();

    let data = $state<MissionsResponse | null>(null);
    let isLoading = $state(false);
    let error = $state<string | null>(null);
    let claimingId = $state<string | null>(null);

    $effect(() => {
        if (isOpen) {
            fetchMissions();
        }
    });

    async function fetchMissions(): Promise<void> {
        isLoading = true;
        error = null;
        try {
            const res = await fetch("/api/missions");
            if (!res.ok) throw new Error("Failed to load missions");
            data = (await res.json()) as MissionsResponse;
        } catch (e) {
            error = e instanceof Error ? e.message : "Failed to load missions";
        } finally {
            isLoading = false;
        }
    }

    async function claimMission(
        missionId: string,
        cadence: "daily" | "weekly",
    ): Promise<void> {
        claimingId = missionId;
        error = null;
        try {
            const res = await fetch("/api/missions/claim", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ missionId, cadence }),
            });
            const json = (await res.json()) as {
                success?: boolean;
                error?: string;
            };
            if (!res.ok) {
                error = json.error ?? "Failed to claim mission";
                return;
            }
            await fetchMissions();
        } catch (e) {
            error = e instanceof Error ? e.message : "Failed to claim mission";
        } finally {
            claimingId = null;
        }
    }

    function progressPercent(mission: MissionInstance): number {
        if (mission.completed) return 100;
        return Math.min(
            100,
            Math.round((mission.currentProgress / mission.targetValue) * 100),
        );
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
                <h2 class="text-lg font-bold text-theme-text-primary">
                    🎯 Missions
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
            <div class="flex-1 overflow-y-auto p-4 space-y-5">
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
                            onclick={fetchMissions}
                            class="mt-4 px-4 py-2 border border-red-400 text-red-400 rounded-lg text-sm hover:bg-red-400/10 transition-all"
                        >
                            Retry
                        </button>
                    </div>
                {:else if data}
                    <!-- Daily Missions -->
                    <section>
                        <div class="flex items-center justify-between mb-3">
                            <h3
                                class="text-sm font-semibold text-theme-text-secondary uppercase tracking-wide"
                            >
                                Daily
                            </h3>
                            {#if data.dailyBonusAvailable}
                                <span
                                    class="text-xs text-yellow-400 font-semibold"
                                    >🎁 +25 bonus available!</span
                                >
                            {/if}
                        </div>
                        <div class="space-y-3">
                            {#each data.daily as mission}
                                <div
                                    class="p-3 rounded-lg bg-theme-bg-secondary border border-theme-border"
                                >
                                    <div
                                        class="flex items-start justify-between gap-2 mb-2"
                                    >
                                        <p
                                            class="text-sm text-theme-text-primary"
                                        >
                                            {mission.description}
                                        </p>
                                        <span
                                            class="text-xs text-yellow-400 font-semibold whitespace-nowrap"
                                            >🪙 {mission.coinReward}</span
                                        >
                                    </div>
                                    <!-- Progress bar -->
                                    <div
                                        class="w-full bg-theme-bg-primary rounded-full h-1.5 mb-2"
                                    >
                                        <div
                                            class="h-1.5 rounded-full transition-all {mission.completed
                                                ? 'bg-green-500'
                                                : 'bg-blue-500'}"
                                            style="width: {progressPercent(
                                                mission,
                                            )}%"
                                        ></div>
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <span
                                            class="text-xs text-theme-text-muted"
                                        >
                                            {mission.currentProgress}/{mission.targetValue}
                                        </span>
                                        {#if mission.completed && !mission.claimed}
                                            <button
                                                onclick={() =>
                                                    claimMission(
                                                        mission.templateId,
                                                        "daily",
                                                    )}
                                                disabled={claimingId ===
                                                    mission.templateId}
                                                class="px-3 py-1 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-500 disabled:opacity-40 transition-colors"
                                            >
                                                {claimingId ===
                                                mission.templateId
                                                    ? "..."
                                                    : "Claim"}
                                            </button>
                                        {:else if mission.claimed}
                                            <span class="text-xs text-green-400"
                                                >✓ Claimed</span
                                            >
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </section>

                    <!-- Weekly Missions -->
                    <section>
                        <div class="flex items-center justify-between mb-3">
                            <h3
                                class="text-sm font-semibold text-theme-text-secondary uppercase tracking-wide"
                            >
                                Weekly
                            </h3>
                            {#if data.weeklyBonusAvailable}
                                <span
                                    class="text-xs text-yellow-400 font-semibold"
                                    >🎁 +75 bonus available!</span
                                >
                            {/if}
                        </div>
                        <div class="space-y-3">
                            {#each data.weekly as mission}
                                <div
                                    class="p-3 rounded-lg bg-theme-bg-secondary border border-theme-border"
                                >
                                    <div
                                        class="flex items-start justify-between gap-2 mb-2"
                                    >
                                        <p
                                            class="text-sm text-theme-text-primary"
                                        >
                                            {mission.description}
                                        </p>
                                        <span
                                            class="text-xs text-yellow-400 font-semibold whitespace-nowrap"
                                            >🪙 {mission.coinReward}</span
                                        >
                                    </div>
                                    <div
                                        class="w-full bg-theme-bg-primary rounded-full h-1.5 mb-2"
                                    >
                                        <div
                                            class="h-1.5 rounded-full transition-all {mission.completed
                                                ? 'bg-green-500'
                                                : 'bg-purple-500'}"
                                            style="width: {progressPercent(
                                                mission,
                                            )}%"
                                        ></div>
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <span
                                            class="text-xs text-theme-text-muted"
                                        >
                                            {mission.currentProgress}/{mission.targetValue}
                                        </span>
                                        {#if mission.completed && !mission.claimed}
                                            <button
                                                onclick={() =>
                                                    claimMission(
                                                        mission.templateId,
                                                        "weekly",
                                                    )}
                                                disabled={claimingId ===
                                                    mission.templateId}
                                                class="px-3 py-1 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-500 disabled:opacity-40 transition-colors"
                                            >
                                                {claimingId ===
                                                mission.templateId
                                                    ? "..."
                                                    : "Claim"}
                                            </button>
                                        {:else if mission.claimed}
                                            <span class="text-xs text-green-400"
                                                >✓ Claimed</span
                                            >
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </section>
                {/if}
            </div>
        </div>
    </div>
{/if}
