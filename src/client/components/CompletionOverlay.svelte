<script lang="ts">
  import { fade } from "svelte/transition";
  import Coins from "lucide-svelte/icons/coins";
  import MessageSquare from "lucide-svelte/icons/message-square";

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

    /** Whether the victory comment has already been posted in this session */
    hasCommentedVictory?: boolean;

    /** Whether the victory comment is being posted */
    commentingVictory?: boolean;

    /** Called when Challenge button is clicked (optional) */
    onChallenge?: () => void;

    /** Personal challenge beat info (if user beat a challenge) */
    personalChallengeBeat?: {
      challengerUsername: string;
      challengerTime: number;
    } | null;
  };

  let {
    isCompleted,
    timeTaken,
    coins,
    loginGate,
    onContinue,
    onCommentVictory,
    hasCommentedVictory = false,
    commentingVictory = false,
    onChallenge,
    personalChallengeBeat = null,
  }: Props = $props();
</script>

{#if isCompleted}
  <div
    transition:fade={{ duration: 200 }}
    class="fixed inset-0 z-50 flex flex-col items-center justify-between bg-theme-bg-primary px-6 py-10"
  >
    <!-- Top spacer -->
    <div class="flex-1"></div>

    <!-- Hero -->
    <div class="flex flex-col items-center gap-5">
      <div class="text-8xl leading-none select-none" aria-hidden="true">🏆</div>
      <div class="flex flex-col items-center gap-1">
        <p class="text-3xl font-bold text-yellow-400 text-center">
          Solved in {timeTaken}s!
        </p>
        {#if loginGate.showWallet && coins !== undefined}
          <div
            class="flex items-center gap-2 text-sm font-semibold text-yellow-300"
          >
            <Coins class="w-4 h-4 text-yellow-400" />
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
          disabled={commentingVictory || hasCommentedVictory}
          class="w-full px-4 py-4 bg-urjo-blue text-white font-bold rounded-2xl text-base hover:opacity-90 active:scale-95 transition-all disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-2"
        >
          <MessageSquare class="w-5 h-5" />
          {#if commentingVictory}
            Commenting...
          {:else if hasCommentedVictory}
            Victory Commented
          {:else}
            Comment Your Victory
          {/if}
        </button>
      {/if}

      <div class="grid grid-cols-2 gap-3 w-full">
        <button
          onclick={onContinue}
          class="w-full px-4 py-3.5 border border-white/70 text-white font-semibold rounded-2xl text-sm hover:bg-white/10 active:scale-95 transition-all"
        >
          Continue
        </button>

        {#if onChallenge && loginGate.showSocialActions}
          <button
            onclick={onChallenge}
            class="w-full px-4 py-3.5 bg-yellow-500 text-yellow-950 font-bold rounded-2xl text-sm hover:bg-yellow-400 active:scale-95 transition-all"
          >
            Challenge
          </button>
        {:else}
          <div aria-hidden="true"></div>
        {/if}
      </div>
    </div>
  </div>
{/if}
