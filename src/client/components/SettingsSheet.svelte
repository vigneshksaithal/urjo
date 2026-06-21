<script lang="ts">
  import { fly, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import CircleHelp from "lucide-svelte/icons/circle-help";
  import Settings from "lucide-svelte/icons/settings";

  type Props = {
    /** Whether the sheet is visible */
    isOpen: boolean;
    
    /** Called when sheet closes */
    onClose: () => void;
    
    /** Whether user is a moderator (shows additional options) */
    isMod?: boolean;
    
    /** Called when "How to Play" is tapped */
    onTutorial?: () => void;
    
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
    style="max-height: 60vh;"
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
    <div class="flex flex-col gap-2 px-4 pb-8 overflow-y-auto">
      <button
        onclick={() => {
          onClose();
          onTutorial?.();
        }}
        class="w-full px-4 py-3.5 border border-theme-border text-theme-text-secondary font-semibold rounded-xl text-sm hover:bg-theme-hover active:scale-95 transition-all text-left flex items-center gap-3"
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
