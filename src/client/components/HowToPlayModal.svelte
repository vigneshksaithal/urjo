<script lang="ts">
	import { fly, fade } from "svelte/transition";
	import { cubicOut } from "svelte/easing";

	type Props = {
		isOpen: boolean;
		onClose: () => void;
		gridSize?: number;
		onOpenTutorial?: () => void;
	};

	let { isOpen, onClose, onOpenTutorial }: Props = $props();

	function handleOpenTutorial(): void {
		onClose();
		onOpenTutorial?.();
	}
</script>

{#if isOpen}
	<!-- Backdrop -->
	<div
		transition:fade={{ duration: 250 }}
		class="fixed inset-0 z-50 bg-black/60"
		role="button"
		tabindex="-1"
		aria-label="Close"
		onclick={onClose}
		onkeydown={(e) => e.key === "Escape" && onClose()}
	></div>

	<!-- Bottom sheet -->
	<div
		transition:fly={{ y: 400, duration: 380, easing: cubicOut }}
		class="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-theme-bg-primary border-t border-theme-border rounded-t-2xl shadow-2xl"
	>
		<!-- Drag handle -->
		<div class="flex justify-center pt-3 pb-1 shrink-0">
			<div class="w-10 h-1 rounded-full bg-theme-border"></div>
		</div>

		<div class="px-5 py-4 pb-8 flex flex-col gap-4">
			<div class="flex items-center justify-between">
				<h2 class="text-base font-bold text-theme-text-primary">
					How to Play
				</h2>
				<button
					onclick={onClose}
					class="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-theme-hover transition-colors text-theme-text-muted"
					aria-label="Close">✕</button
				>
			</div>

			<!-- Quick rules — visual pill cards -->
			<div class="flex flex-col gap-2">
				<div
					class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-theme-bg-secondary border border-theme-border"
				>
					<span class="text-xl shrink-0">🔴🔵</span>
					<span class="text-sm text-theme-text-secondary"
						>Each row and column needs <strong
							class="text-theme-text-primary"
							>equal red and blue</strong
						></span
					>
				</div>
				<div
					class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-theme-bg-secondary border border-theme-border"
				>
					<span class="text-xl shrink-0">👆</span>
					<span class="text-sm text-theme-text-secondary"
						>Tap to cycle: empty → red → blue → empty</span
					>
				</div>
				<div
					class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-theme-bg-secondary border border-theme-border"
				>
					<span class="text-xl shrink-0">🔢</span>
					<span class="text-sm text-theme-text-secondary"
						>Numbers show how many same-color neighbors (diagonals
						count)</span
					>
				</div>
			</div>

			<button
				onclick={handleOpenTutorial}
				class="w-full px-4 py-3.5 bg-theme-text-primary text-theme-bg-primary font-bold rounded-xl text-sm hover:opacity-90 active:scale-95 transition-all"
			>
				Open Interactive Tutorial
			</button>

			<button
				onclick={onClose}
				class="w-full px-4 py-2.5 border border-theme-border text-theme-text-secondary font-semibold rounded-xl text-sm hover:bg-theme-hover active:scale-95 transition-all"
			>
				Got it, let me play
			</button>
		</div>
	</div>
{/if}
