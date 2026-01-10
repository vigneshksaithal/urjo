<script lang="ts">
	import { Confetti } from 'svelte-confetti'
</script>

<div class="fixed inset-0 pointer-events-none z-50">
	<Confetti
		x={[-0.5, 0.5]}
		y={[0.25, 1]}
		duration={3000}
		infinite={false}
		colorArray={['#ef4444', '#3b82f6', '#fbbf24', '#10b981']}
	/>
</div>
