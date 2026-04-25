<script lang="ts">
    type Props = {
        threshold: number;
        bonus: number;
        onDismiss: () => void;
    };

    let { threshold, bonus, onDismiss }: Props = $props();

    // Auto-dismiss after 3.5 seconds (matching existing level-up overlay pattern)
    $effect(() => {
        const timer = setTimeout(onDismiss, 3500);
        return () => clearTimeout(timer);
    });

    const milestoneLabel = $derived(
        threshold >= 365
            ? "🗓️ One Year!"
            : threshold >= 100
              ? "💯 Century!"
              : threshold >= 30
                ? "📅 Monthly!"
                : "🔥 Week Warrior!",
    );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onclick={onDismiss}
>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="bg-theme-bg-modal border border-yellow-500/50 rounded-2xl p-6 max-w-xs w-full flex flex-col items-center gap-3 shadow-2xl text-center"
        onclick={(e) => e.stopPropagation()}
    >
        <div class="text-5xl animate-bounce">🔥</div>
        <div>
            <p
                class="text-xs text-yellow-400 font-semibold uppercase tracking-wide"
            >
                Streak Milestone
            </p>
            <p class="text-2xl font-bold text-theme-text-primary mt-1">
                {threshold}-Day Streak!
            </p>
            <p class="text-sm text-theme-text-muted mt-1">{milestoneLabel}</p>
        </div>
        <div
            class="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-2"
        >
            <span class="text-xl">🪙</span>
            <span class="text-lg font-bold text-yellow-400"
                >+{bonus} bonus coins</span
            >
        </div>
        <p class="text-xs text-theme-text-muted">Tap anywhere to dismiss</p>
    </div>
</div>
