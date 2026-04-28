<script lang="ts">
    type Props = {
        puzzleNumber?: number;
        communityStats?: {
            activePlayers: number;
            collectiveStreakDays: number;
        };
        onPlay: () => void;
    };

    let {
        puzzleNumber = 0,
        communityStats = { activePlayers: 0, collectiveStreakDays: 0 },
        onPlay,
    }: Props = $props();

    // 4×4 sample puzzle with 2-3 pre-colored cells
    const SAMPLE_GRID: (string | null)[][] = [
        ["red", null, null, null],
        [null, null, "blue", null],
        [null, "red", null, null],
        [null, null, null, null],
    ];

    function getCellClass(cell: string | null): string {
        if (cell === "red") return "bg-urjo-coral";
        if (cell === "blue") return "bg-urjo-blue";
        return "bg-theme-bg-secondary border border-theme-border";
    }
</script>

<div
    class="h-full w-full overflow-hidden flex flex-col items-center justify-center p-6 gap-5"
>
    <!-- Logo and puzzle number -->
    <div class="flex flex-col items-center gap-1">
        <h1 class="text-3xl font-bold text-theme-text-primary">🧩 Urjo</h1>
        {#if puzzleNumber > 0}
            <p class="text-sm text-theme-text-muted">Puzzle #{puzzleNumber}</p>
        {/if}
    </div>

    <!-- Sample 4×4 puzzle -->
    <div class="grid grid-cols-4 gap-1.5 w-40">
        {#each SAMPLE_GRID as row}
            {#each row as cell}
                <div
                    class="aspect-square rounded-md {getCellClass(cell)}"
                ></div>
            {/each}
        {/each}
    </div>

    <!-- Instruction -->
    <p
        class="text-sm text-theme-text-secondary text-center max-w-xs leading-relaxed"
    >
        Tap cells to color them. Fill the grid so each row and column has equal
        reds and blues.
    </p>

    <!-- Play CTA -->
    <button
        onclick={onPlay}
        class="px-10 py-3 bg-theme-text-primary text-theme-bg-primary font-bold rounded-xl text-lg hover:opacity-90 active:scale-95 transition-all shadow-lg"
    >
        Play
    </button>

    <!-- Community stats -->
    {#if communityStats.activePlayers > 0 || communityStats.collectiveStreakDays > 0}
        <p class="text-xs text-theme-text-muted text-center">
            👥 {communityStats.activePlayers.toLocaleString()} active players · 🔥
            {communityStats.collectiveStreakDays.toLocaleString()} collective streak
            days
        </p>
    {/if}
</div>
