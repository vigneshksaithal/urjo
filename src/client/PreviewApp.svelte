<script lang="ts">
    import { context, requestExpandedMode } from "@devvit/web/client";
    import type { JsonObject } from "@devvit/web/shared";

    type PostData = JsonObject & {
        previewColors?: string;
        previewGridSize?: number;
        previewIsChallenge?: boolean;
        previewChallengerUsername?: string | null;
        previewChallengerTime?: number | null;
        previewAvatarUrl?: string | null;
    };

    const DEFAULT_AVATAR =
        "https://www.redditstatic.com/avatars/defaults/v2/avatar_default_3.png";

    const FALLBACK_COLORS = "rbrbbrbrrbbrbrbr";
    const FALLBACK_GRID_SIZE = 4;

    // Synchronous — baked in at load time, no network call
    // `context` is undefined outside the Devvit runtime (local dev); use optional chaining
    const pd = (context?.postData as PostData | undefined) ?? undefined;

    const colors = pd?.previewColors ?? FALLBACK_COLORS;
    const gridSize = pd?.previewGridSize ?? FALLBACK_GRID_SIZE;
    const isChallenge = pd?.previewIsChallenge ?? false;
    const challengerUsername = pd?.previewChallengerUsername ?? null;
    const challengerTime = pd?.previewChallengerTime ?? null;
    const avatarUrl = pd?.previewAvatarUrl ?? null;

    const cells = colors
        .slice(0, gridSize * gridSize)
        .padEnd(gridSize * gridSize, ".")
        .split("")
        .map((ch: string) =>
            ch === "r" ? "coral" : ch === "b" ? "blue" : "empty",
        );

    const prompt =
        isChallenge && challengerTime
            ? `Can you beat ${formatTime(challengerTime)}?`
            : "Can you solve today's puzzle?";

    function formatTime(seconds: number): string {
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }

    let expanding = $state(false);

    function handlePlay(event: MouseEvent): void {
        if (expanding) return;
        expanding = true;
        try {
            requestExpandedMode(event, "game");
        } catch {
            expanding = false;
        }
    }
</script>

<div class="h-full w-full overflow-hidden flex flex-col bg-theme-bg-primary">
    <!-- Grid section: largest square that fits the area (both orientations) -->
    <div
        class="flex-1 min-h-0 w-full flex items-center justify-center p-5"
        style="container-type: size;"
    >
        <div
            class="grid gap-0.5"
            style="
                width: min(100cqw, 100cqh);
                height: min(100cqw, 100cqh);
                grid-template-columns: repeat({gridSize}, minmax(0, 1fr));
                grid-template-rows: repeat({gridSize}, minmax(0, 1fr));
            "
        >
            {#each cells as cell, i (i)}
                <div
                    class="rounded-full {cell === 'coral'
                        ? 'bg-urjo-coral'
                        : cell === 'blue'
                          ? 'bg-urjo-blue'
                          : 'bg-theme-empty-cell'}"
                ></div>
            {/each}
        </div>
    </div>

    <!-- Bottom section: challenge badge, prompt, button, creator -->
    <div
        class="flex-none flex flex-col items-center gap-3 px-6 pb-5 pt-2 text-center"
    >
        {#if isChallenge}
            <span
                class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-urjo-coral/20 text-urjo-coral"
            >
                <svg
                    class="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
                    <line x1="13" y1="19" x2="19" y2="13" />
                    <line x1="16" y1="16" x2="20" y2="20" />
                    <line x1="19" y1="21" x2="21" y2="19" />
                    <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
                    <line x1="5" y1="14" x2="9" y2="18" />
                    <line x1="7" y1="17" x2="4" y2="20" />
                    <line x1="3" y1="19" x2="5" y2="21" />
                </svg>
                Challenge
            </span>
        {/if}

        <h1
            class="text-xl font-extrabold tracking-tight text-theme-text-primary"
        >
            {prompt}
        </h1>

        <button
            onclick={handlePlay}
            disabled={expanding}
            class="animate-bounce-btn inline-flex items-center justify-center gap-2 w-full py-4 rounded-full font-bold text-2xl bg-urjo-coral text-white shadow-lg disabled:opacity-50"
            aria-label="Play Urjo"
        >
            {#if expanding}
                Opening…
            {:else}
                <svg
                    class="w-6 h-6"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path d="M8 5v14l11-7z" />
                </svg>
                Play
            {/if}
        </button>

        {#if isChallenge && challengerUsername}
            <div class="flex items-center gap-2.5">
                <img
                    src={avatarUrl ?? DEFAULT_AVATAR}
                    alt=""
                    class="w-10 h-10 rounded-full bg-theme-bg-secondary object-cover ring-2 ring-theme-border"
                />
                <div class="leading-tight text-left">
                    <p class="text-xs text-theme-text-muted">Made by</p>
                    <p class="text-sm font-bold text-theme-text-primary">
                        u/{challengerUsername}
                    </p>
                </div>
            </div>
        {/if}
    </div>
</div>
