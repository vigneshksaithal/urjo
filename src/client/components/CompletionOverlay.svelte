<script lang="ts">
  import { fade } from "svelte/transition";
  import ArrowRight from "lucide-svelte/icons/arrow-right";
  import CircleCheckBig from "lucide-svelte/icons/circle-check-big";
  import Coins from "lucide-svelte/icons/coins";
  import Flame from "lucide-svelte/icons/flame";
  import Medal from "lucide-svelte/icons/medal";
  import MessageSquare from "lucide-svelte/icons/message-square";
  import PenTool from "lucide-svelte/icons/pen-tool";

  import ChallengeComposer from "./ChallengeComposer.svelte";
  import LevelEditor from "./LevelEditor.svelte";

  type Props = {
    isCompleted: boolean;
    completionPending?: boolean;
    completionVerified?: boolean;
    timeTaken: number;
    earnedCoins?: number;
    seasonRank?: number | null;
    pathLevel?: number;
    streak?: number;
    loginGate: {
      showWallet: boolean;
      showSocialActions: boolean;
      showLoginCta: boolean;
    };
    onContinue: () => void;
    onCommentVictory?: (commentMessage: string) => void | Promise<void>;
    onLogin?: () => void;
    commentingVictory?: boolean;
    onChallenge?: (customTitle?: string) => void;
    onOpenChallenge?: () => void;
    onShareChallenge?: () => void;
    sharingChallenge?: boolean;
    hasChallenged?: boolean;
    personalChallengeBeat?: {
      challengerUsername: string;
      challengerTime: number;
    } | null;
    gridSize?: number;
    puzzleNumber?: number;
    editorSeedSolution?: string;
  };

  let {
    isCompleted,
    completionPending = false,
    completionVerified = false,
    timeTaken,
    earnedCoins = 0,
    seasonRank = null,
    pathLevel = 1,
    streak = 0,
    loginGate,
    onContinue,
    onCommentVictory,
    onLogin,
    commentingVictory = false,
    onChallenge,
    onOpenChallenge,
    onShareChallenge,
    sharingChallenge = false,
    hasChallenged = false,
    personalChallengeBeat = null,
    gridSize = 4,
    puzzleNumber = 0,
    editorSeedSolution = undefined,
  }: Props = $props();

  let showChallengeComposer = $state(false);
  let showLevelEditor = $state(false);
  let showCommentForm = $state(false);
  let commentMessage = $state("");

  function submitChallenge(customTitle?: string): void {
    onChallenge?.(customTitle);
    showChallengeComposer = false;
  }

  function handleCommentVictory(): void {
    onCommentVictory?.(commentMessage.trim());
  }

  $effect(() => {
    if (isCompleted) {
      showCommentForm = false;
      showLevelEditor = false;
      commentMessage = "";
    }
  });
</script>

