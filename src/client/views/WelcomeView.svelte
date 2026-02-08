<script lang="ts">
	type Props = {
		onPlay: () => void
	}

	let { onPlay }: Props = $props()
</script>

<div class="h-full w-full flex flex-col items-center justify-center p-8">
	<!-- Urjo Logo -->
	<div class="mb-6">
		<svg
			width="80"
			height="80"
			viewBox="0 0 80 80"
			xmlns="http://www.w3.org/2000/svg"
			class="drop-shadow-lg"
		>
			<circle cx="20" cy="20" r="15" fill="#E17560" />
			<circle cx="60" cy="20" r="15" fill="#5B9BD5" />
			<circle cx="20" cy="60" r="15" fill="#5B9BD5" />
			<defs>
				<clipPath id="bottomLeftHalf">
					<polygon points="45,45 45,75 75,75" />
				</clipPath>
				<clipPath id="topRightHalf">
					<polygon points="45,45 75,45 75,75" />
				</clipPath>
			</defs>
			<circle cx="60" cy="60" r="15" fill="#8B4A3E" clip-path="url(#bottomLeftHalf)" />
			<circle cx="60" cy="60" r="15" fill="#3D5A6F" clip-path="url(#topRightHalf)" />
		</svg>
	</div>

	<h1 class="text-5xl font-bold text-white mb-4">Urjo</h1>

	<p class="text-gray-300 text-center mb-8 max-w-md text-sm">
		Fill each row and column with 2 red and 2 blue spots. Use numbered clues to guide your way.
	</p>

	<button
		onclick={onPlay}
		class="
			px-12 py-4 text-2xl font-bold
			bg-blue-500 text-white rounded-lg
			hover:bg-blue-600 active:scale-95
			transition-all shadow-lg
		"
	>
		Play
	</button>
</div>
