<script lang="ts">
  import { fly, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";

  type Props = {
    /** Whether the dialog is currently open */
    isOpen: boolean;

    /** Dialog title (e.g., "Create Rival Challenge?") */
    title: string;

    /** Main message body */
    message: string;

    /** Confirm button label (default: "Confirm") */
    confirmLabel?: string;

    /** Cancel button label (default: "Cancel") */
    cancelLabel?: string;

    /** Visual variant for confirm button */
    confirmVariant?: "primary" | "warning" | "success";

    /** Called when user clicks confirm */
    onConfirm: () => void;

    /** Called when user clicks cancel or backdrop */
    onCancel: () => void;

    /** Optional snippet for custom message content */
    children?: import("svelte").Snippet;
  };

  let {
    isOpen,
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    confirmVariant = "primary",
    onConfirm,
    onCancel,
  }: Props = $props();

  // Determine button styles based on variant
  const confirmButtonClass = $derived(
    confirmVariant === "warning"
      ? "bg-yellow-500 text-black"
      : confirmVariant === "success"
        ? "bg-green-500 text-white"
        : "bg-theme-text-primary text-theme-bg-primary",
  );
</script>

/** * ConfirmDialog - Reusable confirmation modal * * Extracted from
GameView.svelte to reduce duplication. * Used for: Challenge confirmation,
Subscribe confirmation, etc. * * Design decisions: * - Backdrop click dismisses
(common mobile pattern) * - Escape key dismisses (accessibility) * - Focus trap
would be added by parent (if needed) * - Animations use Svelte transitions for
consistency */

{#if isOpen}
  <!-- Backdrop -->
  <div
    transition:fade={{ duration: 200 }}
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="dialog-title"
    onclick={onCancel}
    onkeydown={(e) => e.key === "Escape" && onCancel()}
  >
    <!-- Dialog card -->
    <div
      transition:fly={{ y: 20, duration: 250, easing: cubicOut }}
      class="bg-theme-bg-primary border border-theme-border rounded-xl p-5 max-w-xs w-full flex flex-col gap-4 shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <h2 id="dialog-title" class="text-base font-bold text-theme-text-primary">
        {title}
      </h2>

      <p class="text-sm text-theme-text-secondary">
        {message}
      </p>

      <div class="flex gap-3">
        <button
          onclick={onCancel}
          class="flex-1 px-4 py-2 border border-theme-border text-theme-text-secondary rounded-lg text-sm hover:bg-theme-hover transition-all"
        >
          {cancelLabel}
        </button>

        <button
          onclick={onConfirm}
          class="flex-1 px-4 py-2 {confirmButtonClass} font-bold rounded-lg text-sm hover:opacity-90 transition-all"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