{#if isCompleted}
  <div
    transition:fade={{ duration: 180 }}
    class="fixed inset-0 z-50 flex h-full w-full flex-col overflow-hidden bg-[#1C1C1E] text-white"
  >
    <main class="flex min-h-0 flex-1 flex-col items-center justify-start overflow-hidden px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] text-center">
      <div class="flex items-center gap-2 rounded-full bg-[#2C2C2E] px-4 py-2 text-xs font-bold text-[#FCD34D]">
        <CircleCheckBig class="h-4 w-4 text-[#34C759]" strokeWidth={2.5} />
        Level {pathLevel} complete
      </div>

      <h1 id="completion-title" class="mt-3 text-2xl font-black">Puzzle solved</h1>

      <p class="mt-1 text-[3.5rem] font-black leading-none tracking-tight" aria-label={`Solved in ${timeTaken} seconds`}>
        {timeTaken}<span class="ml-1 text-2xl font-bold text-[#8E8E93]">s</span>
      </p>
      <p class="mt-1 text-sm font-medium text-[#8E8E93]">
        Puzzle #{puzzleNumber} · {gridSize}×{gridSize}
      </p>

      {#if personalChallengeBeat}
        <p class="mt-3 rounded-full bg-[#34C759]/12 px-4 py-2 text-xs font-bold text-[#34C759]">
          Beat u/{personalChallengeBeat.challengerUsername} by {personalChallengeBeat.challengerTime - timeTaken}s
        </p>
      {/if}

      {#if !showCommentForm}
        <section class="mt-4 flex w-full max-w-sm items-center rounded-[20px] bg-[#2C2C2E] px-3 py-3" aria-label="Completion rewards">
          <div class="flex min-w-0 flex-1 flex-col items-center">
            <Flame class="h-5 w-5 text-[#FCD34D]" />
            <span class="mt-1 text-lg font-black">{streak}</span>
            <span class="text-[11px] font-semibold text-[#8E8E93]">Streak</span>
          </div>
          <span class="h-10 w-px bg-white/10" aria-hidden="true"></span>
          <div class="flex min-w-0 flex-1 flex-col items-center">
            <Coins class="h-5 w-5 text-[#FDE68A]" />
            <span class="mt-1 text-lg font-black">{completionPending ? "—" : `+${earnedCoins}`}</span>
            <span class="text-[11px] font-semibold text-[#8E8E93]">Coins</span>
          </div>
          <span class="h-10 w-px bg-white/10" aria-hidden="true"></span>
          <div class="flex min-w-0 flex-1 flex-col items-center">
            <Medal class="h-5 w-5 text-[#60A5FA]" />
            <span class="mt-1 text-lg font-black">{completionPending ? "—" : seasonRank === null ? "—" : `#${seasonRank}`}</span>
            <span class="text-[11px] font-semibold text-[#8E8E93]">Season</span>
          </div>
        </section>
      {/if}
    </main>

    <footer aria-label="Completion actions" data-action-priority="comment-challenge-create-continue" class="flex-none rounded-t-[28px] bg-[#2C2C2E] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      <div class="mx-auto w-full max-w-sm">
        {#if completionVerified && loginGate.showSocialActions}
          {#if showCommentForm && onCommentVictory}
            <div>
              <div class="flex items-center justify-center gap-2">
                <MessageSquare class="h-4 w-4 text-[#60A5FA]" />
                <p class="text-sm font-bold">Comment your score</p>
              </div>
              <p class="mt-1 text-center text-xs text-[#8E8E93]">Posts publicly from your Reddit account in the pinned thread.</p>
              <input
                id="victory-comment"
                type="text"
                bind:value={commentMessage}
                maxlength="400"
                placeholder="Add an optional message"
                disabled={commentingVictory}
                class="mt-2 min-h-11 w-full rounded-full bg-[#3A3A3C] px-5 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-[#60A5FA]"
              />
              <div class="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onclick={() => (showCommentForm = false)} disabled={commentingVictory} class="min-h-11 rounded-full bg-white/8 text-sm font-bold text-[#EBEBF5]">Cancel</button>
                <button type="button" onclick={handleCommentVictory} disabled={commentingVictory} class="min-h-11 rounded-full bg-[#2563EB] text-sm font-bold text-white disabled:opacity-50">
                  {commentingVictory ? "Posting…" : "Post comment"}
                </button>
              </div>
            </div>
          {:else}
            {#if onCommentVictory}
              <button type="button" onclick={() => (showCommentForm = true)} class="flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-[#2563EB] px-5 text-left text-white shadow-[0_5px_0_#1A4FA8] transition-transform active:translate-y-1 active:shadow-[0_1px_0_#1A4FA8]">
                <MessageSquare class="h-5 w-5 flex-none" />
                <span class="flex flex-col leading-tight">
                  <span class="text-base font-black">Comment score</span>
                  <span class="mt-0.5 text-[11px] font-semibold text-white/75">Post publicly in the score thread</span>
                </span>
              </button>
            {/if}

            {#if hasChallenged}
              <div class="mt-2 grid grid-cols-2 gap-2">
                {#if onOpenChallenge}<button type="button" onclick={onOpenChallenge} class="min-h-11 rounded-full bg-white/8 text-sm font-bold text-[#FCD34D]">Open rival</button>{/if}
                {#if onShareChallenge}<button type="button" onclick={onShareChallenge} disabled={sharingChallenge} class="min-h-11 rounded-full bg-white/8 text-sm font-bold text-[#60A5FA] disabled:opacity-50">{sharingChallenge ? "Opening…" : "Share rival"}</button>{/if}
              </div>
              <button type="button" onclick={() => (showLevelEditor = true)} class="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white/8 px-3 text-sm font-bold text-[#EBEBF5] active:scale-95">
                <PenTool class="h-4 w-4 text-[#60A5FA]" />
                <span>Create level</span>
              </button>
            {:else}
              <div class="mt-2 grid grid-cols-2 gap-2">
                {#if onChallenge}
                  <button type="button" onclick={() => (showChallengeComposer = true)} class="flex min-h-11 items-center justify-center rounded-full bg-white/8 px-3 text-sm font-bold text-[#FCD34D] active:scale-95"><span>Challenge</span></button>
                {/if}
                <button type="button" onclick={() => (showLevelEditor = true)} class="flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/8 px-3 text-sm font-bold text-[#EBEBF5] active:scale-95">
                  <PenTool class="h-4 w-4 text-[#60A5FA]" />
                  <span>Create level</span>
                </button>
              </div>
            {/if}
          {/if}
        {:else if completionVerified && loginGate.showLoginCta && onLogin}
          <button type="button" onclick={onLogin} class="min-h-11 w-full rounded-full bg-white/8 px-4 text-sm font-bold text-[#60A5FA]">Sign in to comment, challenge, and create levels</button>
        {/if}

        <button
          type="button"
          onclick={onContinue}
          disabled={completionPending}
          class="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#3A3A3C] px-6 text-sm font-black text-white transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <span>{completionPending ? "Preparing next puzzle…" : "Continue"}</span>
          {#if !completionPending}<ArrowRight class="h-4 w-4" />{/if}
        </button>
      </div>
    </footer>
  </div>

  <ChallengeComposer
    isOpen={showChallengeComposer}
    {puzzleNumber}
    {timeTaken}
    {gridSize}
    onClose={() => (showChallengeComposer = false)}
    onSubmit={submitChallenge}
  />

  <LevelEditor
    isOpen={showLevelEditor}
    initialGridSize={gridSize}
    seedSolution={editorSeedSolution}
    onClose={() => (showLevelEditor = false)}
  />
{/if}
