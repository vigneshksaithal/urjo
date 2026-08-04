<script lang="ts">
    import type { GridSize } from "../../shared/constants";

    type Props = {
        advertisedGridSize: Exclude<GridSize, 4>;
        loading?: boolean;
        onChoose: (choice: "warmup" | "advertised") => void;
    };

    let {
        advertisedGridSize,
        loading = false,
        onChoose,
    }: Props = $props();
</script>

<main class="h-full w-full flex items-center justify-center px-5 py-6">
    <section class="w-full max-w-sm text-center flex flex-col items-center gap-5">
        <div class="text-5xl" aria-hidden="true">🧩</div>
        <div class="space-y-2">
            <p class="text-xs font-bold uppercase tracking-[0.18em] text-theme-text-muted">
                Today's advertised board
            </p>
            <h1 class="text-3xl font-black text-theme-text-primary">
                {advertisedGridSize}×{advertisedGridSize}
            </h1>
            <p class="text-sm leading-6 text-theme-text-secondary">
                New to Urjo? You can learn on one 4×4 board, then return to
                this exact {advertisedGridSize}×{advertisedGridSize} puzzle.
            </p>
        </div>

        <div class="w-full flex flex-col gap-3">
            <button
                type="button"
                disabled={loading}
                onclick={() => onChoose("warmup")}
                class="min-h-12 w-full rounded-xl bg-theme-text-primary px-5 py-3 font-bold text-theme-bg-primary disabled:opacity-50"
            >
                Warm up with 4×4
            </button>
            <button
                type="button"
                disabled={loading}
                onclick={() => onChoose("advertised")}
                class="min-h-12 w-full rounded-xl border border-theme-border px-5 py-3 font-bold text-theme-text-primary disabled:opacity-50"
            >
                Play {advertisedGridSize}×{advertisedGridSize} now
            </button>
        </div>

        <p class="text-xs text-theme-text-muted">
            Your choice is explicit; Urjo will never silently replace the
            advertised board.
        </p>
    </section>
</main>
