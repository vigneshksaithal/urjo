<script lang="ts">
    import { navigateTo, showToast } from "@devvit/web/client";
    import ArrowLeft from "lucide-svelte/icons/arrow-left";
    import Check from "lucide-svelte/icons/check";
    import Loader2 from "lucide-svelte/icons/loader-2";
    import X from "lucide-svelte/icons/x";

    import type { Difficulty, GridSize } from "../../shared/constants";
    import type { PublicPuzzle } from "../../shared/types";
    import {
        createEditorSolution,
        getEditorCompletion,
        updateEditorCell,
    } from "../lib/level-editor";

    type Props = {
        isOpen: boolean;
        initialGridSize: number;
        seedSolution?: string | undefined;
        onClose: () => void;
    };

    type PreviewPayload = {
        status: "success";
        data: { draftId: string; puzzle: PublicPuzzle };
    } | { status: "error"; message: string };

    type PublishPayload = {
        status: "success";
        data: { postId: string; postUrl: string };
    } | { status: "error"; message: string };

    const BOARD_SIZES = [4, 6, 8] as const;
    const DIFFICULTIES = ["easy", "medium", "hard", "diabolical"] as const;

    let { isOpen, initialGridSize, seedSolution, onClose }: Props = $props();

    let gridSize = $state<GridSize>(4);
    let difficulty = $state<Difficulty>("medium");
    let solutions = $state<Record<GridSize, string>>({
        4: createEditorSolution(4),
        6: createEditorSolution(6),
        8: createEditorSolution(8),
    });
    let title = $state("Try my Urjo level");
    let preview = $state<PublicPuzzle | null>(null);
    let draftId = $state<string | null>(null);
    let previewing = $state(false);
    let publishing = $state(false);
    let error = $state<string | null>(null);
    let postUrl = $state<string | null>(null);
    let wasOpen = $state(false);

    const solution = $derived(solutions[gridSize]);
    const completion = $derived(getEditorCompletion(solution, gridSize));
    const editorCells = $derived(solution.split(""));
    const previewCells = $derived(preview?.colors.split("") ?? []);
    const gridTemplate = $derived(`grid-template-columns: repeat(${gridSize}, 1fr)`);

    $effect(() => {
        if (isOpen && !wasOpen) resetEditor();
        wasOpen = isOpen;
    });

    function resetEditor(): void {
        const selected = isBoardSize(initialGridSize) ? initialGridSize : 4;
        gridSize = selected;
        difficulty = "medium";
        solutions = {
            4: createEditorSolution(4, selected === 4 ? seedSolution : undefined),
            6: createEditorSolution(6, selected === 6 ? seedSolution : undefined),
            8: createEditorSolution(8, selected === 8 ? seedSolution : undefined),
        };
        title = "Try my Urjo level";
        clearPreview();
        postUrl = null;
    }

    function selectSize(size: GridSize): void {
        gridSize = size;
        clearPreview();
    }

    function updateCell(index: number): void {
        solutions = {
            ...solutions,
            [gridSize]: updateEditorCell(solution, index),
        };
        clearPreview();
    }

    function clearPreview(): void {
        preview = null;
        draftId = null;
        error = null;
    }

    async function requestPreview(): Promise<void> {
        if (completion.filled !== completion.total || previewing) return;
        previewing = true;
        error = null;
        try {
            const response = await fetch("/api/custom-levels/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ gridSize, difficulty, solution }),
            });
            const payload = await response.json() as PreviewPayload;
            if (!response.ok || payload.status === "error") {
                throw new Error(payload.status === "error" ? payload.message : "Preview failed");
            }
            draftId = payload.data.draftId;
            preview = payload.data.puzzle;
        } catch (caught) {
            error = caught instanceof Error ? caught.message : "Unable to preview this level";
        } finally {
            previewing = false;
        }
    }

    async function publishLevel(): Promise<void> {
        if (draftId === null || publishing) return;
        publishing = true;
        error = null;
        try {
            const response = await fetch("/api/custom-levels/publish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ draftId, title }),
            });
            const payload = await response.json() as PublishPayload;
            if (!response.ok || payload.status === "error") {
                throw new Error(payload.status === "error" ? payload.message : "Publish failed");
            }
            postUrl = payload.data.postUrl;
            showToast("Your level is live!");
        } catch (caught) {
            error = caught instanceof Error ? caught.message : "Unable to publish this level";
        } finally {
            publishing = false;
        }
    }

    function isBoardSize(value: number): value is GridSize {
        return BOARD_SIZES.includes(value as GridSize);
    }
</script>

