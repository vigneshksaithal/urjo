<script lang="ts">
	import { fade } from "svelte/transition";
	import { focusTrap } from "../lib/focus-trap";
	import Loader2 from "lucide-svelte/icons/loader-2";
	import X from "lucide-svelte/icons/x";

	type Props = {
		isOpen: boolean;
		commentingVictory: boolean;
		puzzleNumber?: number;
		gridSize: number;
		skillLevel: number;
		timeTaken?: number;
		mistakes?: number;
		streak: number;
		onClose: () => void;
		onSubmit: (commentMessage: string) => void;
	};

	let {
		isOpen,
		commentingVictory,
		puzzleNumber = 0,
		gridSize,
		skillLevel,
		timeTaken = 0,
		mistakes = 0,
		streak,
		onClose,
		onSubmit,
	}: Props = $props();

	let commentMessage = $state("");

	const charCount = $derived(commentMessage.length);
	const mistakeLabel = $derived(
		mistakes === 1 ? "1 mistake" : `${mistakes} mistakes`,
	);
	const autoSummary = $derived(
		`Urjo #${puzzleNumber} · ${gridSize}×${gridSize} · ⭐${skillLevel} · ${timeTaken}s · ${mistakeLabel} · ${streak} streak`,
	);

	function handleSubmit(): void {
		onSubmit(commentMessage.trim());
	}

	// Clear the draft every time the composer opens so text left over from a
	// previous open/close (or a previously posted comment) doesn't linger.
	$effect(() => {
		if (isOpen) {
			commentMessage = "";
		}
	});
</script>

{#if isOpen}
	<div
		transition:fade={{ duration: 180 }}
		class="fixed inset-0 z-[60] bg-[linear-gradient(180deg,#395c8a_0%,#31507a_52%,#274266_100%)] text-white"
	>
		<div
			class="relative flex h-full w-full flex-col overflow-hidden"
			role="dialog"
			aria-modal="true"
			aria-labelledby="victory-comment-title"
			tabindex="-1"
			use:focusTrap={{ onClose }}
		>
			<div class="flex-none px-5 pt-6 pb-4 text-center">
				<p
					id="victory-comment-title"
					class="text-[2.2rem] font-black leading-none tracking-[0.08em] drop-shadow-[0_2px_0_rgba(0,0,0,0.2)]"
				>
					COMMENT
				</p>
				<p class="mt-2 text-sm font-semibold text-white/65">
					Posts publicly.
				</p>
			</div>

			<div class="h-px w-full bg-white/10"></div>

			<main class="flex-1 min-h-0 px-4 pb-4 pt-3 flex flex-col gap-3">
				<section
					class="relative flex-1 min-h-[10rem] rounded-[1.5rem] border border-white/15 bg-white/7 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
				>
					<textarea
						bind:value={commentMessage}
						maxlength="400"
						placeholder="Write a comment!"
						disabled={commentingVictory}
						class="h-full w-full resize-none bg-transparent pr-14 text-[1.15rem] font-mono font-semibold leading-8 text-white outline-none placeholder:text-white/35 disabled:opacity-70"
					></textarea>
					<p
						class="pointer-events-none absolute bottom-4 right-4 text-2xl font-black tracking-[0.08em] text-white/55"
					>
						{charCount}/400
					</p>
				</section>

				<section
					class="rounded-[1.5rem] border border-white/15 bg-white/7 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
				>
					<p
						class="mb-3 text-center text-xs font-black uppercase tracking-[0.2em] text-white/70"
					>
						Added automatically:
					</p>
					<p
						class="text-center text-base font-semibold text-white/90"
					>
						{autoSummary}
					</p>
				</section>
			</main>

			<footer class="flex-none px-4 pb-4">
				<button
					onclick={handleSubmit}
					disabled={commentingVictory}
					class="flex min-h-[4.25rem] w-full items-center justify-center rounded-[1.25rem] bg-theme-text-primary px-4 text-2xl font-black tracking-[0.14em] text-theme-bg-primary shadow-[0_6px_0_rgba(0,0,0,0.25)] transition-all active:translate-y-1 active:shadow-none disabled:opacity-70 disabled:active:translate-y-0 disabled:active:shadow-[0_6px_0_rgba(0,0,0,0.25)]"
				>
					{#if commentingVictory}
						<Loader2 class="mr-3 h-6 w-6 animate-spin" />
						<span>Posting...</span>
					{:else}
						<span>SUBMIT</span>
					{/if}
				</button>
			</footer>

			<button
				onclick={onClose}
				disabled={commentingVictory}
				class="absolute right-3 top-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white shadow-[0_0_0_6px_rgba(255,255,255,0.03),0_0_24px_rgba(0,0,0,0.25)] transition-transform hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100 disabled:active:scale-100"
				aria-label="Close comment composer"
			>
				<X class="h-8 w-8" />
			</button>
		</div>
	</div>
{/if}
