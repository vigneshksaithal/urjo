<script lang="ts">
	import type { LeaderboardData, ChallengeEntry } from "../../shared/types";
	import { focusTrap } from "../lib/focus-trap";
	import Trophy from "lucide-svelte/icons/trophy";
	import Flame from "lucide-svelte/icons/flame";
	import Zap from "lucide-svelte/icons/zap";
	import X from "lucide-svelte/icons/x";
	import Loader2 from "lucide-svelte/icons/loader-2";
	import Target from "lucide-svelte/icons/target";

	type Props = {
		isOpen: boolean;
		onClose: () => void;
		onNextChallenge: () => void;
	};

	let { isOpen, onClose, onNextChallenge }: Props = $props();

	let activeTab = $state<"streak" | "speed" | "coins" | "challenges">("streak");
	let leaderboardData = $state<LeaderboardData | null>(null);
	let challengesData = $state<ChallengeEntry[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	// Fetch leaderboard data when tab changes
	$effect(() => {
		if (isOpen) {
			fetchLeaderboard();
		}
	});

	async function fetchLeaderboard() {
		isLoading = true;
		error = null;

		try {
			if (activeTab === "challenges") {
				const response = await fetch("/api/game/challenges");
				if (!response.ok) throw new Error("Failed to fetch challenges");
				challengesData = await response.json();
				leaderboardData = null;
			} else {
				let url: string;
				if (activeTab === "coins") {
					url = "/api/leaderboard/coins";
				} else {
					url = `/api/game/leaderboard?type=${activeTab}`;
				}

				const response = await fetch(url);
				if (!response.ok) throw new Error("Failed to fetch leaderboard");

				const data: LeaderboardData = await response.json();
				leaderboardData = data;
				challengesData = [];
			}
		} catch (err) {
			error =
				err instanceof Error
					? err.message
					: "Failed to load leaderboard";
			leaderboardData = null;
			challengesData = [];
		} finally {
			isLoading = false;
		}
	}

	function handleTabChange(tab: "streak" | "speed" | "coins" | "challenges") {
		activeTab = tab;
		fetchLeaderboard();
	}

	function formatScore(
		score: number,
		type: "streak" | "speed" | "coins",
	): string {
		if (type === "streak") {
			return `${score} day${score === 1 ? "" : "s"}`;
		} else if (type === "speed") {
			return `${score}s`;
		} else {
			return `${score.toLocaleString()} 🪙`;
		}
	}

	function formatTimeAgo(timestamp: number): string {
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		if (seconds < 60) return "Just now";
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
		const days = Math.floor(hours / 24);
		return `${days} day${days === 1 ? "" : "s"} ago`;
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
					<Trophy class="w-5 h-5 text-yellow-400" />
					<h2 class="text-lg font-bold text-theme-text-primary">
						Leaderboard
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

			<!-- Tabs -->
			<div class="flex border-b border-theme-border">
				<button
					onclick={() => handleTabChange("streak")}
					class="flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium transition-colors
						{activeTab === 'streak'
						? 'text-theme-text-primary bg-theme-hover border-b-2 border-yellow-400'
						: 'text-theme-text-muted hover:text-theme-text-primary'}"
				>
					<Flame class="w-4 h-4" />
					<span>Streaks</span>
				</button>
				<button
					onclick={() => handleTabChange("speed")}
					class="flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium transition-colors
						{activeTab === 'speed'
						? 'text-theme-text-primary bg-theme-hover border-b-2 border-blue-400'
						: 'text-theme-text-muted hover:text-theme-text-primary'}"
				>
					<Zap class="w-4 h-4" />
					<span>Speed</span>
				</button>
				<button
					onclick={() => handleTabChange("coins")}
					class="flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium transition-colors
						{activeTab === 'coins'
						? 'text-theme-text-primary bg-theme-hover border-b-2 border-yellow-400'
						: 'text-theme-text-muted hover:text-theme-text-primary'}"
				>
					<span class="text-sm">🪙</span>
					<span>Coins</span>
				</button>
				<button
					onclick={() => handleTabChange("challenges")}
					class="flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium transition-colors
						{activeTab === 'challenges'
						? 'text-theme-text-primary bg-theme-hover border-b-2 border-red-400'
						: 'text-theme-text-muted hover:text-theme-text-primary'}"
				>
					<Target class="w-4 h-4" />
					<span>Challenges</span>
				</button>
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-y-auto">
				{#if isLoading}
					<div class="flex items-center justify-center py-8">
						<Loader2
							class="w-8 h-8 text-theme-text-muted animate-spin"
						/>
					</div>
				{:else if error}
					<div class="text-center py-8 text-red-400">
						<p>{error}</p>
						<button
							onclick={fetchLeaderboard}
							class="mt-4 px-4 py-2 border border-red-400 text-red-400 rounded-lg text-sm hover:bg-red-400/10 active:scale-95 transition-all"
						>
							Retry
						</button>
					</div>
				{:else if activeTab === "challenges"}
					{#if challengesData.length > 0}
						<div class="divide-y divide-theme-border">
							{#each challengesData as challenge}
								<div class="p-4 hover:bg-theme-hover transition-colors">
									<div class="flex items-start gap-3">
										<Target class="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
										<div class="flex-1 min-w-0">
											<p class="text-sm text-theme-text-primary">
												🎯 u/{challenge.username} challenged at Level {challenge.skillLevel} in {challenge.timeTaken}s
											</p>
											<a
												href={challenge.postUrl}
												target="_blank"
												rel="noopener noreferrer"
												class="inline-block mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
											>
												Beat this challenge →
											</a>
											<p class="text-xs text-theme-text-muted mt-1">
												Posted {formatTimeAgo(challenge.createdAt)}
											</p>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="text-center py-8 text-theme-text-muted">
							<p>
								No active challenges. Complete a puzzle and tap 'Compete'!
							</p>
						</div>
					{/if}
				{:else if leaderboardData && leaderboardData.entries.length > 0}
					<!-- Table layout -->
					<table class="w-full border-collapse">
						<thead>
							<tr
								class="border-b border-theme-border text-left text-xs text-theme-text-muted"
							>
								<th class="px-4 py-2 font-medium">Rank</th>
								<th class="px-4 py-2 font-medium">Player</th>
								<th class="px-4 py-2 font-medium text-right">
									{activeTab === "streak"
										? "Streak"
										: activeTab === "speed"
											? "Time"
											: "Coins"}
								</th>
							</tr>
						</thead>
						<tbody>
							{#each leaderboardData.entries as entry}
								<tr
									class="border-b border-theme-border transition-colors
										{leaderboardData.userRank === entry.rank
										? 'bg-green-500/20 text-green-400'
										: 'hover:bg-theme-hover'}"
								>
									<td
										class="px-4 py-3 text-sm text-theme-text-primary"
									>
										{entry.rank === 1
											? "🥇"
											: entry.rank === 2
												? "🥈"
												: entry.rank === 3
													? "🥉"
													: `${entry.rank}.`}
									</td>
									<td
										class="px-4 py-3 text-sm font-medium text-theme-text-primary"
									>
										{entry.username}
									</td>
									<td
										class="px-4 py-3 text-sm font-bold text-yellow-400 text-right"
									>
										{formatScore(entry.score, activeTab as "streak" | "speed" | "coins")}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<div class="text-center py-8 text-theme-text-muted">
						<p>
							Solve puzzles to earn your spot on the leaderboard.
						</p>
					</div>
				{/if}
			</div>

			<!-- Footer with Next Challenge button -->
			<div class="border-t border-theme-border p-4 flex gap-2">
				<button
					onclick={onNextChallenge}
					class="flex-1 px-6 py-2.5 bg-theme-text-primary text-theme-bg-primary font-bold rounded-lg
						hover:opacity-90 active:scale-95 transition-all"
				>
					Next Challenge
				</button>
			</div>
		</div>
	</div>
{/if}