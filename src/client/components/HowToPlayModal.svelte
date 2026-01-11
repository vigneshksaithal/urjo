<script lang="ts">
	type Props = {
		isOpen: boolean
		onClose: () => void
	}

	let { isOpen, onClose }: Props = $props()
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<!-- Backdrop -->
		<div class="absolute inset-0 bg-black/70" onclick={onClose}></div>

		<!-- Modal -->
		<div
			class="relative bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md shadow-xl"
		>
			<h2 class="text-2xl font-bold mb-4 text-gray-800 dark:text-white">
				How to Play
			</h2>

			<ul class="space-y-3 text-sm text-gray-700 dark:text-gray-300">
				<li class="flex items-start gap-2">
					<span class="text-lg">🎯</span>
					<span>Fill each row with exactly 2 red and 2 blue circles</span>
				</li>
				<li class="flex items-start gap-2">
					<span class="text-lg">📊</span>
					<span>Fill each column with exactly 2 red and 2 blue circles</span>
				</li>
				<li class="flex items-start gap-2">
					<span class="text-lg">🔄</span>
					<span>Adjacent rows must be different</span>
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
				class="mt-6 w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 active:scale-95 transition-all dark:bg-blue-500 dark:hover:bg-blue-600"
			>
				Got it!
			</button>
		</div>
	</div>
{/if}
