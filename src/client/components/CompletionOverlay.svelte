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
    onChallenge?: (customTitle?: string) => void;

    /** Whether a challenge post has already been created this session */
    hasChallenged?: boolean;

    /** Editable title seeded into the challenge post field */
    defaultChallengeTitle?: string;

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
    hasCommentedVictory = false,
    commentingVictory = false,
    onChallenge,
    hasChallenged = false,
    defaultChallengeTitle = "",
    personalChallengeBeat = null,
    puzzleColors = "",
    gridSize = 4,
    puzzleNumber = 0,
  }: Props = $props();

  let copied = $state(false);
  let challengeTitle = $state("");
  let challengeTitleSeed = $state("");
  const challengeTitleKey = $derived(`${isCompleted}:${defaultChallengeTitle}`);

  $effect(() => {
    if (!isCompleted) {
      challengeTitle = "";
      challengeTitleSeed = "";
      return;
    }

    if (challengeTitleSeed !== challengeTitleKey) {
      challengeTitle = "";
      challengeTitleSeed = challengeTitleKey;
    }
  });

  function buildShareText(): string {
    if (!puzzleColors || gridSize < 1) return "";
    const rows: string[] = [];
    for (let r = 0; r < gridSize; r++) {
      let row = "";
      for (let c = 0; c < gridSize; c++) {
        const char = puzzleColors[r * gridSize + c];
        row += char === "r" ? "🟥" : "🟦";
      }
      rows.push(row);
    }
    const header =
      puzzleNumber > 0
        ? `Urjo #${puzzleNumber} — ${timeTaken}s 🏆`
        : `Urjo — ${timeTaken}s 🏆`;
    return [header, ...rows].join("\n");
  }

  async function handleShare(): Promise<void> {
    const text = buildShareText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      // clipboard unavailable in some webview environments — fail silently
    }
  }

  function handleChallengeTitleInput(event: Event): void {
    challengeTitle = (event.currentTarget as HTMLInputElement).value;
  }

  function handleChallenge(): void {
    const trimmedTitle = challengeTitle.trim();
    onChallenge?.(
      trimmedTitle.length > 0
        ? trimmedTitle
        : defaultChallengeTitle || undefined,
    );
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
      <!-- Emoji share card — visible when clipboard is likely available -->
      {#if puzzleColors && gridSize > 0}
        <button
          onclick={handleShare}
          class="w-full px-4 py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-95
            {copied
            ? 'bg-green-500/20 border border-green-500/40 text-green-400'
            : 'border border-theme-border text-theme-text-secondary hover:bg-theme-hover'}"
        >
          {copied ? "✓ Copied to clipboard" : "Share Result"}
        </button>
      {/if}

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

      {#if onChallenge && loginGate.showSocialActions && !hasChallenged}
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-theme-text-muted">
            Challenge title
          </span>
          <input
            type="text"
            value={challengeTitle}
            oninput={handleChallengeTitleInput}
            maxlength="120"
            placeholder="Write your challenge title"
            class="w-full rounded-xl border border-theme-border bg-theme-bg-secondary px-3 py-3 text-sm font-semibold text-theme-text-primary outline-none transition-colors placeholder:text-theme-text-muted focus:border-yellow-400"
          />
        </label>
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
            onclick={handleChallenge}
            disabled={hasChallenged}
            class="w-full px-4 py-3.5 bg-yellow-500 text-yellow-950 font-bold rounded-2xl text-sm hover:bg-yellow-400 active:scale-95 transition-all disabled:opacity-60 disabled:active:scale-100"
          >
            {#if hasChallenged}
              ✓ Challenge Created
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
{/if}
