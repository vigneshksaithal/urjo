<script lang="ts">
    /**
     * CountUp — animated number that ticks from `from` to `to` with an easeOut
     * curve. Used on the result screen so coin rewards feel earned (Subway
     * Surfers' coin-bar fill is the canonical reference).
     *
     * The tick fires the optional `onTick` callback at intervals (~every 6th
     * frame) so the parent can play a coin chime while the number is climbing.
     * `onComplete` fires once when the animation lands.
     */
    import { onMount, onDestroy } from "svelte";

    type Props = {
        from?: number;
        to: number;
        durationMs?: number;
        prefix?: string;
        suffix?: string;
        className?: string;
        /** Called on each visual update — useful for coin tick sounds */
        onTick?: (value: number) => void;
        /** Called once when the count-up settles on the final value */
        onComplete?: () => void;
    };

    let {
        from = 0,
        to,
        durationMs = 900,
        prefix = "",
        suffix = "",
        className = "",
        onTick,
        onComplete,
    }: Props = $props();

    // Initial display value seeds from the `from` prop. We only care about
    // the value at mount; subsequent prop changes are handled by the $effect
    // below which compares against the current display.
    // svelte-ignore state_referenced_locally
    let display = $state(from);
    let rafId: number | null = null;
    let tickCounter = 0;

    function easeOutCubic(t: number): number {
        return 1 - Math.pow(1 - t, 3);
    }

    function animate(start: number, end: number, duration: number) {
        const startTime = performance.now();
        const delta = end - start;

        const step = (now: number) => {
            const elapsed = now - startTime;
            const t = Math.min(1, elapsed / duration);
            const eased = easeOutCubic(t);
            const next = Math.round(start + delta * eased);

            if (next !== display) {
                display = next;
                tickCounter++;
                // Throttle tick callbacks — about 1 per 80ms so the chime spam
                // doesn't sound like a chainsaw on long counts
                if (onTick && tickCounter % 5 === 0) {
                    onTick(next);
                }
            }

            if (t < 1) {
                rafId = requestAnimationFrame(step);
            } else {
                display = end;
                onComplete?.();
            }
        };

        rafId = requestAnimationFrame(step);
    }

    onMount(() => {
        animate(from, to, durationMs);
    });

    onDestroy(() => {
        if (rafId !== null) cancelAnimationFrame(rafId);
    });

    // If the `to` prop changes mid-run, restart from current display value
    $effect(() => {
        const target = to;
        if (display !== target && rafId === null) {
            animate(display, target, durationMs);
        }
    });
</script>

<span class={className}>{prefix}{display}{suffix}</span>
