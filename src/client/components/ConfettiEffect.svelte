<script lang="ts">
	import { onMount } from 'svelte'
	import { URJO_COLORS } from '../../shared/constants'

	onMount(async () => {
		// Dynamic import to avoid SSR issues
		const confettiModule = await import('canvas-confetti')
		const confetti = confettiModule.default

		// Fire confetti burst with Urjo theme colors (red and blue only)
		const count = 150
		const defaults = {
			origin: { y: 0.5 },
			colors: [URJO_COLORS.RED, URJO_COLORS.BLUE],
		}

		function fire(particleRatio: number, opts: confetti.Options) {
			confetti({
				...defaults,
				...opts,
				particleCount: Math.floor(count * particleRatio),
			})
		}

		// Three bursts with different spread angles for better effect
		fire(0.25, {
			spread: 26,
			startVelocity: 55,
		})

		fire(0.2, {
			spread: 60,
		})

		fire(0.35, {
			spread: 100,
			decay: 0.91,
			scalar: 0.8,
		})

		fire(0.1, {
			spread: 120,
			startVelocity: 25,
			decay: 0.92,
			scalar: 1.2,
		})

		fire(0.1, {
			spread: 120,
			startVelocity: 45,
		})
	})
</script>
