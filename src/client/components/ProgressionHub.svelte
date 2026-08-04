<script lang="ts">
    import { onMount } from "svelte";

    import {
        claimDailyMission,
        getProgressPercent,
        loadProgression,
        type ProgressionSnapshot,
    } from "../lib/progression";

    type Props = {
        onOpenSeason?: (() => void) | undefined;
    };

    let { onOpenSeason }: Props = $props();

    let snapshot = $state<ProgressionSnapshot | null>(null);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let expanded = $state(false);
    let claimingId = $state<string | null>(null);
    let statusMessage = $state<string | null>(null);

    const completedMissions = $derived(
        snapshot?.missions.filter((mission) => mission.completed).length ?? 0,
    );

    onMount(() => {
        void refresh();
    });

    const refresh = async (): Promise<void> => {
        loading = true;
        error = null;
        try {
            snapshot = await loadProgression();
        } catch (caught) {
            error = caught instanceof Error ? caught.message : "Unable to load progress";
        } finally {
            loading = false;
        }
    };

    const claim = async (missionId: string): Promise<void> => {
        claimingId = missionId;
        statusMessage = null;
        try {
            const result = await claimDailyMission(missionId);
            snapshot = result.snapshot;
            statusMessage = result.alreadyClaimed
                ? "Reward already collected"
                : `+${result.rewardCoins} coins collected`;
        } catch (caught) {
            statusMessage = caught instanceof Error ? caught.message : "Unable to claim reward";
        } finally {
            claimingId = null;
        }
    };
</script>

<section
    class="w-full overflow-hidden rounded-2xl border border-amber-400/25 bg-[#151925] shadow-[0_4px_0_#090b11]"
    aria-label="Your progress"
