<script lang="ts">
	import type { ShopItem } from "../../shared/types";
	import { focusTrap } from "../lib/focus-trap";
	import X from "lucide-svelte/icons/x";
	import Loader2 from "lucide-svelte/icons/loader-2";

	type Props = {
		isOpen: boolean;
		onClose: () => void;
	};

	let { isOpen, onClose }: Props = $props();

	let items = $state<ShopItem[]>([]);
	let coins = $state(0);
	let streakFreezes = $state(0);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let buyingTitle = $state<string | null>(null);
	let equippingTitle = $state<string | null>(null);
	let buyingFreeze = $state(false);
	let flairConfirmTitle = $state<ShopItem | null>(null);

	$effect(() => {
		if (isOpen) {
			fetchShop();
		}
	});

	async function fetchShop() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch("/api/shop");
			if (!response.ok) throw new Error("Failed to fetch shop");

			const data = await response.json();
			items = data.items;
			coins = data.coins;
			streakFreezes = data.streakFreezes ?? 0;
		} catch (err) {
			error = err instanceof Error ? err.message : "Failed to load shop";
		} finally {
			isLoading = false;
		}
	}

	async function buyTitle(titleId: string) {
		buyingTitle = titleId;
		error = null;

		try {
			const response = await fetch("/api/shop/buy", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ titleId }),
			});

			const data = await response.json();

			if (!response.ok) {
				error = data.error || "Failed to buy title";
				return;
			}

			coins = data.newBalance ?? coins;
			await fetchShop();
		} catch (err) {
			error = err instanceof Error ? err.message : "Failed to buy title";
		} finally {
			buyingTitle = null;
		}
	}

	function startEquip(item: ShopItem) {
		flairConfirmTitle = item;
	}

	async function equipTitle(titleId: string, updateFlair: boolean) {
		flairConfirmTitle = null;
		equippingTitle = titleId;
		error = null;

		try {
			const response = await fetch("/api/shop/equip", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ titleId, updateFlair }),
			});

			const data = await response.json();

			if (!response.ok) {
				error = data.error || "Failed to equip title";
				return;
			}

			await fetchShop();
		} catch (err) {
			error =
				err instanceof Error ? err.message : "Failed to equip title";
		} finally {
			equippingTitle = null;
		}
	}

	async function buyStreakFreeze() {
		buyingFreeze = true;
		error = null;

		try {
			const response = await fetch("/api/shop/buy-streak-freeze", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});

			const data = await response.json();

			if (!response.ok) {
				error = data.error || "Failed to buy streak freeze";
				return;
			}

			coins = data.newBalance ?? coins;
			streakFreezes = data.streakFreezes ?? streakFreezes;
		} catch (err) {
			error =
				err instanceof Error
					? err.message
					: "Failed to buy streak freeze";
		} finally {
			buyingFreeze = false;
		}
	}

	function getConditionText(condition: ShopItem["condition"]): string {
		if (!condition) return "";
		switch (condition.type) {
			case "minSolves":
				return `Requires ${condition.value} puzzles solved`;
			case "minSpeedSolves":
				return `Requires ${condition.value} speed solves`;
			case "minSkillLevel":
				return `Requires skill level ${condition.value}`;
			case "minLongestStreak":
				return `Requires ${condition.value}-day streak`;
			default:
				return "";
		}
	}
</script>

