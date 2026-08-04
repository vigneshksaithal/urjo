<script lang="ts">
  import { fly, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import CircleHelp from "lucide-svelte/icons/circle-help";
  import Medal from "lucide-svelte/icons/medal";
  import Settings from "lucide-svelte/icons/settings";
  import Trophy from "lucide-svelte/icons/trophy";
  import GridSizeSelector from "./GridSizeSelector.svelte";
  import ChallengeManager from "./ChallengeManager.svelte";

  type Props = {
    /** Whether the sheet is visible */
    isOpen: boolean;
    
    /** Called when sheet closes */
    onClose: () => void;
    
    /** Whether user is a moderator (shows additional options) */
    isMod?: boolean;
    
    /** Called when "How to Play" is tapped */
    onTutorial?: () => void;

    showProgression?: boolean;
    onLeaderboard?: () => void;
    onAchievements?: () => void;
    gridSize?: number;
    allowsGridSizeChange?: boolean;
    onGridSizeChange?: (size: number) => void;
    
    /** Called when "Analytics Dashboard" is tapped (mod only) */
    onOpenAnalytics?: () => void;
    
    /** Called when "Component Preview" is tapped (mod only) */
    onShowModPreview?: () => void;
  };

  let {
    isOpen,
    onClose,
    isMod = false,
    onTutorial,
    showProgression = false,
    onLeaderboard,
    onAchievements,
    gridSize = 4,
    allowsGridSizeChange = false,
    onGridSizeChange,
    onOpenAnalytics,
    onShowModPreview,
  }: Props = $props();
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    transition:fade={{ duration: 250 }}
    class="fixed inset-0 z-50 bg-black/60"
    role="button"
    tabindex="-1"
    aria-label="Close settings"
    onclick={onClose}
    onkeydown={(e) => e.key === "Escape" && onClose()}
  ></div>
  
  <!-- Sheet -->
  <div
    transition:fly={{ y: 400, duration: 380, easing: cubicOut }}
    class="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-theme-bg-primary border-t border-theme-border rounded-t-2xl shadow-2xl"
    style="max-height: 75vh;"
  >
    <!-- Drag handle -->
    <div class="flex justify-center pt-3 pb-1 shrink-0">
      <div class="w-10 h-1 rounded-full bg-theme-border"></div>
    </div>
    
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-3 shrink-0">
      <h2 class="text-base font-bold text-theme-text-primary">
        Settings
      </h2>
      <button
        onclick={onClose}
        class="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-theme-hover transition-colors text-theme-text-muted"
        aria-label="Close settings"
      >
        ✕
      </button>
    </div>
    
    <!-- Options -->
    <div class="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto px-4 pb-5">
      {#if showProgression && onLeaderboard && onAchievements}
        <div class="grid grid-cols-2 gap-2">
          <button
            onclick={() => {
              onClose();
              onLeaderboard();
            }}
            class="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-theme-border px-3 text-sm font-semibold text-theme-text-secondary transition-all hover:bg-theme-hover active:scale-95"
          >
            <Trophy class="h-5 w-5 text-yellow-400" />
            Leaderboard
          </button>
          <button
            onclick={() => {
              onClose();
              onAchievements();
            }}
            class="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-theme-border px-3 text-sm font-semibold text-theme-text-secondary transition-all hover:bg-theme-hover active:scale-95"
          >
            <Medal class="h-5 w-5 text-sky-400" />
            Achievements
          </button>
        </div>
      {/if}

      {#if allowsGridSizeChange && onGridSizeChange}
        <div class="flex min-h-12 items-center justify-between rounded-xl border border-theme-border px-4 py-2">
          <span class="text-sm font-semibold text-theme-text-secondary">Grid size</span>
          <GridSizeSelector {gridSize} {onGridSizeChange} />
        </div>
      {/if}

      {#if showProgression}
        <ChallengeManager />
      {/if}

      <button
        onclick={() => {
          onClose();
          onTutorial?.();
        }}
        class="flex min-h-11 w-full items-center gap-3 rounded-xl border border-theme-border px-4 text-left text-sm font-semibold text-theme-text-secondary transition-all hover:bg-theme-hover active:scale-95"
      >
        <CircleHelp class="w-5 h-5 text-urjo-blue shrink-0" />
        <span>How to Play / Tutorial</span>
      </button>
      
      {#if isMod && onOpenAnalytics}
        <button
          onclick={() => {
            onClose();
            onOpenAnalytics();
          }}
          class="w-full px-4 py-3.5 border border-theme-border text-theme-text-secondary font-semibold rounded-xl text-sm hover:bg-theme-hover active:scale-95 transition-all text-left flex items-center gap-3"
        >
          <Settings class="w-5 h-5 text-blue-400 shrink-0" />
          <span>Analytics Dashboard</span>
        </button>
      {/if}
      
      {#if isMod && onShowModPreview}
        <button
          onclick={() => {
            onClose();
            onShowModPreview();
          }}
          class="w-full px-4 py-3.5 border border-theme-border text-theme-text-secondary font-semibold rounded-xl text-sm hover:bg-theme-hover active:scale-95 transition-all text-left flex items-center gap-3"
        >
          <Settings class="w-5 h-5 text-theme-text-muted shrink-0" />
          <span>Component Preview</span>
        </button>
      {/if}
    </div>
  </div>
{/if}
