<script lang="ts">
	import { Confetti } from 'svelte-confetti'
</script>

<div class="fixed inset-0 pointer-events-none z-50">
	<Confetti
		x={[-0.5, 0.5]}
		y={[0.25, 1]}
		duration={3000}
		infinite={false}
		colorArray={['#E54E3E', '#3997D7', '#fbbf24', '#10b981']}
	/>
</div>