{#if isOpen}
    <div class="fixed inset-0 z-[70] h-full w-full overflow-hidden bg-[#071b25] text-white">
        <div class="relative flex h-full w-full flex-col overflow-hidden">
            <header class="flex h-16 flex-none items-center justify-between border-b border-white/10 px-4">
                <button
                    type="button"
                    onclick={preview ? clearPreview : onClose}
                    class="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 active:scale-95"
                    aria-label={preview ? "Back to editor" : "Close level editor"}
                >
                    {#if preview}<ArrowLeft class="h-5 w-5" />{:else}<X class="h-5 w-5" />{/if}
                </button>
                <div class="text-center">
                    <p class="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Level studio</p>
                    <h2 class="text-lg font-black">{preview ? "Preview & publish" : "Design the solution"}</h2>
                </div>
                <div class="h-11 w-11" aria-hidden="true"></div>
            </header>

            {#if postUrl}
                <main class="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
                    <div class="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-400 text-emerald-950 shadow-[0_0_0_14px_rgba(52,211,153,0.12)]">
                        <Check class="h-12 w-12" />
                    </div>
                    <h3 class="mt-7 text-3xl font-black">Level published</h3>
                    <p class="mt-2 max-w-xs text-sm font-medium text-white/65">Your board is now playable in the subreddit.</p>
                </main>
                <footer class="flex-none space-y-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <button type="button" onclick={() => navigateTo(postUrl ?? "")} class="min-h-14 w-full rounded-2xl bg-cyan-300 px-4 text-base font-black text-slate-950 active:scale-[0.98]">
                        Open your level
                    </button>
                    <button type="button" onclick={onClose} class="min-h-12 w-full rounded-2xl border border-white/20 px-4 text-sm font-bold text-white/80">
                        Back to result
                    </button>
                </footer>
            {:else if preview}
                <main class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-4 py-3">
                    <div class="text-center">
                        <p class="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Uniquely solvable</p>
                        <p class="mt-1 text-sm font-semibold text-white/65">This is what players will receive.</p>
                    </div>
                    <div class="grid aspect-square w-full max-w-[19rem] gap-1" style={gridTemplate} aria-label="Generated level preview">
                        {#each previewCells as cell, index}
                            <div class="relative aspect-square rounded-full {cell === 'r' ? 'bg-[#e85d4a]' : cell === 'b' ? 'bg-[#439fe0]' : 'bg-white/10'}">
                                {#if preview.numbers[index] !== "-"}
                                    <span class="absolute inset-0 flex items-center justify-center text-sm font-black text-white drop-shadow">{preview.numbers[index]}</span>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </main>
                <footer class="flex-none space-y-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <label for="custom-level-title" class="block text-xs font-bold text-white/70">Reddit post title</label>
                    <input
                        id="custom-level-title"
                        type="text"
                        bind:value={title}
                        maxlength="120"
                        disabled={publishing}
                        class="min-h-12 w-full rounded-2xl border border-white/15 bg-white/8 px-4 text-base font-semibold text-white outline-none focus:border-cyan-300"
                    />
                    <p class="text-center text-[11px] font-medium text-white/55">Creates a Reddit post from your account. Publishing is optional and separate from gameplay.</p>
                    {#if error}<p class="text-center text-xs font-semibold text-red-300" role="alert">{error}</p>{/if}
                    <button
                        type="button"
                        onclick={publishLevel}
                        disabled={publishing || title.trim().length === 0}
                        class="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 text-base font-black text-slate-950 active:scale-[0.98] disabled:opacity-50"
                    >
                        {#if publishing}<Loader2 class="h-5 w-5 animate-spin" />{/if}
                        {publishing ? "Publishing…" : "Publish level"}
                    </button>
                </footer>
            {:else}
                <main class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden px-4 py-3">
                    <div class="flex w-full max-w-sm rounded-2xl bg-white/7 p-1" aria-label="Board size">
                        {#each BOARD_SIZES as size}
                            <button
                                type="button"
                                onclick={() => selectSize(size)}
                                class="min-h-11 flex-1 rounded-xl text-sm font-black transition-colors {gridSize === size ? 'bg-cyan-300 text-slate-950' : 'text-white/65'}"
                            >
                                {size}×{size}
                            </button>
                        {/each}
                    </div>

                    <div class="grid aspect-square w-full max-w-[19rem] gap-1" style={gridTemplate} aria-label="Editable level solution">
                        {#each editorCells as cell, index}
                            <button
                                type="button"
                                onclick={() => updateCell(index)}
                                class="aspect-square rounded-full border border-white/8 transition-transform active:scale-90 {cell === 'r' ? 'bg-[#e85d4a]' : cell === 'b' ? 'bg-[#439fe0]' : 'bg-white/10'}"
                                aria-label="Cell {index + 1}: {cell === 'r' ? 'red' : cell === 'b' ? 'blue' : 'empty'}"
                            ></button>
                        {/each}
                    </div>

                    <div class="w-full max-w-sm">
                        <div class="flex items-center justify-between text-xs font-bold text-white/65">
                            <span>Split every line evenly; neighboring lines must differ.</span>
                            <span>{completion.filled}/{completion.total}</span>
                        </div>
                        <div class="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                            <div class="h-full rounded-full bg-cyan-300 transition-all" style:width={`${completion.percent}%`}></div>
                        </div>
                    </div>
                </main>
                <footer class="flex-none space-y-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <div class="grid grid-cols-4 gap-1 rounded-2xl bg-white/7 p-1" aria-label="Difficulty">
                        {#each DIFFICULTIES as option}
                            <button
                                type="button"
                                onclick={() => { difficulty = option; clearPreview(); }}
                                class="min-h-10 rounded-xl text-[11px] font-black capitalize {difficulty === option ? 'bg-white text-slate-950' : 'text-white/60'}"
                            >
                                {option}
                            </button>
                        {/each}
                    </div>
                    {#if error}<p class="text-center text-xs font-semibold text-red-300" role="alert">{error}</p>{/if}
                    <button
                        type="button"
                        onclick={requestPreview}
                        disabled={completion.filled !== completion.total || previewing}
                        class="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 text-base font-black text-slate-950 active:scale-[0.98] disabled:opacity-40"
                    >
                        {#if previewing}<Loader2 class="h-5 w-5 animate-spin" />{/if}
                        {previewing ? "Checking level…" : "Generate playable preview"}
                    </button>
                </footer>
            {/if}
        </div>
    </div>
{/if}
