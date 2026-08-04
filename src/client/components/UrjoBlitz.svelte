<script lang="ts">
    import {
        connectRealtime,
        disconnectRealtime,
    } from "@devvit/web/client";
    import { onMount } from "svelte";

    import {
        URJO_BLITZ_CHANNEL,
        type UrjoBlitzState,
        type UrjoBlitzSummaryEvent,
    } from "../../shared/urjo-blitz";
    import {
        formatBlitzRemaining,
        joinUrjoBlitz,
        loadUrjoBlitz,
    } from "../lib/urjo-blitz";

    let blitzState = $state<UrjoBlitzState | null>(null);
    let nowMs = $state(Date.now());
    let expanded = $state(false);
    let loading = $state(true);
    let joining = $state(false);
    let error = $state<string | null>(null);
    let realtimeConnected = false;
    let disposed = false;

    const event = $derived(blitzState?.event ?? null);
    const viewer = $derived(blitzState?.viewer ?? null);
    const remaining = $derived(
        event === null ? "Ended" : formatBlitzRemaining(event.endAt, nowMs),
    );

    onMount(() => {
        const ticker = setInterval(() => {
            nowMs = Date.now();
        }, 1_000);

        void refresh();

        return () => {
            disposed = true;
            clearInterval(ticker);
            if (realtimeConnected) disconnectRealtime(URJO_BLITZ_CHANNEL);
        };
    });

    const refresh = async (): Promise<void> => {
        try {
            const nextState = await loadUrjoBlitz();
            if (disposed) return;
            blitzState = nextState;
            error = null;
            connectIfActive(nextState);
        } catch (caught) {
            if (!disposed) {
                error = caught instanceof Error ? caught.message : "Urjo Blitz is unavailable";
            }
        } finally {
            if (!disposed) loading = false;
        }
    };

    const connectIfActive = (nextState: UrjoBlitzState): void => {
        if (realtimeConnected || nextState.event?.status !== "active") return;
        connectRealtime<UrjoBlitzSummaryEvent>({
            channel: URJO_BLITZ_CHANNEL,
            onMessage: () => {
                void refresh();
            },
        });
        realtimeConnected = true;
    };

    const join = async (): Promise<void> => {
        if (joining) return;
        joining = true;
        error = null;
        try {
            blitzState = await joinUrjoBlitz();
            expanded = true;
            connectIfActive(blitzState);
        } catch (caught) {
            error = caught instanceof Error ? caught.message : "Unable to join Urjo Blitz";
        } finally {
            joining = false;
        }
    };
</script>

{#if event?.status === "active" && remaining !== "Ended"}
    <section
        class="w-full overflow-hidden rounded-2xl border border-amber-400/50 bg-amber-400/10"
        aria-label="Urjo Blitz weekly event"
    >
        <div class="flex min-h-11 items-center gap-2 px-3 py-1.5">
            <button
                type="button"
                class="min-h-11 min-w-0 flex-1 text-left"
                onclick={() => (expanded = !expanded)}
                aria-expanded={expanded}
            >
                <span class="block truncate text-sm font-black text-theme-text-primary">
                    ⚡ Urjo Blitz · {remaining}
                </span>
                <span class="block truncate text-[11px] text-theme-text-muted">
                    {event.participantCount} joined · 6×6 +2 · 8×8 +3
                </span>
            </button>

            {#if !viewer?.joined}
                <button
                    type="button"
                    class="min-h-11 shrink-0 rounded-xl bg-amber-400 px-3 text-sm font-black text-stone-950 disabled:opacity-60"
                    onclick={join}
                    disabled={joining}
                >
                    {joining ? "Joining…" : "Join"}
                </button>
            {:else}
                <button
                    type="button"
                    class="min-h-11 shrink-0 rounded-xl border border-amber-400/60 px-3 text-xs font-bold text-amber-300"
                    onclick={() => (expanded = !expanded)}
                >
                    {expanded ? "Hide" : "Standings"}
                </button>
            {/if}
        </div>

        {#if expanded}
            <div class="border-t border-amber-400/30 px-3 pb-3 pt-2">
                {#if viewer?.joined}
                    <p class="mb-2 text-xs font-semibold text-theme-text-primary">
                        Your score: {viewer.score} · {viewer.rank === null ? "Unranked" : `#${viewer.rank}`}
                    </p>
                {:else}
                    <p class="mb-2 text-xs text-theme-text-muted">
                        Join first; only server-verified solves after joining count.
                    </p>
                {/if}

                {#if blitzState?.leaderboard.length}
                    <ol class="space-y-1" aria-label="Urjo Blitz top players">
                        {#each blitzState.leaderboard as player (player.rank)}
                            <li class="flex items-center gap-2 text-xs">
                                <span class="w-6 font-bold text-theme-text-muted">#{player.rank}</span>
                                <span class="min-w-0 flex-1 truncate text-theme-text-primary">u/{player.username}</span>
                                <span class="font-bold text-amber-300">{player.score}</span>
                            </li>
                        {/each}
                    </ol>
                {:else}
                    <p class="text-xs text-theme-text-muted">No verified scores yet. Set the first one.</p>
                {/if}
            </div>
        {/if}

        {#if error}
            <p class="border-t border-amber-400/30 px-3 py-2 text-xs text-red-300" role="alert">
                {error}
            </p>
        {/if}
    </section>
{:else if !loading && error}
    <button
        type="button"
        onclick={refresh}
        class="min-h-11 w-full rounded-xl border border-theme-border px-3 text-xs text-theme-text-muted"
    >
        Urjo Blitz unavailable · Retry
    </button>
{/if}
