<script lang="ts">
    import { onMount } from "svelte";

    import { joinCommunity, loadCommunityStatus } from "../lib/community";

    let joined = $state(false);
    let joinedNow = $state(false);
    let loading = $state(true);
    let submitting = $state(false);
    let error = $state<string | null>(null);

    onMount(() => {
        void loadStatus();
    });

    const loadStatus = async (): Promise<void> => {
        loading = true;
        error = null;
        try {
            joined = (await loadCommunityStatus()).joinedViaUrjo;
        } catch (caught) {
            error = caught instanceof Error ? caught.message : "Unable to check r/urjo membership";
        } finally {
            loading = false;
        }
    };

    const join = async (): Promise<void> => {
        if (submitting) return;
        submitting = true;
        error = null;
        try {
            await joinCommunity();
            joined = true;
            joinedNow = true;
        } catch (caught) {
            error = caught instanceof Error ? caught.message : "Unable to join r/urjo";
        } finally {
            submitting = false;
        }
    };
</script>

{#if joinedNow}
    <p class="text-center text-sm font-bold text-emerald-300" role="status">
        ✓ Joined r/urjo
    </p>
{:else if !loading && !joined}
    <button
        type="button"
        onclick={join}
        disabled={submitting}
        class="min-h-11 w-full rounded-2xl border border-orange-400/60 px-4 py-2.5 text-sm font-bold text-orange-300 transition-all hover:bg-orange-400/10 active:scale-95 disabled:opacity-60"
    >
        {submitting ? "Joining…" : "Join r/urjo for new boards"}
    </button>
    {#if error}
        <p class="text-center text-xs font-semibold text-red-300" role="alert">{error}</p>
    {/if}
{/if}
