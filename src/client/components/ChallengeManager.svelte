<script lang="ts">
    import { navigateTo, showToast } from "@devvit/web/client";
    import { onMount } from "svelte";

    import {
        ChallengeRemovalError,
        loadOwnedChallenges,
        removeOwnedChallenge,
        type ManagedChallenge,
    } from "../lib/challenge-management";

    const MAX_VISIBLE_CHALLENGES = 3;

    let challenges = $state<ManagedChallenge[]>([]);
    let loading = $state(true);
    let expanded = $state(false);
    let removingId = $state<string | null>(null);
    let confirmingId = $state<string | null>(null);
    let error = $state<string | null>(null);
    let fallbackPostUrl = $state<string | null>(null);

    const visibleChallenges = $derived(challenges.slice(0, MAX_VISIBLE_CHALLENGES));

    onMount(() => {
        void refresh();
    });

    const refresh = async (): Promise<void> => {
        loading = true;
        error = null;
        fallbackPostUrl = null;
        try {
            challenges = await loadOwnedChallenges();
        } catch (caught) {
            error = caught instanceof Error ? caught.message : "Unable to load your creations";
        } finally {
            loading = false;
        }
    };

    const removeChallenge = async (postId: string): Promise<void> => {
        removingId = postId;
        error = null;
        fallbackPostUrl = null;
        try {
            await removeOwnedChallenge(postId);
            challenges = challenges.filter((challenge) => challenge.postId !== postId);
            confirmingId = null;
            showToast("Creation removed from r/urjo");
        } catch (caught) {
            error = caught instanceof Error ? caught.message : "Unable to remove this creation";
            fallbackPostUrl = caught instanceof ChallengeRemovalError ? caught.postUrl : null;
        } finally {
            removingId = null;
        }
    };

    const formatCreatedAt = (createdAt: string): string => new Date(createdAt).toLocaleDateString(
        undefined,
        { month: "short", day: "numeric", year: "numeric" },
    );
</script>

<section
    class="w-full shrink-0 overflow-hidden rounded-2xl border border-theme-border bg-theme-bg-secondary/90"
    aria-label="Your creations"
>
    <button
        type="button"
        onclick={() => (expanded = !expanded)}
        class="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left active:bg-theme-bg-primary/40"
        aria-expanded={expanded}
    >
        <span aria-hidden="true">⚔️</span>
        <span class="min-w-0 flex-1 text-sm font-bold text-theme-text-primary">Your creations</span>
        {#if !loading}
            <span class="text-xs font-semibold text-theme-text-muted">{challenges.length}</span>
        {/if}
        <span class="text-xs text-theme-text-muted" aria-hidden="true">{expanded ? "▲" : "▼"}</span>
    </button>

    {#if expanded}
        <div class="space-y-2 border-t border-theme-border px-3 pb-3 pt-2">
            <p class="text-[11px] text-theme-text-muted">
                Removing hides the post from r/urjo. Reddit keeps it in your account history.
            </p>

            {#if loading}
                <p class="py-2 text-center text-xs text-theme-text-muted" aria-live="polite">
                    Loading your creations…
                </p>
            {:else if challenges.length === 0}
                <p class="rounded-xl bg-theme-bg-primary/50 p-3 text-center text-xs text-theme-text-muted">
                    You have no published levels or rival posts.
                </p>
            {:else}
                {#each visibleChallenges as challenge (challenge.postId)}
                    <div class="rounded-xl bg-theme-bg-primary/50 p-2.5">
                        <div class="flex items-center gap-2">
                            <div class="min-w-0 flex-1">
                                <p class="text-xs font-semibold text-theme-text-primary">
                                    {challenge.gridSize === null ? "Urjo" : `${challenge.gridSize}×${challenge.gridSize}`}
                                    {challenge.kind === "level" ? "community level" : "rival board"}
                                </p>
                                <p class="text-[11px] text-theme-text-muted">
                                    {challenge.kind === "level"
                                        ? "Created by you"
                                        : challenge.targetTime === null
                                            ? "Target unavailable"
                                            : `${challenge.targetTime}s target`}
                                    · {formatCreatedAt(challenge.createdAt)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onclick={() => navigateTo(challenge.postUrl)}
                                class="min-h-11 rounded-xl border border-theme-border px-3 text-xs font-semibold text-theme-text-primary"
                            >
                                Open
                            </button>
                        </div>

                        {#if confirmingId === challenge.postId}
                            <div class="mt-2 grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onclick={() => (confirmingId = null)}
                                    disabled={removingId !== null}
                                    class="min-h-11 rounded-xl border border-theme-border px-2 text-xs font-semibold text-theme-text-secondary disabled:opacity-50"
                                >
                                    Keep post
                                </button>
                                <button
                                    type="button"
                                    onclick={() => removeChallenge(challenge.postId)}
                                    disabled={removingId !== null}
                                    class="min-h-11 rounded-xl bg-red-600 px-2 text-xs font-bold text-white disabled:opacity-50"
                                >
                                    {removingId === challenge.postId ? "Removing…" : "Confirm remove"}
                                </button>
                            </div>
                        {:else}
                            <button
                                type="button"
                                onclick={() => (confirmingId = challenge.postId)}
                                disabled={removingId !== null}
                                class="mt-2 min-h-11 w-full rounded-xl border border-red-400/60 px-3 text-xs font-semibold text-red-200 disabled:opacity-50"
                            >
                                Remove from r/urjo
                            </button>
                        {/if}
                    </div>
                {/each}

                {#if challenges.length > MAX_VISIBLE_CHALLENGES}
                    <p class="text-center text-[11px] text-theme-text-muted">
                        Showing the newest {MAX_VISIBLE_CHALLENGES} of {challenges.length} posts.
                    </p>
                {/if}
            {/if}

            {#if error}
                <div class="flex items-center gap-2" role="alert">
                    <p class="min-w-0 flex-1 text-xs text-red-300">{error}</p>
                    {#if fallbackPostUrl}
                        <button
                            type="button"
                            onclick={() => fallbackPostUrl && navigateTo(fallbackPostUrl)}
                            class="min-h-11 rounded-xl border border-red-400/60 px-3 text-xs font-semibold text-red-200"
                        >
                            Open on Reddit
                        </button>
                    {:else}
                        <button
                            type="button"
                            onclick={refresh}
                            class="min-h-11 rounded-xl border border-red-400/60 px-3 text-xs font-semibold text-red-200"
                        >
                            Retry
                        </button>
                    {/if}
                </div>
            {/if}
        </div>
    {/if}
</section>
