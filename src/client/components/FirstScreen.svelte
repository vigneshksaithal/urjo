<script lang="ts">
    import type { SerializedPuzzle } from "../../shared/types";

    type PreviewCell = {
        color: "red" | "blue" | null;
        number: number | null;
    };

    type TargetToBeat = {
        seconds: number;
        username?: string;
    };

    type Props = {
        puzzle: SerializedPuzzle;
        puzzleNumber?: number;
        instruction?: string;
        communityStats?: {
            activePlayers: number;
            collectiveStreakDays: number;
        };
        targetToBeat?: TargetToBeat | undefined;
        onPlay: () => void;
    };

    let {
        puzzle,
        puzzleNumber = 0,
        instruction = "Fill each row and column with equal reds and blues.",
        communityStats = { activePlayers: 0, collectiveStreakDays: 0 },
        targetToBeat = undefined,
        onPlay,
    }: Props = $props();

    const previewCells = $derived(buildPreviewCells(puzzle));
    const previewStyle = $derived(
        `grid-template-columns: repeat(${puzzle.gridSize}, minmax(0, 1fr));`,
    );
    const targetLabel = $derived(formatTarget(targetToBeat));

    function getCellClass(cell: string | null): string {
        if (cell === "red") return "bg-urjo-coral";
        if (cell === "blue") return "bg-urjo-blue";
        return "bg-theme-bg-secondary border border-theme-border";
    }

    function buildPreviewCells(source: SerializedPuzzle): PreviewCell[] {
        return source.colors.split("").map((color, index) => {
            const numberChar = source.numbers[index];
            return {
                color:
                    color === "r" ? "red" : color === "b" ? "blue" : null,
                number:
                    numberChar !== undefined && /\d/.test(numberChar)
                        ? parseInt(numberChar, 10)
                        : null,
            };
        });
    }

    function formatTarget(target: TargetToBeat | undefined): string {
        if (!target) return "Set the first time to beat today";
        if (target.username && target.username !== "Anon") {
            return `Beat ${target.username}'s ${target.seconds}s`;
        }
        return `Beat ${target.seconds}s`;
    }
</script>

<div
    class="h-full w-full overflow-hidden flex flex-col items-center justify-center px-5 py-4 gap-4"
>
    <div class="flex flex-col items-center gap-1 text-center">
        <h1 class="text-3xl font-bold text-theme-text-primary">Urjo</h1>
        {#if puzzleNumber > 0}
            <p class="text-sm text-theme-text-muted">Puzzle #{puzzleNumber}</p>
        {/if}
    </div>

    <div
        class="grid gap-1.5 w-[min(78vw,13rem)] aspect-square"
        style={previewStyle}
        aria-label="Puzzle preview"
    >
        {#each previewCells as cell, index (index)}
            <button
                onclick={onPlay}
                class="aspect-square rounded-md flex items-center justify-center text-xs font-bold text-theme-text-primary cursor-pointer hover:opacity-80 active:scale-95 transition-all shadow-sm {getCellClass(
                    cell.color,
                )}"
                aria-label="Tap to start puzzle"
            >
                {cell.number ?? ""}
            </button>
        {/each}
    </div>

    <div class="flex flex-col items-center gap-1 text-center max-w-xs">
        <p class="text-sm font-semibold text-theme-text-primary">
            {targetLabel}
        </p>
        <p class="text-sm text-theme-text-secondary leading-relaxed">
            {instruction}
        </p>
    </div>

    <button
        onclick={onPlay}
        class="px-10 py-3 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg text-base hover:opacity-90 active:scale-95 transition-all shadow-lg"
    >
        Play
    </button>

    {#if communityStats.activePlayers > 0 || communityStats.collectiveStreakDays > 0}
        <p class="text-xs text-theme-text-muted text-center">
            👥 {communityStats.activePlayers.toLocaleString()} active players · 🔥
            {communityStats.collectiveStreakDays.toLocaleString()} collective streak
            days
        </p>
    {/if}
</div>