>
    {#if loading}
        <div class="min-h-11 px-3 flex items-center gap-3 animate-pulse" aria-live="polite">
            <div class="h-6 w-6 rounded-full bg-theme-border"></div>
            <div class="h-3 flex-1 rounded bg-theme-border"></div>
            <span class="text-xs text-theme-text-muted">Loading progress…</span>
        </div>
    {:else if error}
        <div class="flex items-center gap-2 p-2" role="alert">
            <p class="min-w-0 flex-1 text-xs text-red-300">{error}</p>
            <button
                type="button"
                onclick={refresh}
                class="min-h-11 min-w-11 rounded-xl border border-red-400/60 px-3 text-sm font-semibold text-red-200"
            >
                Retry
            </button>
        </div>
    {:else if snapshot}
        <button
            type="button"
            onclick={() => (expanded = !expanded)}
            class="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-white transition-colors active:bg-white/10"
            aria-expanded={expanded}
            aria-controls="daily-quests-sheet"
        >
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-300/30 bg-gradient-to-br from-orange-500/30 to-red-500/15 text-lg shadow-inner" aria-hidden="true">
                ⚔️
            </span>
            <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-black uppercase tracking-wide">Daily quests</span>
                <span class="block truncate text-[11px] font-semibold text-white/55">🔥 {snapshot.streak.current}-day streak</span>
            </span>
            <span class="shrink-0 rounded-full border border-amber-300/30 bg-amber-400/15 px-2.5 py-1 text-xs font-black text-amber-200">
                {completedMissions}/{snapshot.missions.length}
            </span>
            <span class="text-xs text-white/45" aria-hidden="true">
                ›
            </span>
        </button>
    {/if}
</section>

{#if expanded && snapshot}
    <div class="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/75 px-2 pt-2 backdrop-blur-[2px]">
        <button
            type="button"
            onclick={() => (expanded = false)}
            class="absolute inset-0 h-full w-full cursor-default"
            aria-label="Close daily quests"
        ></button>

        <div
            id="daily-quests-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-quests-title"
            class="relative flex h-[min(84dvh,42rem)] max-h-[calc(100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] border border-b-0 border-amber-300/25 bg-[#111522] text-white shadow-[0_-12px_48px_rgba(0,0,0,0.55)]"
        >
            <header data-testid="quest-sheet-header" class="shrink-0 border-b border-white/10 bg-[#181d2c] px-4 pb-3 pt-2">
                <div class="mx-auto mb-2 h-1.5 w-12 rounded-full bg-white/20" aria-hidden="true"></div>
                <div class="flex min-w-0 items-center gap-3">
                    <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-300/30 bg-gradient-to-br from-orange-500/35 to-red-500/15 text-2xl shadow-inner" aria-hidden="true">⚔️</span>
                    <div class="min-w-0 flex-1">
                        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300/80">Quest board</p>
                        <h2 id="daily-quests-title" class="truncate text-xl font-black uppercase tracking-tight">Daily quests</h2>
                    </div>
                    <button
                        type="button"
                        onclick={() => (expanded = false)}
                        class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xl font-bold text-white/70 active:scale-95"
                        aria-label="Close daily quests"
                    >
                        ×
                    </button>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-2 text-xs font-black">
                    <div class="flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-orange-300/20 bg-orange-400/10 px-2 py-2 text-orange-200">
                        <span aria-hidden="true">🔥</span>
                        <span class="truncate">{snapshot.streak.current}-day streak</span>
                    </div>
                    <div class="flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-2 py-2 text-emerald-200">
                        <span aria-hidden="true">✓</span>
                        <span class="truncate">{completedMissions}/{snapshot.missions.length} cleared</span>
                    </div>
                </div>
            </header>

            <div
                data-testid="quest-scroll-region"
                class="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
            >
                <div class="space-y-4 px-3 py-4 sm:px-4">
                    <section class="rounded-[1.35rem] border border-sky-300/25 bg-gradient-to-br from-sky-500/20 to-blue-700/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" aria-label="Today's goal">
                        <div class="flex min-w-0 items-start justify-between gap-3">
                            <div class="min-w-0">
                                <p class="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">Today’s goal</p>
                                <p class="mt-1 break-words text-base font-black leading-tight">{snapshot.nextGoal.label}</p>
                            </div>
                            <span class="shrink-0 rounded-lg bg-sky-300 px-2.5 py-1 text-sm font-black text-sky-950 shadow-[0_3px_0_#075985]">
                                {snapshot.nextGoal.progress}/{snapshot.nextGoal.target}
                            </span>
                        </div>
                        <div class="mt-4 h-3 overflow-hidden rounded-full border border-white/10 bg-black/35 p-0.5" aria-hidden="true">
                            <div
                                class="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-300 transition-all duration-300"
                                style:width={`${getProgressPercent(snapshot.nextGoal.progress, snapshot.nextGoal.target)}%`}
                            ></div>
                        </div>
                    </section>

                    <div class="space-y-3">
                        <div class="flex items-center justify-between gap-3 px-1">
                            <h3 class="text-xs font-black uppercase tracking-[0.16em] text-white/60">Quest deck</h3>
                            <span class="text-[11px] font-bold text-white/35">Refreshes daily</span>
                        </div>

                        {#if snapshot.missions.length === 0}
                            <p class="rounded-[1.35rem] border border-dashed border-white/15 bg-white/5 p-6 text-center text-sm font-semibold text-white/50">
                                No daily missions are available yet.
                            </p>
                        {:else}
                            {#each snapshot.missions as mission, index (mission.id)}
                                <article class="min-h-20 overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#1b2131] p-3.5 shadow-[0_4px_0_#090b11]">
                                    <div class="flex min-w-0 items-start gap-3">
                                        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xl font-black text-white/80" aria-hidden="true">
                                            {mission.claimed ? "✓" : index + 1}
                                        </span>
                                        <div class="min-w-0 flex-1">
                                            <p class="break-words text-sm font-black leading-snug">{mission.label}</p>
                                            <p class="mt-1 text-xs font-bold text-white/45">{mission.progress} of {mission.target}</p>
                                        </div>
                                        <span class="flex shrink-0 items-center gap-1 rounded-lg border border-amber-300/25 bg-amber-400/10 px-2 py-1 text-xs font-black text-amber-200">
                                            <span aria-hidden="true">🪙</span> +{mission.rewardCoins}
                                        </span>
                                    </div>

                                    <div class="mt-3 h-2.5 overflow-hidden rounded-full bg-black/35" aria-hidden="true">
                                        <div
                                            class:bg-emerald-400={mission.completed}
                                            class:bg-amber-400={!mission.completed}
                                            class="h-full rounded-full transition-all duration-300"
                                            style:width={`${getProgressPercent(mission.progress, mission.target)}%`}
                                        ></div>
                                    </div>

                                    {#if mission.claimed}
                                        <div class="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 text-sm font-black uppercase tracking-wide text-emerald-300">
                                            Reward collected
                                        </div>
                                    {:else if mission.completed}
                                        <button
                                            type="button"
                                            onclick={() => claim(mission.id)}
                                            disabled={claimingId !== null}
                                            class="mt-3 min-h-12 w-full rounded-xl bg-emerald-400 px-3 text-sm font-black uppercase tracking-wide text-emerald-950 shadow-[0_4px_0_#047857] transition-transform active:translate-y-1 active:shadow-none disabled:opacity-50"
                                        >
                                            {claimingId === mission.id ? "Claiming…" : "Claim reward"}
                                        </button>
                                    {/if}
                                </article>
                            {/each}
                        {/if}
                    </div>
                </div>
            </div>

            <footer data-testid="quest-sheet-footer" class="shrink-0 border-t border-white/10 bg-[#181d2c] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
                {#if statusMessage}
                    <p class="mb-2 truncate text-center text-xs font-bold text-amber-200" aria-live="polite">{statusMessage}</p>
                {/if}
                <div class="grid grid-cols-2 gap-2">
                    {#if onOpenSeason}
                        <button
                            type="button"
                            onclick={onOpenSeason}
                            class="min-h-11 min-w-0 rounded-xl border border-amber-300/30 bg-amber-400/10 px-2 text-xs font-black uppercase tracking-wide text-amber-200 active:scale-[0.98]"
                        >
                            Season rank
                        </button>
                    {/if}
                    <button
                        type="button"
                        onclick={() => (expanded = false)}
                        class:col-span-2={!onOpenSeason}
                        class="min-h-11 min-w-0 rounded-xl bg-white px-2 text-xs font-black uppercase tracking-wide text-[#111522] shadow-[0_3px_0_#9ca3af] active:translate-y-0.5 active:shadow-none"
                    >
                        Back to game
                    </button>
                </div>
            </footer>
        </div>
    </div>
{/if}
