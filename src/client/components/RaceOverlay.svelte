<script lang="ts">
    import type { RaceStatus } from "../../shared/race-types";

    type RaceState = "waiting" | "racing" | "finished";

    type Props = {
        sessionId: string;
        postId: string;
        state: RaceState;
        onCancel: () => void;
        onRaceAgain: () => void;
        onChallenge: () => void;
        onSolo: () => void;
    };

    let {
        sessionId,
        // @ts-ignore
        postId,
        state: raceState,
        onCancel,
        onRaceAgain,
        onChallenge,
        onSolo,
    }: Props = $props();

    // Racing state
    let opponentProgress = $state(0);
    let opponentUsername = $state("");
    let opponentTime = $state<number | null>(null);
    let myTime = $state<number | null>(null);
    let won = $state(false);

    // Waiting state
    let countdown = $state(30);
    let queueExpired = $state(false);

    // Polling
    let pollInterval = $state<ReturnType<typeof setInterval> | null>(null);
    let countdownInterval = $state<ReturnType<typeof setInterval> | null>(null);

    const formatTime = (ms: number): string => {
        const seconds = Math.floor(ms / 1000);
        const tenths = Math.floor((ms % 1000) / 100);
        return `${seconds}.${tenths}s`;
    };

    const pollRaceStatus = async (): Promise<void> => {
        try {
            const res = await fetch(`/api/race/status/${sessionId}`);
            if (!res.ok) return;
            const data: RaceStatus = await res.json();

            opponentProgress = data.opponentProgress ?? 0;

            if (data.status === "finished" && data.opponentTime !== undefined) {
                opponentTime = data.opponentTime ?? null;
            }

            if (data.status === "expired" || data.status === "opponent_left") {
                stopPolling();
            }
        } catch {
            // Silently ignore polling errors — non-blocking
        }
    };

    const startPolling = (): void => {
        if (pollInterval) return;
        pollInterval = setInterval(pollRaceStatus, 2000);
    };

    const stopPolling = (): void => {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    };

    const startCountdown = (): void => {
        if (countdownInterval) return;
        countdown = 30;
        queueExpired = false;
        countdownInterval = setInterval(() => {
            countdown -= 1;
            if (countdown <= 0) {
                queueExpired = true;
                stopCountdown();
            }
        }, 1000);
    };

    const stopCountdown = (): void => {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    };

    // Manage intervals based on state changes
    $effect(() => {
        if (raceState === "waiting") {
            startCountdown();
            stopPolling();
        } else if (raceState === "racing") {
            stopCountdown();
            startPolling();
        } else {
            stopCountdown();
            stopPolling();
        }

        return () => {
            stopPolling();
            stopCountdown();
        };
    });

    // Update result data when entering finished state
    $effect(() => {
        if (raceState === "finished") {
            stopPolling();
        }
    });

    // Expose a method for parent to set result data
    export const setResult = (result: {
        won: boolean;
        yourTime: number;
        opponentTime?: number | null;
        opponentUsername?: string;
    }): void => {
        won = result.won;
        myTime = result.yourTime;
        opponentTime = result.opponentTime ?? null;
        if (result.opponentUsername) opponentUsername = result.opponentUsername;
    };

    // Expose method for parent to set opponent username
    export const setOpponentUsername = (username: string): void => {
        opponentUsername = username;
    };
</script>

