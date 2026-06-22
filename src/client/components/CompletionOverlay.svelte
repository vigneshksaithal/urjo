<script lang="ts">
  import { fade } from "svelte/transition";
  import BadgeDollarSign from "lucide-svelte/icons/badge-dollar-sign";
  import Share2 from "lucide-svelte/icons/share-2";
  import Trophy from "lucide-svelte/icons/trophy";
  import { showShareSheet } from "@devvit/web/client";
  import type { StreakData } from "../../shared/types";
  import type { PersonalChallengeData } from "../../shared/social-types";

  type Props = {
    /** Whether the overlay is visible */
    isCompleted: boolean;

    /** Time taken to solve puzzle (seconds) */
    timeTaken: number;

    /** Number of mistakes made */
    mistakes?: number;

    /** User's coin balance (undefined for logged-out users) */
    coins?: number;

    /** User's streak data */
    streakData: StreakData;

    /** Login gate flags for conditional rendering */
    loginGate: {
      showWallet: boolean;
      showStreak: boolean;
      showSocialActions: boolean;
    };

    /** Called when Continue button is clicked */
    onContinue: () => void;

    /** Called when Challenge & Continue button is clicked (optional) */
    onChallengeAndContinue?: () => void;

    /** Called when Subscribe button is clicked (optional) */
    onSubscribe?: () => void;

    /** Whether user has already subscribed */
    hasSubscribed?: boolean;

    /** Post ID for sharing (required for Share Time button) */
    postId?: string;

    /** Grid size for share preview */
    gridSize?: number;

    /** Username for share message (optional, falls back to generic) */
    username?: string;

    /** Personal challenge beat info (if user beat a challenge) */
    personalChallengeBeat?: {
      challengerUsername: string;
      challengerTime: number;
    } | null;
  };

  let {
    isCompleted,
    timeTaken,
    mistakes = 0,
    coins,
    streakData,
    loginGate,
    onContinue,
    onChallengeAndContinue,
    onSubscribe,
    hasSubscribed = false,
    postId,
    gridSize = 4,
    username,
    personalChallengeBeat = null,
  }: Props = $props();

  /**
   * Handle "Share Time" button click.
   * Creates a personal challenge deeplink via showShareSheet.
   * Compliant with Devvit rules: explicit user action, no auto-posting.
   */
  async function handleShareTime(): Promise<void> {
    if (!postId) return;

    const challengeData: PersonalChallengeData = {
      type: "personal-challenge",
      postId,
      time: timeTaken,
      username: username ?? "Someone",
      gridSize,
      createdAt: new Date().toISOString(),
    };

    const shareText =
      username && username !== "Someone"
        ? `I solved this puzzle in ${timeTaken}s. Can you beat my time?`
        : `Beat my time of ${timeTaken}s on this puzzle!`;

    try {
      await showShareSheet({
        title: "Can you beat my time?",
        text: shareText,
        data: JSON.stringify(challengeData),
      });
    } catch {
      // User cancelled or share failed - silently ignore
    }
  }
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
      <Trophy class="size-20 text-yellow-400" aria-hidden="true" />
      {#if personalChallengeBeat}
        <div class="flex flex-col items-center gap-2">
          <p class="text-3xl font-bold text-yellow-400 text-center mb-1">
            Solved in {timeTaken}s!
          </p>
          <p class="text-sm font-semibold text-green-400 text-center">
            🎉 You beat {personalChallengeBeat.challengerUsername}'s {personalChallengeBeat.challengerTime}s!
          </p>
          {#if loginGate.showWallet && coins !== undefined}
            <p class="flex items-center gap-2 text-lg text-theme-text-muted">
              <BadgeDollarSign class="size-5 text-yellow-400 shrink-0" />
              <span class="text-yellow-400 font-semibold">{coins}</span>
              <span>coins earned</span>
            </p>
          {/if}
        </div>
      {:else}
        <div class="flex flex-col items-center gap-2">
          <p class="text-3xl font-bold text-yellow-400 text-center mb-1">
            Solved in {timeTaken}s!
          </p>
          {#if loginGate.showWallet && coins !== undefined}
            <p class="flex items-center gap-2 text-lg text-theme-text-muted">
              <BadgeDollarSign class="size-5 text-yellow-400 shrink-0" />
              <span class="text-yellow-400 font-semibold">{coins}</span>
              <span>coins earned</span>
            </p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Bottom spacer -->
    <div class="flex-1"></div>

    <!-- Action buttons -->
    <div class="flex flex-col gap-3 w-full mt-8">
      {#if onChallengeAndContinue && loginGate.showSocialActions}
        <button
          onclick={onChallengeAndContinue}
          class="w-full px-4 py-4 bg-yellow-500 text-yellow-950 font-bold rounded-2xl text-base hover:bg-yellow-400 active:scale-95 transition-all"
        >
          Challenge &amp; Continue
        </button>
      {/if}

      {#if postId}
        <button
          onclick={handleShareTime}
          class="w-full px-4 py-3.5 bg-urjo-blue text-white font-semibold rounded-2xl text-sm hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <Share2 class="size-4" />
          Comment Time
        </button>
      {/if}

      <button
        onclick={onContinue}
        class="w-full px-4 py-3.5 border border-urjo-blue/60 text-urjo-blue font-semibold rounded-2xl text-sm hover:bg-urjo-blue/10 active:scale-95 transition-all"
      >
        Continue
      </button>

      {#if onSubscribe && !hasSubscribed && loginGate.showSocialActions}
        <button
          onclick={onSubscribe}
          class="w-full px-4 py-3.5 border border-theme-border text-theme-text-secondary font-semibold rounded-2xl text-sm hover:bg-theme-hover active:scale-95 transition-all"
        >
          Join r/urjo
        </button>
      {/if}
    </div>
  </div>
{/if}
