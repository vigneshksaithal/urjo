<script lang="ts">
    import { onMount } from "svelte";

    type HintKind = "numberConstraint" | "adjacencyViolation";

    type Props = {
        text: string;
        kind: HintKind;
        onDismiss: () => void;
    };

    let { text, kind, onDismiss }: Props = $props();

    let dismissing = $state(false);

    // Fire-and-forget POST to persist dismissal; failures are acceptable —
    // the hint will reappear next session but the session flag prevents re-show
    // within the current session (per design doc error handling section).
    const persistDismissal = (): void => {
        fetch("/api/game/hints/dismiss", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind }),
        }).catch(() => {
            // Non-blocking: hint will reappear next session if this fails
        });
    };

    const dismiss = (): void => {
        if (dismissing) return;
        dismissing = true;
        persistDismissal();
        onDismiss();
    };

    // Auto-dismiss after 3500ms (Req 8.3)
    onMount(() => {
        const timer = setTimeout(dismiss, 3500);
        return () => clearTimeout(timer);
    });

    const kindLabel = $derived(
        kind === "numberConstraint" ? "number-hint" : "adjacency-hint",
    );
</script>

<!-- Click-outside backdrop — transparent, covers the full viewport -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-30" onclick={dismiss} aria-hidden="true"></div>

<!-- Tooltip bubble — anchored near the bottom of the game board area -->
<div
    role="tooltip"
    id={kindLabel}
    class="fixed bottom-16 left-1/2 -translate-x-1/2 z-40
		max-w-[calc(100%-2rem)] w-max
		bg-theme-bg-modal border border-theme-border
		rounded-xl px-4 py-3 shadow-xl
		flex items-start gap-2
		animate-hint-in"
>
    <!-- Kind-specific icon -->
    <span class="text-base shrink-0 mt-0.5" aria-hidden="true">
        {#if kind === "numberConstraint"}💡{:else}⚠️{/if}
    </span>

    <p class="text-sm text-theme-text-primary leading-snug">{text}</p>

    <!-- Explicit dismiss button for accessibility -->
    <button
        onclick={(e) => {
            e.stopPropagation();
            dismiss();
        }}
        class="shrink-0 ml-1 text-theme-text-muted hover:text-theme-text-primary transition-colors"
        aria-label="Dismiss hint"
    >
        <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
        >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    </button>
</div>

<style>
    @keyframes hintIn {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(8px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }

    .animate-hint-in {
        animation: hintIn 200ms ease-out forwards;
    }
</style>
