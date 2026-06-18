<script lang="ts">
  import { fade } from "svelte/transition";
  import Swords from "lucide-svelte/icons/swords";
  import type { PersonalChallengeData } from "../../shared/social-types";

  type Props = {
    /** Personal challenge data from deeplink */
    challenge: PersonalChallengeData;

    /** Called when user dismisses the banner */
    onDismiss: () => void;
  };

  let { challenge, onDismiss }: Props = $props();
</script>

<!--
  PersonalChallengeBanner - Shows challenge context at top of game
  
  Displays when a user opens a personal challenge link:
  - Challenger's username and target time
  - "Beat this time" call-to-action
  - Dismissible via X button
  
  Design decisions:
  - Prominent but non-blocking (dismissible)
  - Green accent to match "Share Time" button
  - Compact to not obscure the puzzle
-->

{#if challenge}
  <div
    transition:fade={{ duration: 200 }}
    class="flex-none flex justify-center px-3"
  >
    <div
      class="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/40 shadow-sm"
    >
      <Swords class="w-4 h-4 text-green-400 shrink-0" />
      <div class="flex flex-col">
        <span class="text-xs font-semibold text-green-300">
          {challenge.username} challenged you!
        </span>
        <span class="text-[10px] text-green-200/80">
          Beat their time: <strong>{challenge.time}s</strong>
        </span>
      </div>
      <button
        onclick={onDismiss}
        class="ml-2 text-green-400/60 hover:text-green-400 transition-colors"
        aria-label="Dismiss challenge banner"
      >
        ✕
      </button>
    </div>
  </div>
{/if}
