<script lang="ts">
  import { fade } from "svelte/transition";
  import MessageSquare from "lucide-svelte/icons/message-square";
  import ChallengeComposer from "./ChallengeComposer.svelte";

  type Props = {
    /** Whether the overlay is visible */
    isCompleted: boolean;

    /** Time taken to solve puzzle (seconds) */
    timeTaken: number;

    /** User's coin balance (undefined for logged-out users) */
    coins?: number;

    /** Login gate flags for conditional rendering */
    loginGate: {
      showWallet: boolean;
      showSocialActions: boolean;
    };

    /** Called when Continue button is clicked */
    onContinue: () => void;

    /** Called when Comment Your Victory button is clicked (optional) */
    onCommentVictory?: () => void;

    /** Whether the victory comment is being posted */
    commentingVictory?: boolean;

    /** Called when Challenge button is clicked (optional) */
    onChallenge?: (customTitle?: string) => void;

    /** Whether a challenge post has already been created this session */
    hasChallenged?: boolean;

    /** Personal challenge beat info (if user beat a challenge) */
    personalChallengeBeat?: {
      challengerUsername: string;
      challengerTime: number;
    } | null;

    /** Solved puzzle grid colors string — used to build the emoji share card. */
    puzzleColors?: string;
    /** Grid size — required to split puzzleColors into rows. */
    gridSize?: number;
    /** Puzzle number — shown in the share card header. */
    puzzleNumber?: number;
  };

  let {
    isCompleted,
    timeTaken,
    coins,
    loginGate,
    onContinue,
    onCommentVictory,
    commentingVictory = false,
    onChallenge,
    hasChallenged = false,
    personalChallengeBeat = null,
    puzzleColors = "",
    gridSize = 4,
    puzzleNumber = 0,
  }: Props = $props();

  let showChallengeComposer = $state(false);

  function openChallengeComposer(): void {
    showChallengeComposer = true;
  }

  function closeChallengeComposer(): void {
    showChallengeComposer = false;
  }

  function submitChallenge(customTitle?: string): void {
    onChallenge?.(customTitle);
    showChallengeComposer = false;
  }
</script>

{#if isCompleted}
  <div
    transition:fade={{ duration: 200 }}
    class="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#1a1a1a] px-5 py-8"
  >
    <!-- Top spacer -->
    <div class="flex-1"></div>

    <!-- Hero -->
    <div class="flex flex-col items-center gap-4">
      <div class="text-[7rem] leading-none select-none" aria-hidden="true">
        🏆
      </div>
      <div class="flex flex-col items-center gap-2">
        <p class="text-3xl font-bold text-yellow-400 text-center">
          Solved in {timeTaken}s!
        </p>
        {#if loginGate.showWallet && coins !== undefined}
          <div
            class="flex items-center gap-1.5 text-sm font-semibold text-yellow-400"
          >
            <span class="text-base">🪙</span>
            <span>{coins} coins collected</span>
          </div>
        {/if}
        {#if personalChallengeBeat}
          <p class="text-sm font-semibold text-green-400 text-center">
            🎉 You beat {personalChallengeBeat.challengerUsername}'s {personalChallengeBeat.challengerTime}s!
          </p>
        {/if}
      </div>
    </div>

    <!-- Bottom spacer -->
    <div class="flex-1"></div>

    <!-- Action buttons -->
    <div class="flex flex-col gap-3 w-full">
      {#if onCommentVictory && loginGate.showSocialActions}
        <button
          onclick={onCommentVictory}
          disabled={commentingVictory}
          class="w-full px-4 py-4 bg-urjo-blue text-white font-bold rounded-2xl text-base hover:opacity-90 active:scale-95 transition-all disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-2.5"
        >
          <MessageSquare class="w-5 h-5" />
          {#if commentingVictory}
            Commenting...
          {:else}
            Comment Your Victory
          {/if}
        </button>
      {/if}

      <div class="grid grid-cols-2 gap-3 w-full">
        <button
          onclick={onContinue}
          class="w-full px-4 py-4 border border-white/60 text-white font-semibold rounded-2xl text-base hover:bg-white/10 active:scale-95 transition-all"
        >
          Continue
        </button>

        {#if onChallenge && loginGate.showSocialActions}
          <button
            onclick={openChallengeComposer}
            disabled={hasChallenged}
            class="w-full px-4 py-4 bg-yellow-500 text-yellow-950 font-bold rounded-2xl text-base hover:bg-yellow-400 active:scale-95 transition-all disabled:opacity-60 disabled:active:scale-100"
          >
            {#if hasChallenged}
              ✓ Challenged
            {:else}
              Challenge
            {/if}
          </button>
        {:else}
          <div aria-hidden="true"></div>
        {/if}
      </div>
    </div>
  </div>

  <ChallengeComposer
    isOpen={showChallengeComposer}
    onClose={closeChallengeComposer}
    onSubmit={submitChallenge}
  />
{/if}
