<script lang="ts">
	import { fade } from "svelte/transition";
	import { DEFAULT_CHALLENGE_TITLE } from "../../shared/constants";
	import { focusTrap } from "../lib/focus-trap";
	import X from "lucide-svelte/icons/x";

	type Props = {
		isOpen: boolean;
		puzzleNumber: number;
		timeTaken: number;
		gridSize: number;
		onClose: () => void;
		onSubmit: (customTitle?: string) => void;
	};

	let {
		isOpen,
		puzzleNumber,
		timeTaken,
		gridSize,
		onClose,
		onSubmit,
	}: Props = $props();

	let challengeTitle = $state("");

	const charCount = $derived(challengeTitle.length);

	function handleSubmit(): void {
		const trimmed = challengeTitle.trim();
		const nextTitle =
			trimmed.length > 0 ? trimmed : DEFAULT_CHALLENGE_TITLE;
		onSubmit(nextTitle);
	}

	// Reset the draft each time the composer opens so stale text never leaks
	// from a previous attempt.
	$effect(() => {
		if (isOpen) {
			challengeTitle = DEFAULT_CHALLENGE_TITLE;
		}
	});
</script>

{#if isOpen}
	<div
		transition:fade={{ duration: 180 }}
		class="fixed inset-0 z-[60] h-[100dvh] bg-[linear-gradient(180deg,#395c8a_0%,#31507a_52%,#274266_100%)] text-white"
	>
		<div
			class="relative flex h-full w-full flex-col overflow-hidden"
			role="dialog"
			aria-modal="true"
			aria-labelledby="challenge-title"
			tabindex="-1"
			use:focusTrap={{ onClose }}
		>
			<div class="flex-none px-16 pt-5 pb-3 text-center">
				<p
					id="challenge-title"
					class="text-2xl font-black leading-none tracking-[0.08em] drop-shadow-[0_2px_0_rgba(0,0,0,0.2)]"
				>
					CHALLENGE A PLAYER
				</p>
			</div>

			<div class="h-px w-full bg-white/10"></div>

			<main class="flex-1 min-h-0 overflow-y-auto px-4 pb-3 pt-3 flex flex-col justify-start gap-4">
				<div class="rounded-2xl border border-white/18 bg-black/15 p-4 text-center shadow-inner">
					<p class="text-xs font-black uppercase tracking-[0.18em] text-white/60">
						Puzzle #{puzzleNumber}
					</p>
					<p class="mt-1 text-2xl font-black">Solved in {timeTaken}s</p>
					<p class="mt-1 text-sm font-semibold text-white/75">
						{gridSize}×{gridSize} · Can they beat you?
					</p>
				</div>

				<label for="challenge-post-title" class="text-sm font-bold text-white/80">
					Post title
				</label>
				<input
					id="challenge-post-title"
					type="text"
					bind:value={challengeTitle}
					maxlength="120"
					class="w-full rounded-xl border border-white/20 bg-black/15 px-4 py-3 text-base font-semibold text-white outline-none transition-colors focus:border-white/60"
				/>
				<p class="text-right text-xs font-black tracking-[0.2em] text-white/55">
					{charCount}/120
				</p>
			</main>

			<footer class="flex-none px-4 pb-4">
				<p class="mb-2 text-center text-xs font-semibold text-white/65">
					Creates a Reddit challenge post from your account.
				</p>
				<button
					onclick={handleSubmit}
					class="flex min-h-[4.25rem] w-full items-center justify-center rounded-[1.25rem] bg-theme-text-primary px-4 text-2xl font-black tracking-[0.14em] text-theme-bg-primary shadow-[0_6px_0_rgba(0,0,0,0.25)] transition-all active:translate-y-1 active:shadow-none"
				>
					<span>POST CHALLENGE</span>
				</button>
			</footer>

			<button
				onclick={onClose}
				class="absolute right-3 top-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white shadow-[0_0_0_6px_rgba(255,255,255,0.03),0_0_24px_rgba(0,0,0,0.25)] transition-transform hover:scale-105 active:scale-95"
				aria-label="Close challenge composer"
			>
				<X class="h-8 w-8" />
			</button>
		</div>
	</div>
{/if}
