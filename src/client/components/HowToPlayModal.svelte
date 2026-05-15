<script lang="ts">
	import { focusTrap } from "../lib/focus-trap";

	type Props = {
		isOpen: boolean;
		onClose: () => void;
		gridSize?: number;
		onOpenTutorial?: () => void;
	};

	let { isOpen, onClose, gridSize, onOpenTutorial }: Props = $props();

	const colorCount = $derived(Math.floor((gridSize ?? 4) / 2));

	function handleOpenTutorial(): void {
		onClose();
		onOpenTutorial?.();
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<!-- Backdrop -->
		<button
			type="button"
			class="absolute inset-0 bg-theme-overlay"
			onclick={onClose}
			aria-label="Close modal"
		></button>

		<!-- Modal -->
		<div
			class="relative bg-theme-bg-modal rounded-lg p-6 max-w-md shadow-xl border border-theme-border"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			use:focusTrap={{ onClose }}
		>
			<h2 class="text-2xl font-bold mb-4 text-theme-text-primary">
				How to Play
			</h2>

			<ul class="space-y-3 text-sm text-theme-text-secondary">
				<li class="flex items-start gap-2">
					<span class="text-lg">🎯</span>
					<span
						>Fill each row and column with exactly {colorCount} red and
						{colorCount} blue circles</span
					>
				</li>
				<li class="flex items-start gap-2">
					<span class="text-lg">🔢</span>
					<span
						>Numbers show how many surrounding spots (including
						diagonals) share the same color</span
					>
				</li>
				<li class="flex items-start gap-2">
					<span class="text-lg">🔄</span>
					<span>Adjacent rows and columns must be different</span>
				</li>
				<li class="flex items-start gap-2">
					<span class="text-lg">👆</span>
					<span>Tap to cycle colors: empty → red → blue → empty</span>
				</li>
				<li class="flex items-start gap-2">
					<span class="text-lg">⬆️</span>
					<span>Swipe up for blue, swipe down for red</span>
				</li>
			</ul>

			<button
				onclick={onClose}
				class="mt-6 w-full bg-theme-text-primary text-theme-bg-primary py-2 rounded-lg hover:opacity-90 active:scale-95 transition-all"
			>
				Got it!
			</button>

			{#if onOpenTutorial}
				<button
					onclick={handleOpenTutorial}
					class="mt-2 w-full border border-theme-border text-theme-text-secondary py-2 rounded-lg hover:bg-theme-hover active:scale-95 transition-all text-sm"
				>
					📖 Open Tutorial
				</button>
			{/if}
		</div>
	</div>
{/if}
