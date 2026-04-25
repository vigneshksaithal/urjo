<script lang="ts">
    import type { MysteryBoxReward } from "../../shared/engagement-types";

    type Props = {
        reward: MysteryBoxReward;
        onDismiss: () => void;
    };

    let { reward, onDismiss }: Props = $props();

    let revealed = $state(false);

    $effect(() => {
        // Auto-reveal after a short delay for the "unboxing" feel
        const timer = setTimeout(() => {
            revealed = true;
        }, 600);
        return () => clearTimeout(timer);
    });

    const rewardEmoji = $derived(
        reward.type === "coins"
            ? "🪙"
            : reward.type === "streak_freeze"
              ? "🧊"
              : "🎭",
    );

    const rewardLabel = $derived(
        reward.type === "coins"
            ? `+${reward.value} coins`
            : reward.type === "streak_freeze"
              ? "Streak Freeze!"
              : "New Title!",
    );

    const rewardDescription = $derived(
        reward.type === "coins"
            ? "Bonus coins added to your wallet"
            : reward.type === "streak_freeze"
              ? "Protects your streak for one missed day"
              : "A new cosmetic title has been added to your collection",
    );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    onclick={onDismiss}
>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="bg-theme-bg-modal border border-theme-border rounded-2xl p-6 max-w-xs w-full flex flex-col items-center gap-4 shadow-2xl"
        onclick={(e) => e.stopPropagation()}
    >
        <!-- Box icon with animation -->
        <div class="relative">
            {#if !revealed}
                <div class="text-6xl animate-bounce">📦</div>
            {:else}
                <div class="text-6xl animate-pulse">{rewardEmoji}</div>
            {/if}
        </div>

        {#if !revealed}
            <p class="text-theme-text-muted text-sm">Opening mystery box...</p>
        {:else}
            <div class="text-center space-y-1">
                <p class="text-xl font-bold text-yellow-400">{rewardLabel}</p>
                <p class="text-sm text-theme-text-muted">{rewardDescription}</p>
            </div>

            <button
                onclick={onDismiss}
                class="w-full px-4 py-2.5 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg text-sm hover:opacity-90 active:scale-95 transition-all"
            >
                Awesome!
            </button>
        {/if}
    </div>
</div>
