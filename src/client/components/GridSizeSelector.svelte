<script lang="ts">
    type Props = {
        gridSize: number;
        onGridSizeChange: (size: number) => void;
    };

    let { gridSize, onGridSizeChange }: Props = $props();

    const sizes = [4, 6, 8] as const;
</script>

<div
    class="flex items-center gap-1 p-1 rounded-xl bg-theme-bg-secondary"
    role="group"
    aria-label="Grid size selector"
>
    {#each sizes as size}
        <button
            onclick={() => onGridSizeChange(size)}
            aria-pressed={gridSize === size}
            aria-label="Select {size}×{size} grid"
            class="px-3 py-1 rounded-lg text-xs font-bold transition-all
				{gridSize === size
                ? 'bg-urjo-coral text-white shadow-sm'
                : 'text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-hover'}"
        >
            {size}×{size}
        </button>
    {/each}
</div>