<!-- Race overlay — does NOT block puzzle interaction (pointer-events-none on backdrop) -->
{#if raceState === "waiting"}
    <div class="absolute top-0 left-0 right-0 z-40 flex justify-center p-3">
        <div
            class="bg-theme-bg-modal border border-theme-border rounded-xl px-4 py-3 shadow-lg max-w-xs w-full"
        >
            {#if queueExpired}
                <div class="flex flex-col items-center gap-2 text-center">
                    <p class="text-sm text-theme-text-primary font-medium">
                        No opponents found — play solo?
                    </p>
                    <div class="flex gap-2 w-full">
                        <button
                            class="flex-1 px-3 py-2 text-xs font-medium rounded-lg border border-theme-border text-theme-text-secondary hover:bg-theme-hover transition-colors"
                            onclick={onCancel}
                        >
                            Re-queue
                        </button>
                        <button
                            class="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-urjo-coral text-white hover:opacity-90 transition-opacity"
                            onclick={onSolo}
                        >
                            Play Solo
                        </button>
                    </div>
                </div>
            {:else}
                <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2">
                        <span
                            class="inline-block w-2 h-2 rounded-full bg-urjo-coral animate-pulse"
                        ></span>
                        <span
                            class="text-sm text-theme-text-primary font-medium"
                            >Searching for opponent...</span
                        >
                    </div>
                    <span class="text-xs text-theme-text-muted font-mono"
                        >{countdown}s</span
                    >
                </div>
                <div class="mt-2 flex justify-end">
                    <button
                        class="px-3 py-1 text-xs text-theme-text-muted hover:text-theme-text-primary transition-colors"
                        onclick={onCancel}
                    >
                        Cancel
                    </button>
                </div>
            {/if}
        </div>
    </div>
{:else if raceState === "racing"}
    <div
        class="absolute top-0 left-0 right-0 z-40 flex justify-center p-3 pointer-events-none"
    >
        <div
            class="bg-theme-bg-modal border border-theme-border rounded-xl px-4 py-3 shadow-lg max-w-xs w-full pointer-events-auto"
        >
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                    <span
                        class="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"
                    ></span>
                    <span class="text-xs font-medium text-theme-text-secondary"
                        >Racing</span
                    >
                </div>
                {#if opponentUsername}
                    <span class="text-xs text-theme-text-muted"
                        >vs {opponentUsername}</span
                    >
                {/if}
            </div>
            <div
                class="w-full bg-theme-bg-secondary rounded-full h-2 overflow-hidden"
            >
                <div
                    class="h-full bg-urjo-blue rounded-full transition-all duration-500 ease-out"
                    style="width: {opponentProgress}%"
                ></div>
            </div>
            <div class="flex justify-between mt-1">
                <span class="text-xs text-theme-text-muted">Opponent</span>
                <span class="text-xs text-theme-text-muted font-mono"
                    >{opponentProgress}%</span
                >
            </div>
        </div>
    </div>
{:else if raceState === "finished"}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
        <div
            class="bg-theme-bg-modal border border-theme-border rounded-2xl p-6 max-w-xs w-full flex flex-col items-center gap-4 shadow-2xl text-center"
        >
            {#if won}
                <div class="text-5xl">🏆</div>
                <p class="text-xl font-bold text-theme-text-primary">
                    You won!
                </p>
            {:else}
                <div class="text-5xl">💪</div>
                <p class="text-xl font-bold text-theme-text-primary">
                    Close one!
                </p>
            {/if}

            <div
                class="w-full flex flex-col gap-1 bg-theme-bg-secondary rounded-lg p-3"
            >
                {#if myTime !== null}
                    <div class="flex justify-between text-sm">
                        <span class="text-theme-text-secondary">Your time</span>
                        <span
                            class="font-mono font-medium text-theme-text-primary"
                            >{formatTime(myTime)}</span
                        >
                    </div>
                {/if}
                {#if opponentTime !== null}
                    <div class="flex justify-between text-sm">
                        <span class="text-theme-text-secondary"
                            >{opponentUsername || "Opponent"}</span
                        >
                        <span
                            class="font-mono font-medium text-theme-text-muted"
                            >{formatTime(opponentTime)}</span
                        >
                    </div>
                {/if}
            </div>

            {#if won}
                <button
                    class="w-full py-3 rounded-xl bg-urjo-coral text-white font-bold text-sm hover:opacity-90 transition-opacity"
                    onclick={onRaceAgain}
                >
                    Race Again
                </button>
            {:else}
                <button
                    class="w-full py-3 rounded-xl bg-urjo-blue text-white font-bold text-sm hover:opacity-90 transition-opacity"
                    onclick={onChallenge}
                >
                    Challenge Friends
                </button>
            {/if}
        </div>
    </div>
{/if}
