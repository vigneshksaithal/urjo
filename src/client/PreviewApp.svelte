<script lang="ts">
    import { requestExpandedMode } from "@devvit/web/client";

    let expanding = $state(false);
    let error = $state<string | null>(null);

    // Grid pattern: alternating coral/blue, no two same in a row/col
    const cells: ("coral" | "blue")[] = [
        "coral",
        "blue",
        "coral",
        "blue",
        "blue",
        "coral",
        "blue",
        "coral",
        "coral",
        "blue",
        "coral",
        "blue",
        "blue",
        "coral",
        "blue",
        "coral",
    ];

    function handlePlay(event: MouseEvent): void {
        if (expanding) return;
        expanding = true;
        error = null;
        try {
            requestExpandedMode(event, "game");
        } catch (e) {
            error = e instanceof Error ? e.message : "Could not open game";
            expanding = false;
        }
    }
</script>

<div
    class="h-full w-full overflow-hidden flex flex-col items-center justify-center gap-6 px-6 bg-theme-bg-primary relative"
>
    <!-- Soft ambient blobs -->
    <div
        class="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full opacity-10 blur-3xl pointer-events-none bg-urjo-coral"
        aria-hidden="true"
    ></div>
    <div
        class="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full opacity-10 blur-3xl pointer-events-none bg-urjo-blue"
        aria-hidden="true"
    ></div>

    <!-- Grid icon -->
    <div class="relative">
        <!-- Glow ring behind the card -->
        <div
            class="absolute -inset-2 rounded-2xl opacity-20 blur-lg pointer-events-none bg-urjo-coral"
            aria-hidden="true"
        ></div>
        <div
            class="relative grid grid-cols-4 gap-1 p-2 rounded-2xl border border-theme-border bg-theme-bg-secondary shadow-lg"
            style="width: 8rem; height: 8rem;"
            aria-hidden="true"
        >
            {#each cells as cell, i (i)}
                <div
                    class="rounded-full {cell === 'coral'
                        ? 'bg-urjo-coral'
                        : 'bg-urjo-blue'}"
                ></div>
            {/each}
        </div>
    </div>

    <!-- Name -->
    <h1 class="text-5xl font-bold tracking-tight text-theme-text-primary">
        Urjo
    </h1>

    <!-- Bouncy full-pill Play button -->
    <button
        onclick={handlePlay}
        disabled={expanding}
        class="animate-bounce-btn w-full py-5 rounded-full font-bold text-3xl bg-urjo-coral text-white shadow-lg disabled:opacity-50"
        aria-label="Play Urjo"
    >
        {expanding ? "Opening…" : "▶ Play"}
    </button>

    {#if error}
        <p class="text-xs text-red-400 text-center">{error}</p>
    {/if}
</div>
