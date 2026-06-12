<script lang="ts">
    import type { SimpleMetrics } from "../../shared/metrics-types";
    import { focusTrap } from "../lib/focus-trap";
    import X from "lucide-svelte/icons/x";
    import Loader2 from "lucide-svelte/icons/loader-2";
    import BarChart2 from "lucide-svelte/icons/bar-chart-2";
    import RefreshCw from "lucide-svelte/icons/refresh-cw";

    type Props = {
        isOpen: boolean;
        onClose: () => void;
    };

    let { isOpen, onClose }: Props = $props();

    let metrics = $state<SimpleMetrics[]>([]);
    let loading = $state(false);
    let error = $state<string | null>(null);

    // Most recent day with a closed retention window drives the headline tiles.
    let latest = $derived(metrics[metrics.length - 1] ?? null);

    $effect(() => {
        if (isOpen && metrics.length === 0) {
            void fetchMetrics();
        }
    });

    async function fetchMetrics(): Promise<void> {
        loading = true;
        error = null;
        try {
            const res = await fetch("/api/analytics/metrics?days=14");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.status === "error") throw new Error(json.message);
            metrics = json.data as SimpleMetrics[];
        } catch (e) {
            error = e instanceof Error ? e.message : "Failed to load analytics";
        } finally {
            loading = false;
        }
    }

    const num = (n: number): string => n.toLocaleString();
    const pct = (n: number | null): string =>
        n === null ? "—" : `${(n * 100).toFixed(1)}%`;
    const secs = (n: number | null): string =>
        n === null ? "—" : `${Math.round(n)}s`;

    type Tile = { label: string; value: string; hint: string };
    let tiles = $derived<Tile[]>(
        latest === null
            ? []
            : [
                  {
                      label: "Opens",
                      value: num(latest.opens),
                      hint: "unique/day",
                  },
                  {
                      label: "Views",
                      value: num(latest.views),
                      hint: "no action",
                  },
                  {
                      label: "Completions",
                      value: num(latest.completions),
                      hint: "solved",
                  },
                  {
                      label: "Play Time",
                      value: secs(latest.averagePlaySeconds),
                      hint: "avg/session",
                  },
                  {
                      label: "D1 Retention",
                      value: pct(latest.d1Retention),
                      hint: "next day",
                  },
                  {
                      label: "D7 Retention",
                      value: pct(latest.d7Retention),
                      hint: "7 days",
                  },
              ],
    );
</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 bg-theme-overlay backdrop-blur-sm z-40 flex items-center justify-center p-4"
        onclick={onClose}
    >
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="bg-theme-bg-modal rounded-xl border border-theme-border w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
            onclick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Analytics Dashboard"
            tabindex="-1"
            use:focusTrap={{ onClose }}
        >
            <!-- Header -->
            <div
                class="flex items-center justify-between px-4 py-3 border-b border-theme-border"
            >
                <div class="flex items-center gap-2">
                    <BarChart2 class="w-5 h-5 text-theme-text-primary" />
                    <h2 class="text-base font-bold text-theme-text-primary">
                        Analytics
                    </h2>
                </div>
                <div class="flex items-center gap-1">
                    <button
                        class="p-2 rounded-lg hover:bg-theme-bg-hover text-theme-text-muted disabled:opacity-50"
                        onclick={() => void fetchMetrics()}
                        disabled={loading}
                        aria-label="Refresh"
                    >
                        <RefreshCw
                            class="w-4 h-4 {loading ? 'animate-spin' : ''}"
                        />
                    </button>
                    <button
                        class="p-2 rounded-lg hover:bg-theme-bg-hover text-theme-text-muted"
                        onclick={onClose}
                        aria-label="Close"
                    >
                        <X class="w-5 h-5" />
                    </button>
                </div>
            </div>

            <!-- Body -->
            <div class="flex-1 overflow-y-auto p-4">
                {#if loading && metrics.length === 0}
                    <div
                        class="flex flex-col items-center justify-center py-12 text-theme-text-muted"
                    >
                        <Loader2 class="w-6 h-6 animate-spin mb-2" />
                        <p class="text-sm">Loading metrics…</p>
                    </div>
                {:else if error}
                    <div
                        class="rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 px-4 py-3 text-sm"
                    >
                        {error}
                    </div>
                {:else if latest === null}
                    <p class="text-sm text-theme-text-muted text-center py-12">
                        No data yet.
                    </p>
                {:else}
                    <!-- Headline tiles: most recent day -->
                    <p class="text-xs text-theme-text-muted mb-2">
                        Latest day · {latest.date}
                    </p>
                    <div class="grid grid-cols-2 gap-2 mb-4">
                        {#each tiles as tile (tile.label)}
                            <div
                                class="rounded-lg border border-theme-border p-3"
                            >
                                <p class="text-xs text-theme-text-muted">
                                    {tile.label}
                                </p>
                                <p
                                    class="text-xl font-bold text-theme-text-primary mt-0.5"
                                >
                                    {tile.value}
                                </p>
                                <p class="text-[10px] text-theme-text-muted">
                                    {tile.hint}
                                </p>
                            </div>
                        {/each}
                    </div>

                    <!-- Daily table -->
                    <div
                        class="rounded-lg border border-theme-border overflow-hidden"
                    >
                        <table class="w-full text-xs">
                            <thead>
                                <tr
                                    class="bg-theme-bg-hover text-theme-text-muted"
                                >
                                    <th
                                        class="px-2 py-2 text-left font-semibold"
                                        >Date</th
                                    >
                                    <th
                                        class="px-2 py-2 text-right font-semibold"
                                        >Opens</th
                                    >
                                    <th
                                        class="px-2 py-2 text-right font-semibold"
                                        >Views</th
                                    >
                                    <th
                                        class="px-2 py-2 text-right font-semibold"
                                        >Compl.</th
                                    >
                                    <th
                                        class="px-2 py-2 text-right font-semibold"
                                        >Play</th
                                    >
                                    <th
                                        class="px-2 py-2 text-right font-semibold"
                                        >D1</th
                                    >
                                    <th
                                        class="px-2 py-2 text-right font-semibold"
                                        >D7</th
                                    >
                                </tr>
                            </thead>
                            <tbody>
                                {#each [...metrics].reverse() as d, i (d.date)}
                                    <tr
                                        class={i % 2 === 0
                                            ? "bg-theme-bg-modal"
                                            : "bg-theme-bg-hover/40"}
                                    >
                                        <td
                                            class="px-2 py-2 text-left text-theme-text-muted whitespace-nowrap"
                                            >{d.date.slice(5)}</td
                                        >
                                        <td
                                            class="px-2 py-2 text-right text-theme-text-primary"
                                            >{num(d.opens)}</td
                                        >
                                        <td
                                            class="px-2 py-2 text-right text-theme-text-primary"
                                            >{num(d.views)}</td
                                        >
                                        <td
                                            class="px-2 py-2 text-right text-theme-text-primary"
                                            >{num(d.completions)}</td
                                        >
                                        <td
                                            class="px-2 py-2 text-right text-theme-text-primary"
                                            >{secs(d.averagePlaySeconds)}</td
                                        >
                                        <td
                                            class="px-2 py-2 text-right text-theme-text-primary"
                                            >{pct(d.d1Retention)}</td
                                        >
                                        <td
                                            class="px-2 py-2 text-right text-theme-text-primary"
                                            >{pct(d.d7Retention)}</td
                                        >
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