{#if isOpen}
	<!-- Modal backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 bg-theme-overlay backdrop-blur-sm z-40 flex items-center justify-center p-4"
		onclick={onClose}
	>
		<!-- Modal content -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="bg-theme-bg-modal rounded-xl border border-theme-border w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			use:focusTrap={{ onClose }}
		>
			<!-- Header -->
			<div
				class="flex items-center justify-between p-4 border-b border-theme-border"
			>
				<div class="flex items-center gap-2">
					<h2 class="text-lg font-bold text-theme-text-primary">
						🏪 Title Shop
					</h2>
				</div>
				<button
					onclick={onClose}
					class="text-theme-text-muted hover:text-theme-text-primary transition-colors p-1"
					aria-label="Close"
				>
					<X class="w-5 h-5" />
				</button>
			</div>

			<!-- Coin balance -->
			<div
				class="flex items-center justify-center gap-2 py-3 bg-theme-bg-secondary border-b border-theme-border"
			>
				<span class="text-xl">🪙</span>
				<span class="text-lg font-bold text-yellow-400">{coins}</span>
				<span class="text-sm text-theme-text-muted">coins</span>
			</div>

			<!-- Streak Freeze Section -->
			<div
				class="flex items-center justify-between p-4 mx-4 mt-4 rounded-lg bg-blue-900/20 border border-blue-500/30"
			>
				<div class="flex items-center gap-3">
					<span class="text-3xl">🧊</span>
					<div>
						<p
							class="font-semibold text-theme-text-primary text-sm"
						>
							Streak Freeze
						</p>
						<p class="text-xs text-theme-text-muted">
							Protect your streak for one missed day.
						</p>
						<p class="text-xs text-blue-400 mt-1">
							You have: {streakFreezes}/3 freezes
						</p>
					</div>
				</div>
				<button
					onclick={buyStreakFreeze}
					disabled={buyingFreeze || coins < 50 || streakFreezes >= 3}
					class="px-3 py-2 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
				>
					{#if buyingFreeze}
						<Loader2 class="w-3 h-3 animate-spin" />
						Buying...
					{:else if streakFreezes >= 3}
						Max reached
					{:else}
						Buy 50 🪙
					{/if}
				</button>
			</div>

			<!-- Error message -->
			{#if error}
				<div
					class="px-4 py-2 bg-red-500/20 text-red-400 text-sm text-center"
				>
					{error}
				</div>
			{/if}

			<!-- Content -->
			<div class="flex-1 overflow-y-auto p-4">
				{#if isLoading}
					<div class="flex items-center justify-center py-8">
						<Loader2
							class="w-8 h-8 text-theme-text-muted animate-spin"
						/>
					</div>
				{:else if items.length === 0}
					<div class="text-center py-8 text-theme-text-muted">
						<p>
							Titles unlock as you solve puzzles and build
							streaks. Keep playing!
						</p>
					</div>
				{:else}
					<div class="space-y-3">
						{#each items as item}
							<div
								class="flex items-center justify-between p-3 rounded-lg bg-theme-bg-secondary border border-theme-border"
							>
								<div class="flex items-center gap-3">
									<span class="text-2xl">{item.emoji}</span>
									<div>
										<p
											class="font-semibold text-theme-text-primary text-sm"
										>
											{item.label}
										</p>
										{#if item.condition && !item.unlocked}
											<p class="text-xs text-red-400">
												🔒 {getConditionText(
													item.condition,
												)}
											</p>
										{:else if !item.owned && item.cost > 0}
											<p class="text-xs text-yellow-400">
												🪙 {item.cost}
											</p>
										{:else if !item.owned}
											<p class="text-xs text-gray-400">
												Free
											</p>
										{/if}
									</div>
								</div>

								{#if item.equipped}
									<span
										class="text-xs text-green-400 font-semibold px-3 py-1"
										>✓ Equipped</span
									>
								{:else if item.owned}
									<button
										onclick={() => startEquip(item)}
										disabled={equippingTitle === item.id}
										class="px-3 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-500 disabled:opacity-40 transition-colors"
									>
										{equippingTitle === item.id
											? "..."
											: "Equip"}
									</button>
								{:else if item.unlocked}
									<button
										onclick={() => buyTitle(item.id)}
										disabled={buyingTitle === item.id ||
											coins < item.cost}
										class="px-3 py-1 rounded bg-yellow-600 text-white text-xs hover:bg-yellow-500 disabled:opacity-40 transition-colors"
									>
										{buyingTitle === item.id
											? "..."
											: "Buy"}
									</button>
								{:else}
									<span
										class="text-xs text-gray-500 px-3 py-1"
										>🔒 Locked</span
									>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Flair confirmation dialog -->
{#if flairConfirmTitle}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
	>
		<div
			class="bg-theme-bg-primary border border-theme-border rounded-xl p-5 max-w-xs w-full flex flex-col gap-4 shadow-2xl"
		>
			<h2 class="text-base font-bold text-theme-text-primary">
				Equip {flairConfirmTitle.emoji}
				{flairConfirmTitle.label}?
			</h2>
			<p class="text-sm text-theme-text-secondary">
				Also update your subreddit flair to "{flairConfirmTitle.emoji}
				{flairConfirmTitle.label}"?
			</p>
			<div class="flex flex-col gap-2">
				<button
					onclick={() => equipTitle(flairConfirmTitle!.id, true)}
					class="w-full px-4 py-2 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg text-sm hover:opacity-90 transition-all"
				>
					Equip + Update Flair
				</button>
				<button
					onclick={() => equipTitle(flairConfirmTitle!.id, false)}
					class="w-full px-4 py-2 border border-theme-border text-theme-text-secondary rounded-lg text-sm hover:bg-theme-hover transition-all"
				>
					Equip Only
				</button>
				<button
					onclick={() => (flairConfirmTitle = null)}
					class="w-full px-4 py-2 text-theme-text-muted text-sm hover:text-theme-text-secondary transition-all"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}
