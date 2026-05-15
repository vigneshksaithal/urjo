<script lang="ts">
    import type { DashboardData } from "../../shared/growth-types";
    import { focusTrap } from "../lib/focus-trap";
    import X from "lucide-svelte/icons/x";
    import Loader2 from "lucide-svelte/icons/loader-2";
    import BarChart2 from "lucide-svelte/icons/bar-chart-2";
    import AlertTriangle from "lucide-svelte/icons/alert-triangle";
    import TrendingUp from "lucide-svelte/icons/trending-up";
    import RefreshCw from "lucide-svelte/icons/refresh-cw";

    type Props = {
        isOpen: boolean;
        onClose: () => void;
    };

    let { isOpen, onClose }: Props = $props();

    type Tab = "overview" | "daily";

    let activeTab = $state<Tab>("overview");
    let dashboards = $state<DashboardData[]>([]);
    let loading = $state(false);
    let error = $state<string | null>(null);

    // Latest dashboard entry (most recent day)
    let latest = $derived(dashboards[dashboards.length - 1] ?? null);

    $effect(() => {
        if (isOpen && dashboards.length === 0) {
            fetchDashboard();
        }
    });

    async function fetchDashboard(): Promise<void> {
        loading = true;
        error = null;
        try {
            const res = await fetch("/api/analytics/dashboard");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.status === "error") throw new Error(json.message);
            dashboards = json.data as DashboardData[];
        } catch (e) {
            error = e instanceof Error ? e.message : "Failed to load analytics";
        } finally {
            loading = false;
        }
    }

    const pct = (n: number | null): string =>
        n === null ? "—" : `${(n * 100).toFixed(1)}%`;
    const num = (n: number): string => n.toLocaleString();

    function alertBg(type: "kill" | "scale"): string {
        return type === "kill"
            ? "bg-red-500/10 border-red-500/40 text-red-400"
            : "bg-emerald-500/10 border-emerald-500/40 text-emerald-400";
    }

    function alertIcon(type: "kill" | "scale"): string {
        return type === "kill" ? "🚨" : "🚀";
    }

    function phaseColor(phase: number): string {
        const colors: Record<number, string> = {
            1: "text-blue-400",
            2: "text-yellow-400",
            3: "text-orange-400",
            4: "text-emerald-400",
        };
        return colors[phase] ?? "text-theme-text-muted";
    }
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
                class="flex items-center justify-between p-4 border-b border-theme-border flex-none"
            >
                <div class="flex items-center gap-2">
                    <BarChart2 class="w-5 h-5 text-blue-400" />
                    <h2 class="text-lg font-bold text-theme-text-primary">
                        Analytics
                    </h2>
                    {#if latest}
                        <span class="text-xs text-theme-text-muted">
                            Day {latest.currentPhase.dayNumber}
                        </span>
                    {/if}
                </div>
                <div class="flex items-center gap-2">
                    <button
                        onclick={fetchDashboard}
                        class="text-theme-text-muted hover:text-theme-text-primary transition-colors p-1"
                        aria-label="Refresh"
                        disabled={loading}
                    >
                        <RefreshCw
                            class="w-4 h-4 {loading ? 'animate-spin' : ''}"
                        />
                    </button>
                    <button
                        onclick={onClose}
                        class="text-theme-text-muted hover:text-theme-text-primary transition-colors p-1"
                        aria-label="Close"
                    >
                        <X class="w-5 h-5" />
                    </button>
                </div>
            </div>

            <!-- Tabs -->
            <div class="flex border-b border-theme-border flex-none">
                <button
                    onclick={() => (activeTab = "overview")}
                    class="flex-1 px-4 py-3 text-sm font-medium transition-colors
						{activeTab === 'overview'
                        ? 'text-theme-text-primary bg-theme-hover border-b-2 border-blue-400'
                        : 'text-theme-text-muted hover:text-theme-text-primary'}"
                >
                    Overview
                </button>
                <button
                    onclick={() => (activeTab = "daily")}
                    class="flex-1 px-4 py-3 text-sm font-medium transition-colors
						{activeTab === 'daily'
                        ? 'text-theme-text-primary bg-theme-hover border-b-2 border-blue-400'
                        : 'text-theme-text-muted hover:text-theme-text-primary'}"
                >
                    14-Day Table
                </button>
            </div>

            <!-- Body -->
            <div class="flex-1 min-h-0 overflow-y-auto">
                {#if loading}
                    <div class="flex items-center justify-center py-12">
                        <Loader2
                            class="w-8 h-8 text-theme-text-muted animate-spin"
                        />
                    </div>
                {:else if error}
                    <div class="text-center py-10 px-4">
                        <p class="text-red-400 mb-4">{error}</p>
                        <button
                            onclick={fetchDashboard}
                            class="px-4 py-2 border border-red-400 text-red-400 rounded-lg text-sm hover:bg-red-400/10 active:scale-95 transition-all"
                        >
                            Retry
                        </button>
                    </div>
                {:else if !latest}
                    <div
                        class="text-center py-10 text-theme-text-muted text-sm"
                    >
                        No data yet. Analytics will appear once users start
                        playing.
                    </div>
                {:else if activeTab === "overview"}
                    <div class="p-4 space-y-4">
                        <!-- Roadmap phase -->
                        <div
                            class="rounded-lg border border-theme-border bg-theme-hover p-3"
                        >
                            <div class="flex items-center justify-between">
                                <span
                                    class="text-xs text-theme-text-muted uppercase tracking-wide"
                                    >Roadmap Phase</span
                                >
                                {#if latest.currentPhase.isComplete}
                                    <span class="text-xs text-emerald-400"
                                        >✅ Complete</span
                                    >
                                {/if}
                            </div>
                            <p
                                class="mt-1 font-bold {phaseColor(
                                    latest.currentPhase.phase,
                                )}"
                            >
                                Phase {latest.currentPhase.phase}: {latest
                                    .currentPhase.label}
                            </p>
                            {#if latest.currentPhase.suggestedActions.length > 0}
                                <ul class="mt-2 space-y-1">
                                    {#each latest.currentPhase.suggestedActions as action}
                                        <li
                                            class="text-xs text-theme-text-muted flex gap-1.5"
                                        >
                                            <span class="text-theme-text-muted"
                                                >→</span
                                            >
                                            {action}
                                        </li>
                                    {/each}
                                </ul>
                            {/if}
                        </div>

                        <!-- Alerts -->
                        {#if latest.alerts.length > 0 || latest.dqSuppressedRuleIds.length > 0}
                            <div class="space-y-2">
                                <p
                                    class="text-xs text-theme-text-muted uppercase tracking-wide flex items-center gap-1"
                                >
                                    <AlertTriangle class="w-3 h-3" />
                                    Alerts
                                </p>
                                {#each latest.alerts.filter((a) => !latest.dqSuppressedRuleIds.includes(a.ruleId)) as alert}
                                    <div
                                        class="rounded-lg border px-3 py-2 text-sm {alertBg(
                                            alert.type,
                                        )}"
                                    >
                                        {alertIcon(alert.type)}
                                        {alert.message}
                                        <span class="text-xs opacity-70 ml-1">
                                            ({pct(alert.metricValue)} vs {pct(
                                                alert.threshold,
                                            )})
                                        </span>
                                    </div>
                                {/each}
                                {#if latest.dqSuppressedRuleIds.length > 0}
                                    <div
                                        class="rounded-lg border border-theme-border bg-theme-hover px-3 py-2 text-sm text-theme-text-muted"
                                    >
                                        ℹ️ {latest.dqSuppressedRuleIds.length}
                                        {latest.dqSuppressedRuleIds.length === 1
                                            ? "rule"
                                            : "rules"} suppressed due to data quality
                                    </div>
                                {/if}
                            </div>
                        {/if}

                        <!-- 7-day rolling metrics -->
                        <div>
                            <p
                                class="text-xs text-theme-text-muted uppercase tracking-wide flex items-center gap-1 mb-2"
                            >
                                <TrendingUp class="w-3 h-3" />
                                7-Day Rolling Averages
                            </p>
                            <div class="grid grid-cols-2 gap-2">
                                <div
                                    class="rounded-lg border border-theme-border bg-theme-hover p-3"
                                >
                                    <p class="text-xs text-theme-text-muted">
                                        DQE (avg)
                                    </p>
                                    <p
                                        class="text-xl font-bold text-theme-text-primary mt-0.5"
                                    >
                                        {latest.rolling.dqe7d === null
                                            ? "—"
                                            : num(
                                                  Math.round(
                                                      latest.rolling.dqe7d,
                                                  ),
                                              )}
                                        {#if latest.rolling.dqe7d === null}
                                            <span
                                                class="ml-1 text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 rounded px-1 py-0.5"
                                                >DQ</span
                                            >
                                        {/if}
                                    </p>
                                </div>
                                <div
                                    class="rounded-lg border border-theme-border bg-theme-hover p-3"
                                >
                                    <p class="text-xs text-theme-text-muted">
                                        D1 Return
                                    </p>
                                    <p
                                        class="text-xl font-bold {latest.rolling
                                            .d1ReturnRate7d === null
                                            ? 'text-theme-text-muted'
                                            : latest.rolling.d1ReturnRate7d >=
                                                0.4
                                              ? 'text-emerald-400'
                                              : latest.rolling.d1ReturnRate7d <
                                                  0.15
                                                ? 'text-red-400'
                                                : 'text-theme-text-primary'} mt-0.5"
                                    >
                                        {pct(latest.rolling.d1ReturnRate7d)}
                                        {#if latest.rolling.d1ReturnRate7d === null}
                                            <span
                                                class="ml-1 text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 rounded px-1 py-0.5"
                                                >DQ</span
                                            >
                                        {/if}
                                    </p>
                                </div>
                                <div
                                    class="rounded-lg border border-theme-border bg-theme-hover p-3"
                                >
                                    <p class="text-xs text-theme-text-muted">
                                        First Action Rate
                                    </p>
                                    <p
                                        class="text-xl font-bold {latest.rolling
                                            .firstActionRate7d === null
                                            ? 'text-theme-text-muted'
                                            : latest.rolling
                                                    .firstActionRate7d >= 0.5
                                              ? 'text-emerald-400'
                                              : 'text-red-400'} mt-0.5"
                                    >
                                        {pct(latest.rolling.firstActionRate7d)}
                                        {#if latest.rolling.firstActionRate7d === null}
                                            <span
                                                class="ml-1 text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 rounded px-1 py-0.5"
                                                >DQ</span
                                            >
                                        {/if}
                                    </p>
                                </div>
                                <div
                                    class="rounded-lg border border-theme-border bg-theme-hover p-3"
                                >
                                    <p class="text-xs text-theme-text-muted">
                                        Completion Rate
                                    </p>
                                    <p
                                        class="text-xl font-bold {latest.rolling
                                            .completionRate7d === null
                                            ? 'text-theme-text-muted'
                                            : latest.rolling.completionRate7d >=
                                                0.3
                                              ? 'text-emerald-400'
                                              : 'text-red-400'} mt-0.5"
                                    >
                                        {pct(latest.rolling.completionRate7d)}
                                        {#if latest.rolling.completionRate7d === null}
                                            <span
                                                class="ml-1 text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 rounded px-1 py-0.5"
                                                >DQ</span
                                            >
                                        {/if}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Today's snapshot -->
                        <div>
                            <p
                                class="text-xs text-theme-text-muted uppercase tracking-wide mb-2"
                            >
                                Today ({latest.date})
                            </p>
                            <div
                                class="rounded-lg border border-theme-border overflow-hidden"
                            >
                                {#each [{ label: "Post Opens", value: num(latest.daily.postOpens) }, { label: "First Actions", value: num(latest.daily.firstActions) }, { label: "Completions", value: num(latest.daily.completions) }, { label: "D3 Return", value: pct(latest.daily.d3ReturnRate ?? null) }, { label: "Daily Engagers", value: num(latest.daily.growth?.dailyActiveEngagers ?? 0) }, { label: "Challenge Posts", value: num(latest.daily.growth?.challengePosts ?? 0) }, { label: "K", value: (latest.daily.growth?.kFactor ?? 0).toFixed(2) }, { label: "Season Players", value: num(latest.seasonParticipants) }] as row, i}
                                    <div
                                        class="flex justify-between px-3 py-2 text-sm {i %
                                            2 ===
                                        0
                                            ? ''
                                            : 'bg-theme-hover'}"
                                    >
                                        <span class="text-theme-text-muted"
                                            >{row.label}</span
                                        >
                                        <span
                                            class="font-medium text-theme-text-primary"
                                            >{row.value}</span
                                        >
                                    </div>
                                {/each}
                            </div>
                        </div>
                    </div>
                {:else}
                    <!-- Daily table -->
                    <div class="overflow-x-auto">
                        <table
                            class="w-full text-xs border-collapse min-w-[480px]"
                        >
                            <thead>
                                <tr
                                    class="border-b border-theme-border text-theme-text-muted"
                                >
                                    <th class="px-3 py-2 text-left font-medium"
                                        >Date</th
                                    >
                                    <th class="px-3 py-2 text-right font-medium"
                                        >Opens</th
                                    >
                                    <th class="px-3 py-2 text-right font-medium"
                                        >Actions</th
                                    >
                                    <th class="px-3 py-2 text-right font-medium"
                                        >Completions</th
                                    >
                                    <th class="px-3 py-2 text-right font-medium"
                                        >1st Act%</th
                                    >
                                    <th class="px-3 py-2 text-right font-medium"
                                        >Compl%</th
                                    >
                                    <th class="px-3 py-2 text-right font-medium"
                                        >D1 Ret%</th
                                    >
                                </tr>
                            </thead>
                            <tbody>
                                {#each [...dashboards].reverse() as d, i}
                                    <tr
                                        class="border-b border-theme-border {i %
                                            2 ===
                                        0
                                            ? ''
                                            : 'bg-theme-hover'}"
                                    >
                                        <td
                                            class="px-3 py-2 text-theme-text-muted font-mono"
                                        >
                                            {d.date}
                                            {#if d.daily.dq.firstActionMissing}
                                                <span
                                                    class="ml-1 text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 rounded px-1 py-0.5"
                                                    >DQ</span
                                                >
                                            {/if}
                                        </td>
                                        <td
                                            class="px-3 py-2 text-right text-theme-text-primary"
                                            >{num(d.daily.postOpens)}</td
                                        >
                                        <td
                                            class="px-3 py-2 text-right text-theme-text-primary"
                                            >{num(d.daily.firstActions)}</td
                                        >
                                        <td
                                            class="px-3 py-2 text-right text-theme-text-primary"
                                            >{num(d.daily.completions)}</td
                                        >
                                        <td
                                            class="px-3 py-2 text-right {d.daily
                                                .firstActionRate === null
                                                ? 'text-theme-text-muted'
                                                : d.daily.firstActionRate >= 0.5
                                                  ? 'text-emerald-400'
                                                  : d.daily.firstActionRate > 0
                                                    ? 'text-red-400'
                                                    : 'text-theme-text-muted'}"
                                        >
                                            {d.daily.firstActionRate === null
                                                ? "—"
                                                : d.daily.postOpens > 0
                                                  ? pct(d.daily.firstActionRate)
                                                  : "—"}
                                        </td>
                                        <td
                                            class="px-3 py-2 text-right {d.daily
                                                .completionRate === null
                                                ? 'text-theme-text-muted'
                                                : d.daily.completionRate >= 0.3
                                                  ? 'text-emerald-400'
                                                  : d.daily.completionRate > 0
                                                    ? 'text-red-400'
                                                    : 'text-theme-text-muted'}"
                                        >
                                            {d.daily.completionRate === null
                                                ? "—"
                                                : d.daily.firstActions > 0
                                                  ? pct(d.daily.completionRate)
                                                  : "—"}
                                        </td>
                                        <td
                                            class="px-3 py-2 text-right {d.daily
                                                .d1ReturnRate === null
                                                ? 'text-theme-text-muted'
                                                : d.daily.d1ReturnRate >= 0.4
                                                  ? 'text-emerald-400'
                                                  : d.daily.d1ReturnRate >= 0.15
                                                    ? 'text-theme-text-primary'
                                                    : d.daily.d1ReturnRate > 0
                                                      ? 'text-red-400'
                                                      : 'text-theme-text-muted'}"
                                        >
                                            {d.daily.d1ReturnRate === null ||
                                            d.daily.d1ReturnRate <= 0
                                                ? "—"
                                                : pct(d.daily.d1ReturnRate)}
                                        </td>
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
