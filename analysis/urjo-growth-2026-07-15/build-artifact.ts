type AnalyticsRow = {
  date: string
  qualified_installs: number
  qualified_engagers: number
  logged_in: number
  logged_out: number
  qe_7d_avg: number
  qe_7d_logged_in: number
  qe_7d_logged_out: number
  qe_14d_avg: number
  qe_14d_logged_in: number
  qe_14d_logged_out: number
  tier: string
}

type JourneyRow = {
  utc_day: string
  app_ready_count: number
  journey_start_count: number
  start_rate: number
  journey_progress_count: number
  journey_interaction_count: number
  journey_end_count: number
  completion_rate: number
  median_session_duration_seconds: number
}

const ANALYTICS_PATH = '/Users/vigneshaithal/Downloads/Urjo_analytics_20260715_050725.csv'
const JOURNEYS_PATH = '/Users/vigneshaithal/Downloads/Urjo_journeys_analytics_20260715_050730.csv'
const OUTPUT_PATH = `${import.meta.dir}/artifact.json`
const generatedAt = new Date().toISOString()

const lines = (text: string): string[] => text.trim().split(/\r?\n/)
const number = (value: string | undefined): number => Number(value ?? 0)
const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length
const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)

const analytics = lines(await Bun.file(ANALYTICS_PATH).text())
  .slice(1)
  .map((line): AnalyticsRow => {
    const row = line.split(',')
    return {
      date: row[0] ?? '',
      qualified_installs: number(row[1]),
      qualified_engagers: number(row[2]),
      logged_in: number(row[3]),
      logged_out: number(row[4]),
      qe_7d_avg: number(row[5]),
      qe_7d_logged_in: number(row[6]),
      qe_7d_logged_out: number(row[7]),
      qe_14d_avg: number(row[8]),
      qe_14d_logged_in: number(row[9]),
      qe_14d_logged_out: number(row[10]),
      tier: row[11] ?? '',
    }
  })
  .sort((left, right) => left.date.localeCompare(right.date))

const journeyHeaders = lines(await Bun.file(JOURNEYS_PATH).text())[0]?.split(',') ?? []
const journeys = lines(await Bun.file(JOURNEYS_PATH).text())
  .slice(1)
  .map((line): JourneyRow => {
    const row = Object.fromEntries(line.split(',').map((value, index) => [journeyHeaders[index], value]))
    return {
      utc_day: row.utc_day ?? '',
      app_ready_count: number(row.app_ready_count),
      journey_start_count: number(row.journey_start_count),
      start_rate: number(row.start_rate),
      journey_progress_count: number(row.journey_progress_count),
      journey_interaction_count: number(row.journey_interaction_count),
      journey_end_count: number(row.journey_end_count),
      completion_rate: number(row.completion_rate),
      median_session_duration_seconds: number(row.median_session_duration_seconds),
    }
  })

const selectAnalytics = (start: string, end: string): AnalyticsRow[] =>
  analytics.filter((row) => row.date >= start && row.date <= end)

const first14 = selectAnalytics('2026-06-16', '2026-06-29')
const second14 = selectAnalytics('2026-06-30', '2026-07-13')
const priorWeek = selectAnalytics('2026-06-30', '2026-07-06')
const latestWeek = selectAnalytics('2026-07-07', '2026-07-13')
const comparableJourneys = journeys.filter((row) => row.utc_day >= '2026-07-10')

const prior14Average = average(first14.map((row) => row.qualified_engagers))
const latest14Average = average(second14.map((row) => row.qualified_engagers))
const priorWeekAverage = average(priorWeek.map((row) => row.qualified_engagers))
const latestWeekAverage = average(latestWeek.map((row) => row.qualified_engagers))
const comparableReady = sum(comparableJourneys.map((row) => row.app_ready_count))
const comparableStarts = sum(comparableJourneys.map((row) => row.journey_start_count))
const comparableEnds = sum(comparableJourneys.map((row) => row.journey_end_count))
const comparableStartRate = comparableStarts / comparableReady
const comparableCompletionRate = comparableEnds / comparableStarts

const headline = [{
  latest_7d_avg: latestWeekAverage,
  prior_7d_avg: priorWeekAverage,
  latest_7d_change: latestWeekAverage / priorWeekAverage - 1,
  latest_14d_avg: latest14Average,
  prior_14d_avg: prior14Average,
  latest_14d_change: latest14Average / prior14Average - 1,
  event_start_rate: comparableStartRate,
  event_end_per_start: comparableCompletionRate,
  latest_median_seconds: comparableJourneys.at(-1)?.median_session_duration_seconds ?? 0,
}]

const fixedWeeks = [
  { period: 'Jun 14–20', start: '2026-06-14', end: '2026-06-20' },
  { period: 'Jun 21–27', start: '2026-06-21', end: '2026-06-27' },
  { period: 'Jun 28–Jul 4', start: '2026-06-28', end: '2026-07-04' },
  { period: 'Jul 5–11', start: '2026-07-05', end: '2026-07-11' },
].map((week, index, all) => {
  const rows = selectAnalytics(week.start, week.end)
  const dailyAverage = average(rows.map((row) => row.qualified_engagers))
  const previous = index > 0 ? selectAnalytics(all[index - 1]?.start ?? '', all[index - 1]?.end ?? '') : []
  const previousAverage = previous.length > 0 ? average(previous.map((row) => row.qualified_engagers)) : null
  return {
    ...week,
    days: rows.length,
    average_daily_qe: dailyAverage,
    total_qe_days: sum(rows.map((row) => row.qualified_engagers)),
    change_from_previous: previousAverage === null ? null : dailyAverage / previousAverage - 1,
  }
})

const repoGaps = [
  { rank: 1, gap: 'Acquisition difficulty contradicts onboarding', evidence: 'Eight scheduled posts/day are locked to 6×6 or 8×8; zero-history adaptive users would otherwise receive 4×4.', consequence: 'Cold feed users meet the hardest board before they experience a quick win.', action: 'Use one flagship post and issue every first-time player an authored 4×4 board.' },
  { rank: 2, gap: 'Feed-preview system is disconnected', evidence: 'Preview builders and /api/preview exist, but the client never consumes them and there is one tall entrypoint.', consequence: 'The highest-leverage feed surface lacks the intended rivalry, proof, and curiosity hook.', action: 'Create a compact inline entrypoint with one Play action; load the full game after intent.' },
  { rank: 3, gap: 'Posts are opaque to search and sharing', evidence: 'Normal and challenge submitCustomPost calls omit textFallback; no uploaded share image is set.', consequence: 'Urjo forfeits Google/Reddit Answers indexing and distinctive off-platform previews.', action: 'Add rich, updateable text fallback and an i.redd.it result/challenge image.' },
  { rank: 4, gap: 'Challenge loop is unsafe to amplify', evidence: 'The three/day cap was removed; posts are not bound to an immutable verified completion; no manage/delete UX exists.', consequence: 'Scaling prompts can create spam, fabricated results, and moderation debt.', action: 'Restore caps, dedupe per verified solve, sign challenge snapshots, and add management/reporting.' },
  { rank: 5, gap: 'Post creation and sharing collide', evidence: 'After a challenge post is created the native share sheet opens, then the game immediately starts the next puzzle.', consequence: 'The player loses a clear success state and cannot inspect or personalize the newly created challenge.', action: 'Separate Create, Share, View challenge, and Continue into explicit choices.' },
  { rank: 6, gap: 'Progression value is mostly invisible', evidence: 'Shop, season strip, season leaderboard, result card, and coin display are implemented but not mounted.', consequence: 'Rewards are paid without anticipation, recognition, or a spending sink.', action: 'Mount a minimal visible identity/progression layer before adding more mechanics.' },
  { rank: 7, gap: 'Reminder and Join lifecycle are absent', evidence: 'Reminder UI only changes a Redis opt-in; no delivery scheduler/permission exists and no Join action is wired.', consequence: 'A displayed promise is false, while the strongest Home-feed retention action is unused.', action: 'Hide the reminder until real; add explicit Join after the first verified win.' },
  { rank: 8, gap: 'Growth analytics have broken semantics', evidence: 'S2R lacks a session header, recipient opens are recorded at creator posting time, and completion dedup conflicts with multi-puzzle sessions.', consequence: 'Current retention and viral-channel dashboards can recommend the wrong action.', action: 'Move to attempt/session/content IDs and record recipient events on actual entry.' },
  { rank: 9, gap: 'Economy and social proof can be wrong', evidence: 'Monday rewards can run eight times, run bonuses trust a client count, active-player cache has no expiry, daily preview freezes at one completion.', consequence: 'Visible status and rewards lose credibility when scaled.', action: 'Make rewards idempotent and server-authoritative; refresh proof with bounded TTLs.' },
  { rank: 10, gap: 'Integrity and deletion are not scale-ready', evidence: 'The full solution is sent to clients; account-deletion handler is not wired in devvit.json and misses persistent keys.', consequence: 'Competitive scores are exploitable and UGC expansion increases compliance risk.', action: 'Keep solutions server-side and complete deletion triggers/coverage before wide distribution.' },
]

const featureLadder = [
  { tier: 'Distributed', approximate_impressions: 'Thousands', surfaces: 'r/GamesOnReddit feature/banner', bar_to_clear: 'Launched build; early player feedback' },
  { tier: 'Promoted', approximate_impressions: 'Tens of thousands', surfaces: 'Games Feed and launch pad', bar_to_clear: 'Polished, cross-platform, reliable' },
  { tier: 'Highlighted', approximate_impressions: 'Hundreds of thousands', surfaces: 'Top Games Feed and Community Drawer', bar_to_clear: 'Strong CTR, retention, dwell, feedback' },
  { tier: 'Hero', approximate_impressions: 'Millions to tens of millions', surfaces: 'Games highlight, drawer, Home Feed boost', bar_to_clear: 'Flagship quality and exceptional engagement' },
]

const devvitLevers = [
  { priority: 1, feature: 'Custom inline entrypoint', current_state: 'One tall default entrypoint', urjo_move: 'Compact feed-first rivalry card; full game after Play', constraint: 'No inline scrolling; responsive on mobile and desktop' },
  { priority: 2, feature: 'Text Fallback', current_state: 'Absent on both post types', urjo_move: 'Indexable premise/rules at launch; update with recap and next round', constraint: 'Reddit API post creation; up to 40k Markdown characters' },
  { priority: 3, feature: 'Journeys + receipts', current_state: 'Newly wired; event semantics incomplete', urjo_move: 'Attempt-level Ready → Start → meaningful progress → terminal End', constraint: 'Counts are events; verify allowlisting/receipts before trusting' },
  { priority: 4, feature: 'User Actions: Join', current_state: 'Unused', urjo_move: 'Separate “Join r/urjo for tomorrow” after first value moment', constraint: 'Explicit, manual, non-gating; approval required' },
  { priority: 5, feature: 'Share sheet + deeplink data', current_state: 'Share sheet exists but no challenge payload', urjo_move: 'Open exact verified challenge state and attribute the recipient path', constraint: 'Payload ≤1,024 characters and must be treated as untrusted' },
  { priority: 6, feature: 'Media uploads + shareImageUrl', current_state: 'Unused', urjo_move: 'Dynamic spoiler-free score/challenge cards on i.redd.it', constraint: 'Public subreddit; uploaded media URL required' },
  { priority: 7, feature: 'Reddit API + flair', current_state: 'Flair path exists but opt-in is unwired', urjo_move: 'Opt-in season tier or rare identity marker', constraint: 'Keep identity compact; respect deletion and attribution' },
  { priority: 8, feature: 'Realtime', current_state: 'Unused', urjo_move: 'Weekly community race/boss and live challenge attempts', constraint: 'Server authoritative; 1MB/message and 100 messages/s/install' },
  { priority: 9, feature: 'Push notifications', current_state: 'Fake reminder UI; no permission', urjo_move: 'Apply only after organic D1/D3 and predictable cadence', constraint: 'Gated beta; opt-in/out; ≤2/user/day; copy approval' },
  { priority: 10, feature: 'App Mention Triggers', current_state: 'Unused', urjo_move: 'On-demand challenge only when a user explicitly mentions the app', constraint: 'Limited access/allowlist; no unsolicited replies' },
  { priority: 11, feature: 'Scheduler', current_state: 'Nine recurring jobs including drift', urjo_move: 'One flagship daily, one weekly event, one maintenance job', constraint: 'Maximum ten live recurring jobs per installation' },
  { priority: 12, feature: 'Payments', current_state: 'Unused', urjo_move: 'Cosmetics, creator tools, or community-benefit unlocks after retention', constraint: 'Pilot/approval; no pay-to-win, gambling, or off-platform payment' },
]

const experiments = [
  { rank: 1, experiment: 'First-screen activation', change: 'Current entry vs compact 4×4 board, one-line rule, one Play/first-cell action', primary_metric: 'Unique Start / unique Ready', decision_gate: 'Scale at ≥20% relative lift with completion no worse than −3 points', guardrail: 'p95 ready latency, errors, negative feedback' },
  { rank: 2, experiment: 'Scheduled-post cadence', change: 'Eight posts/day vs four vs one canonical flagship on matched weekdays', primary_metric: 'Daily unique verified solvers and per-post Start rate', decision_gate: 'Prefer the lowest cadence that preserves ≥90% of daily solvers and improves engagement/post', guardrail: 'Total DQE, hides/reports, feed fatigue' },
  { rank: 3, experiment: 'New-player success ramp', change: 'Locked 6×6/8×8 vs authored 4×4 first board inside the same post', primary_metric: 'First-session verified completion', decision_gate: 'Scale at ≥15% relative lift and D1 no worse', guardrail: 'Experienced-player satisfaction; time to value' },
  { rank: 4, experiment: 'Dynamic feed context', change: 'Generic puzzle vs creator/rival, target, attempts, and partial-board preview', primary_metric: 'Ready → Start', decision_gate: 'Scale at ≥15% relative lift with no latency regression', guardrail: 'Truthfulness and stale-counter rate' },
  { rank: 5, experiment: 'Completion action order', change: 'Continue-first vs Challenge-first vs Join-first after a verified win', primary_metric: 'Next-session and recipient-completion value per winner', decision_gate: 'Choose the layout with the highest 7-day total verified solves/player', guardrail: 'Accidental posting, abandonment, prompt dismissal' },
  { rank: 6, experiment: 'Join value moment', change: 'No Join prompt vs explicit Join after first verified win', primary_metric: 'Join actions per eligible winner and cohort D1/D3', decision_gate: 'Scale if D1 improves and dismissals do not depress Continue', guardrail: 'Separate action; never gate gameplay' },
  { rank: 7, experiment: 'Verified challenge share', change: 'Generic share vs signed score-to-beat deeplink + custom result image', primary_metric: 'New verified completers per sharing player', decision_gate: 'Scale only when viral K is positive and recipient quality matches organic', guardrail: 'Removal/report rate, duplicate-post rate' },
  { rank: 8, experiment: 'Structured UGC modifier', change: 'Time duel only vs one safe rule modifier/theme chosen by creator', primary_metric: 'Median qualified recipients per challenge', decision_gate: 'Scale when creators and recipients both retain better than baseline', guardrail: 'Moderation load and content supply quality' },
  { rank: 9, experiment: 'Social proof specificity', change: 'Global player count vs truthful local rank/near-miss/rival progress', primary_metric: 'Start and replay rate', decision_gate: 'Scale the proof that lifts both without increasing mistrust feedback', guardrail: 'Counter freshness and privacy' },
  { rank: 10, experiment: 'Text fallback lifecycle', change: 'Opaque post vs descriptive launch fallback updated with recap/solution', primary_metric: 'Search/Reddit Answers entrances and logged-out plays', decision_gate: 'Keep if incremental qualified entrances appear with no spoiler complaints', guardrail: 'Duplicate/keyword-stuffed content' },
  { rank: 11, experiment: 'Weekly community event', change: 'Normal weekend vs async community target with Realtime progress', primary_metric: 'Unique participants, repeat sessions, D7', decision_gate: 'Repeat only when it adds retained players rather than a one-day spike', guardrail: 'Realtime errors and core-game latency' },
  { rank: 12, experiment: 'Paid teaser acquisition', change: 'Three native teaser creatives × community/keyword audience cells', primary_metric: 'Cost per retained D3 verified solver', decision_gate: 'Scale only if paid D3 ≥80% of organic and CAC is within an agreed cap', guardrail: 'No vote solicitation; paid traffic excluded from organic claims' },
]

const roadmap = [
  { order: 1, window: 'Days 0–14', objective: 'Make growth measurable and safe', deliverables: 'Attempt/session/content IDs; receipt QA; verified completion snapshots; challenge cap/dedupe/manage; hide fake reminder; fix season reward, run bonus, cache, deletion, and solution exposure.', exit_gate: 'All funnel stages reconcile by cohort/post/build; no known reward or UGC integrity blocker.' },
  { order: 2, window: 'Days 15–30', objective: 'Fix feed-to-first-win activation', deliverables: 'One flagship cadence test; 4×4 first board; compact entrypoint; one CTA; dynamic preview; textFallback; result image; explicit Join.', exit_gate: 'Start rate +20% relative, completion stable, and rolling seven-day QE sustains above 5k.' },
  { order: 3, window: 'Days 31–60', objective: 'Launch the compounding challenge network', deliverables: 'Signed rivalry deeplinks; structured modifier; creator attribution; recipient analytics; challenge management/moderation; visible season/title/coin loop; real missions.', exit_gate: 'Positive new-completer K, recipient D1/D3 at least organic baseline, and no removal/report spike.' },
  { order: 4, window: 'Days 61–90', objective: 'Earn distribution rather than manufacture it', deliverables: 'Weekly async + Realtime event; feature-request metric pack; r/GamesOnReddit/Feedback Friday; community partnerships; small paid retained-CAC test; push application if eligible.', exit_gate: 'Stable D1/D3, low errors, repeatable UGC supply, and a credible Promoted/Highlighted featuring case.' },
  { order: 5, window: 'Months 4–12', objective: 'Scale content supply and distribution', deliverables: 'Creator reputation and discovery; seasonal live operations; additional moderator capacity; localized themes; sponsored/community-benefit events; Hero featuring campaign.', exit_gate: 'Sustained cohort quality while progressing from 50k to 100k+ daily qualified players; no dependence on one placement.' },
]

const growthLadder = [
  { order: 1, milestone: 'Immediate floor', daily_qualified_engagers: 5000, multiple_from_current: 5000 / latestWeekAverage, required_engine: 'Activation and cadence repair', external_unlock: 'H2 2026 seven-day threshold if all eligibility conditions hold' },
  { order: 2, milestone: 'Repeatable niche game', daily_qualified_engagers: 10000, multiple_from_current: 10000 / latestWeekAverage, required_engine: 'Daily habit + Join + working challenges', external_unlock: 'Stronger Promoted featuring application' },
  { order: 3, milestone: 'Breakout Reddit game', daily_qualified_engagers: 50000, multiple_from_current: 50000 / latestWeekAverage, required_engine: 'Continuous UGC supply and creator-recipient loop', external_unlock: 'Promoted/Highlighted-scale distribution' },
  { order: 4, milestone: 'Platform-scale game', daily_qualified_engagers: 100000, multiple_from_current: 100000 / latestWeekAverage, required_engine: 'Multiple retained cohorts and live operations', external_unlock: 'Highlighted placement and sponsorship leverage' },
  { order: 5, milestone: 'Million-daily ambition', daily_qualified_engagers: 1000000, multiple_from_current: 1000000 / latestWeekAverage, required_engine: 'Global UGC ecosystem + exceptional retention + repeated broad distribution', external_unlock: 'Hero-scale surfaces; still not guaranteed' },
]

const millionScenarios = [
  { scenario: 'Current observed event rates', start_rate: comparableStartRate, completion_rate: comparableCompletionRate, ready_to_completion: comparableStartRate * comparableCompletionRate, unique_ready_openers_for_1m_completions: 1_000_000 / (comparableStartRate * comparableCompletionRate), status: 'Arithmetic only; current counts are repeated events' },
  { scenario: 'Activation repaired', start_rate: 0.25, completion_rate: 0.75, ready_to_completion: 0.1875, unique_ready_openers_for_1m_completions: 1_000_000 / 0.1875, status: 'Illustrative product target, not a forecast' },
  { scenario: 'Strong feed game', start_rate: 0.35, completion_rate: 0.80, ready_to_completion: 0.28, unique_ready_openers_for_1m_completions: 1_000_000 / 0.28, status: 'Illustrative stretch, not a Reddit benchmark' },
]

const measurementTree = [
  { order: 1, layer: 'North star', metric: 'Daily Verified Solvers', definition: 'Unique logged-in players with at least one server-verified completion that day', decision: 'Is real player value growing?' },
  { order: 2, layer: 'Discovery', metric: 'Eligible impression → Ready', definition: 'Unique post exposure/open that reaches interactive readiness; preserve post/surface/source', decision: 'Is distribution reaching the right audience?' },
  { order: 3, layer: 'Activation', metric: 'Ready → Start', definition: 'Unique attempts with an explicit Play/first meaningful cell after Ready', decision: 'Does the feed screen create intent?' },
  { order: 4, layer: 'Value', metric: 'Start → verified completion', definition: 'Attempts ending in a server-verified correct solve divided by started attempts', decision: 'Does the game deliver its promise?' },
  { order: 5, layer: 'Retention', metric: 'D1 / D3 / D7', definition: 'Unique cohort players returning for a verified start or completion on exact day', decision: 'Does value persist beyond a burst?' },
  { order: 6, layer: 'Virality', metric: 'New-completer K', definition: 'Creators/solver × unique new recipients/creator × recipient verified completion rate', decision: 'Does one player create another valuable player?' },
  { order: 7, layer: 'Community', metric: 'Join + meaningful contribution', definition: 'Explicit Join actions and non-generic strategy/UGC contributions per verified solver', decision: 'Is the subreddit becoming a retention asset?' },
  { order: 8, layer: 'Quality', metric: 'p95 readiness, errors, negative feedback', definition: 'Platform/build latency, failed attempts, hides/reports/removals and opt-out rates', decision: 'Is growth degrading experience or trust?' },
]

const sqlLiteral = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return `'${String(value).replaceAll("'", "''")}'`
}

const valuesSql = (tableName: string, rows: Record<string, unknown>[]): string => {
  const columns = Object.keys(rows[0] ?? {})
  const quotedColumns = columns.map((column) => `"${column}"`).join(', ')
  const values = rows
    .map((row) => `(${columns.map((column) => sqlLiteral(row[column])).join(', ')})`)
    .join(',\n    ')
  return `WITH "${tableName}" (${quotedColumns}) AS (\n  VALUES\n    ${values}\n)\nSELECT * FROM "${tableName}";`
}

const sources = [
  { id: 'analytics_export', label: 'Urjo Reddit engagement export — 30 daily rows', path: ANALYTICS_PATH, query: { engine: 'Reviewed SQL snapshot of parsed CSV', language: 'sql', sql: valuesSql('reviewed_daily_qe', analytics), executed_at: generatedAt, description: 'Positional reconstruction of the malformed 12-field analytics export, sorted by date. The SQL reproduces the reviewed rows exposed in this report.', filters: ['2026-06-14 through 2026-07-13', 'No rows excluded'], metric_definitions: ['Latest 7d average = mean Qualified Engagers for 2026-07-07 through 2026-07-13.', 'Prior 7d average = mean Qualified Engagers for 2026-06-30 through 2026-07-06.', '14d change compares non-overlapping daily means for 2026-06-16–29 and 2026-06-30–2026-07-13.'], tables_used: ['Urjo_analytics_20260715_050725.csv', 'reviewed_daily_qe'] } },
  { id: 'journeys_export', label: 'Urjo Devvit Journeys export — five UTC daily rows', path: JOURNEYS_PATH, query: { engine: 'Reviewed SQL snapshot of parsed CSV', language: 'sql', sql: valuesSql('reviewed_journey_daily', journeys), executed_at: generatedAt, description: 'Daily event counts and reported rates from the Journeys dashboard. The SQL reproduces the reviewed rows exposed in this report.', filters: ['2026-07-10 through 2026-07-13 for comparable aggregate', '2026-07-09 excluded from aggregate as likely partial/instrumentation boundary'], metric_definitions: ['Event start rate = sum Journey Start events / sum App.Ready events.', 'End per start = sum Journey End events / sum Journey Start events.', 'These are event ratios, not person-level conversion rates.'], tables_used: ['Urjo_journeys_analytics_20260715_050730.csv', 'reviewed_journey_daily'] } },
  { id: 'repo_audit', label: 'Urjo current working-tree product and code audit', path: '/Users/vigneshaithal/Code/Reddit/urjo', query: { engine: 'Reviewed SQL snapshot of repository audit', language: 'sql', sql: valuesSql('reviewed_repo_gaps', repoGaps), executed_at: generatedAt, description: 'Read-only audit of current source, configuration, tests, and HEAD-to-working-tree differences. The SQL reproduces the ranked reviewed findings.', filters: ['Current dirty working tree preserved', 'Growth-relevant client, server, shared, and devvit.json paths'], metric_definitions: ['Code findings describe present integration behavior; deployment date and live-version equivalence are unknown.'], tables_used: ['devvit.json', 'src/client', 'src/server', 'src/shared', 'README.md', 'reviewed_repo_gaps'] } },
  { id: 'launch_guide', label: 'Reddit Devvit Launch Guide', href: 'https://developers.reddit.com/docs/guides/launch/launch-guide', query: { description: 'Official launch readiness and organic-distribution guidance.', executed_at: generatedAt } },
  { id: 'feature_guide', label: 'Reddit Devvit Featuring Guide', href: 'https://developers.reddit.com/docs/guides/launch/feature-guide', query: { engine: 'Reviewed SQL snapshot of official guide', language: 'sql', sql: valuesSql('reviewed_feature_ladder', featureLadder.map((row, index) => ({ tier_order: index + 1, ...row }))), description: 'Official featuring surfaces, tier estimates, requirements, and evaluation signals. The SQL reproduces the reviewed tier table.', executed_at: generatedAt, metric_definitions: ['Impression ranges are rough tier estimates, not guarantees.'], tables_used: ['reviewed_feature_ladder'] } },
  { id: 'community_games', label: 'Reddit Building Community Games guide', href: 'https://developers.reddit.com/docs/guides/best-practices/community_games', query: { description: 'Official feed-first, retention, progression, UGC, and scheduling practices.', executed_at: generatedAt } },
  { id: 'content_recommendations', label: 'Reddit approach to content recommendations', href: 'https://support.reddithelp.com/hc/en-us/articles/23511859482388-Reddit-s-Approach-to-Content-Recommendations', query: { description: 'Official high-level description of recommendation signals and reranking.', executed_at: generatedAt } },
  { id: 'text_fallback', label: 'Devvit Text Fallback', href: 'https://developers.reddit.com/docs/capabilities/server/text_fallback', query: { description: 'Official indexing, compatibility, safety, and thumbnail capability.', executed_at: generatedAt } },
  { id: 'logged_out', label: 'Building for Logged Out Players', href: 'https://developers.reddit.com/docs/guides/logged-out-users', query: { description: 'Official guest play, login breakpoint, sharing, deeplink, and preview guidance.', executed_at: generatedAt } },
  { id: 'custom_posts', label: 'Creating a Custom Post', href: 'https://developers.reddit.com/docs/capabilities/creating_custom_post', query: { description: 'Official post styles, dimensions, and shareImageUrl requirements.', executed_at: generatedAt } },
  { id: 'notifications', label: 'Devvit push notification guidance', href: 'https://developers.reddit.com/docs/capabilities/notifications/pn-best-practices', query: { description: 'Official eligibility, consent, copy, timing, and rate limits.', executed_at: generatedAt } },
  { id: 'devvit_rules', label: 'Devvit Rules', href: 'https://developers.reddit.com/docs/devvit_rules', query: { description: 'Official user-action, UGC, attribution, deletion, and anti-abuse rules.', executed_at: generatedAt } },
  { id: 'devvit_limits', label: 'Devvit FAQ and platform limits', href: 'https://developers.reddit.com/docs/guides/faq', query: { description: 'Official Redis, request, Realtime, post-data, and scheduler limits.', executed_at: generatedAt } },
  { id: 'honk_case', label: 'Honk official case study', href: 'https://developers.reddit.com/docs/blog/honk', query: { description: 'Official UGC level-builder and feed-growth case study.', executed_at: generatedAt } },
  { id: 'pixelary_case', label: 'Pixelary official case study', href: 'https://developers.reddit.com/docs/blog/pixelary', query: { description: 'Official playable-post, comment, first-screen, and performance case study.', executed_at: generatedAt } },
  { id: 'riddonkulous_case', label: 'Riddonkulous official case study', href: 'https://developers.reddit.com/docs/blog/riddonkulous', query: { description: 'Official one-tap UGC, community operation, and live-event case study.', executed_at: generatedAt } },
  { id: 'sword_case', label: 'Sword & Supper official case study', href: 'https://developers.reddit.com/docs/blog/sword-and-supper', query: { description: 'Official user-created mission posts and seeded-community launch case study.', executed_at: generatedAt } },
  { id: 'ads_targeting', label: 'Reddit Ads community and interest targeting', href: 'https://www.business.reddit.com/advertise/targeting/community-and-interest', query: { description: 'Official audience targeting behavior and expansion guidance.', executed_at: generatedAt } },
  { id: 'conversation_ads', label: 'Reddit Conversation Ads', href: 'https://www.business.reddit.com/advertise/ad-types/conversation-ads', query: { description: 'Official placements, objectives, targeting, and billing options.', executed_at: generatedAt } },
  { id: 'promote_post', label: 'Reddit Promote your post eligibility', href: 'https://support.reddithelp.com/hc/en-us/articles/16750646696212-Promote-your-post', query: { description: 'Official simple promotion eligibility; interactive custom posts are not listed.', executed_at: generatedAt } },
  { id: 'rdf_h2_2026', label: 'Reddit Developer Funds H2 2026 Terms', href: 'https://support.reddithelp.com/hc/en-us/articles/50860336905108-Reddit-Developer-Funds-H2-2026-Terms', query: { description: 'Official August 1–December 31, 2026 eligibility and payout terms.', executed_at: generatedAt } },
  { id: 'devvit_changelog', label: 'Devvit changelog', href: 'https://developers.reddit.com/docs/changelog', query: { description: 'Official Journeys and limited-access App Mention feature status.', executed_at: generatedAt } },
  { id: 'strategy_synthesis', label: 'Urjo growth strategy synthesis — 2026-07-15', query: { engine: 'Evidence-ranked product analysis', language: 'markdown', executed_at: generatedAt, description: 'Recommendations derived from the two exports, the current repository audit, and the official Reddit/Devvit sources listed in this report.', filters: ['No paid acquisition during observed period', 'Release attribution unknown', 'Current workspace treated as intended/live product state but not assigned causal impact'], metric_definitions: ['Scale and kill thresholds are proposed operating gates, not observed Reddit benchmarks.', 'Multiple from current = milestone daily qualified engagers / 4,747 latest seven-day average.'] } },
  { id: 'experiment_synthesis', label: 'Urjo experiment portfolio — 2026-07-15', query: { engine: 'Reviewed SQL snapshot of evidence-ranked recommendations', language: 'sql', sql: valuesSql('reviewed_experiments', experiments), executed_at: generatedAt, description: 'Proposed tests and operating gates derived from the exports, repository audit, and official Reddit guidance.', filters: ['Prioritized by dependency and expected growth leverage'], metric_definitions: ['Decision gates are proposals, not observed Reddit benchmarks.'], tables_used: ['reviewed_experiments'] } },
  { id: 'roadmap_synthesis', label: 'Urjo execution roadmap — 2026-07-15', query: { engine: 'Reviewed SQL snapshot of evidence-ranked recommendations', language: 'sql', sql: valuesSql('reviewed_roadmap', roadmap), executed_at: generatedAt, description: 'Dependency-ordered implementation roadmap with explicit exit gates.', filters: ['Measurement and safety precede activation, virality, and paid scale'], tables_used: ['reviewed_roadmap'] } },
  { id: 'growth_ladder_synthesis', label: 'Urjo scale ladder — 2026-07-15', query: { engine: 'Reviewed SQL snapshot of arithmetic and strategy', language: 'sql', sql: valuesSql('reviewed_growth_ladder', growthLadder), executed_at: generatedAt, description: 'Milestone multiples and the product engine required at each order of magnitude.', metric_definitions: ['Multiple from current = milestone daily qualified engagers / latest seven-day average of 4,747.', 'Milestones are dependencies, not forecasts.'], tables_used: ['reviewed_growth_ladder'] } },
  { id: 'measurement_synthesis', label: 'Urjo metric contract — 2026-07-15', query: { engine: 'Reviewed SQL snapshot of metric definitions', language: 'sql', sql: valuesSql('reviewed_measurement_tree', measurementTree), executed_at: generatedAt, description: 'Decision-oriented KPI hierarchy with explicit grain and purpose.', tables_used: ['reviewed_measurement_tree'] } },
  { id: 'devvit_capabilities_synthesis', label: 'Devvit capability-to-Urjo mapping — 2026-07-15', query: { engine: 'Reviewed SQL snapshot of official documentation + repository audit', language: 'sql', sql: valuesSql('reviewed_devvit_levers', devvitLevers), executed_at: generatedAt, description: 'Capability map grounded in the official Devvit docs and current Urjo implementation.', filters: ['Capabilities prioritized by growth leverage and implementation dependency'], tables_used: ['reviewed_devvit_levers'] } },
  { id: 'scenario_model', label: 'Illustrative million-completion activation model', query: { engine: 'Reviewed SQL snapshot of arithmetic scenario model', language: 'sql', sql: valuesSql('reviewed_million_scenarios', millionScenarios), executed_at: generatedAt, description: 'Transparent what-if model; not a forecast and not a claim about unique users in the Journey export.', metric_definitions: ['Ready-to-completion = start rate × completion rate.', 'Required unique ready openers = 1,000,000 / ready-to-completion.', 'Current observed rates use July 10–13 event ratios and therefore are not a person-level baseline.'], tables_used: ['reviewed_million_scenarios'] } },
]

const title = 'Urjo Growth Strategy: From 4.7k Daily Qualified Engagers to Millions'

const cards = [
  {
    id: 'latest-qe',
    dataset: 'headline',
    sourceId: 'analytics_export',
    description: 'Average daily Qualified Engagers over the latest complete seven-day window in the export.',
    metrics: [
      { label: 'Latest 7d avg QE', field: 'latest_7d_avg', format: 'compact' },
      { label: 'Prior 7d', field: 'prior_7d_avg', format: 'compact' },
      { label: 'Change', field: 'latest_7d_change', format: 'percent', signed: true },
    ],
  },
  {
    id: 'fourteen-day-step',
    dataset: 'headline',
    sourceId: 'analytics_export',
    description: 'Non-overlapping 14-day daily averages show the late-June scale step, not unique-user growth.',
    metrics: [
      { label: 'Latest 14d avg', field: 'latest_14d_avg', format: 'compact' },
      { label: 'Prior 14d', field: 'prior_14d_avg', format: 'compact' },
      { label: 'Change', field: 'latest_14d_change', format: 'percent', signed: true },
    ],
  },
  {
    id: 'journey-start',
    dataset: 'headline',
    sourceId: 'journeys_export',
    description: 'July 10–13 Journey Start events divided by App.Ready events. This is an event ratio, not a unique-user funnel.',
    metrics: [
      { label: 'Event start rate', field: 'event_start_rate', format: 'percent' },
      { label: 'Latest median sec', field: 'latest_median_seconds', format: 'number' },
    ],
  },
  {
    id: 'journey-completion',
    dataset: 'headline',
    sourceId: 'journeys_export',
    description: 'July 10–13 Journey End events divided by Journey Start events; repeated events can occur within a player.',
    metrics: [
      { label: 'End per start', field: 'event_end_per_start', format: 'percent' },
    ],
  },
]

const charts = [
  {
    id: 'daily-qe-trend',
    title: 'Daily Qualified Engagers and rolling averages',
    subtitle: 'A sharp late-June step-up is visible, followed by a volatile plateau rather than smooth compounding.',
    type: 'line',
    intent: 'trend',
    question: 'How did Urjo Qualified Engagers change across the 30-day export?',
    rationale: 'A line chart preserves daily volatility while the rolling series distinguish a durable level shift from isolated spikes.',
    comparisonContext: { grain: 'Daily', unit: 'Qualified Engagers', baseline: '7-day and 14-day rolling averages' },
    dataset: 'daily_qe',
    sourceId: 'analytics_export',
    encodings: {
      x: { field: 'date', type: 'temporal', label: 'Date' },
      y: { fields: ['qualified_engagers', 'qe_7d_avg', 'qe_14d_avg'], type: 'quantitative', format: 'compact', label: 'Qualified Engagers' },
      tooltip: [
        { field: 'logged_in', type: 'quantitative', format: 'compact', label: 'Logged in' },
        { field: 'logged_out', type: 'quantitative', format: 'compact', label: 'Logged out' },
      ],
    },
    valueFormat: 'compact',
    xAxisTitle: 'Date',
    yAxisTitle: 'Daily Qualified Engagers',
    layout: 'full',
    labels: { values: 'endpoints' },
    palette: { kind: 'categorical' },
    surface: { viewMode: 'both', interactiveLegend: true },
  },
  {
    id: 'journey-rate-trend',
    title: 'Journey event start and completion rates',
    subtitle: 'July 10–13 only. Start is the much larger observable leak; the counts are repeated events, not people.',
    type: 'line',
    intent: 'trend',
    question: 'How do event start and completion rates compare on the four comparable Journey days?',
    rationale: 'Two rate series on a shared percentage scale reveal that activation is materially weaker than post-start completion.',
    comparisonContext: { grain: 'UTC day', unit: 'Rate', denominator: 'App.Ready for start; Journey Start for completion' },
    dataset: 'journey_rates_comparable',
    sourceId: 'journeys_export',
    encodings: {
      x: { field: 'utc_day', type: 'temporal', label: 'UTC day' },
      y: { fields: ['start_rate', 'completion_rate'], type: 'quantitative', format: 'percent', label: 'Event rate' },
      tooltip: [
        { field: 'app_ready_count', type: 'quantitative', format: 'compact', label: 'App.Ready events' },
        { field: 'journey_start_count', type: 'quantitative', format: 'compact', label: 'Start events' },
        { field: 'journey_end_count', type: 'quantitative', format: 'compact', label: 'End events' },
        { field: 'median_session_duration_seconds', type: 'quantitative', format: 'number', label: 'Median seconds' },
      ],
    },
    valueFormat: 'percent',
    xAxisTitle: 'UTC day',
    yAxisTitle: 'Event rate',
    layout: 'full',
    labels: { values: 'endpoints' },
    palette: { kind: 'categorical' },
    surface: { viewMode: 'both', interactiveLegend: true },
  },
]

const tables = [
  {
    id: 'repo-gaps',
    title: 'Growth-critical repository findings',
    subtitle: 'The codebase has broad mechanics, but several acquisition, integrity, and measurement paths are disconnected.',
    dataset: 'repo_gaps',
    sourceId: 'repo_audit',
    defaultSort: { field: 'rank', direction: 'asc' },
    density: 'spacious',
    layout: 'full',
    columns: [
      { field: 'rank', label: '#', type: 'number' },
      { field: 'gap', label: 'Finding', type: 'text' },
      { field: 'evidence', label: 'Exact evidence', type: 'text' },
      { field: 'consequence', label: 'Growth consequence', type: 'text' },
      { field: 'action', label: 'Required action', type: 'text' },
    ],
  },
  {
    id: 'feature-ladder',
    title: 'Official Reddit featuring ladder',
    subtitle: 'This is the most credible platform-native route from thousands to millions of impressions.',
    dataset: 'feature_ladder',
    sourceId: 'feature_guide',
    defaultSort: { field: 'tier_order', direction: 'asc' },
    density: 'spacious',
    layout: 'full',
    columns: [
      { field: 'tier_order', label: '#', type: 'number' },
      { field: 'tier', label: 'Tier', type: 'text' },
      { field: 'approximate_impressions', label: 'Approx. impressions', type: 'text' },
      { field: 'surfaces', label: 'Primary surfaces', type: 'text' },
      { field: 'bar_to_clear', label: 'Bar to clear', type: 'text' },
    ],
  },
  {
    id: 'devvit-levers',
    title: 'Devvit features Urjo should use—and when',
    subtitle: 'Order reflects dependency and growth leverage, not feature novelty.',
    dataset: 'devvit_levers',
    sourceId: 'devvit_capabilities_synthesis',
    defaultSort: { field: 'priority', direction: 'asc' },
    density: 'spacious',
    layout: 'full',
    columns: [
      { field: 'priority', label: '#', type: 'number' },
      { field: 'feature', label: 'Capability', type: 'text' },
      { field: 'current_state', label: 'Urjo now', type: 'text' },
      { field: 'urjo_move', label: 'Exact move', type: 'text' },
      { field: 'constraint', label: 'Constraint / limit', type: 'text' },
    ],
  },
  {
    id: 'experiments',
    title: 'Prioritized experiment portfolio',
    subtitle: 'Suggested operating gates—not published Reddit benchmarks. Begin only after unique attempt and cohort semantics are repaired.',
    dataset: 'experiments',
    sourceId: 'experiment_synthesis',
    defaultSort: { field: 'rank', direction: 'asc' },
    density: 'spacious',
    layout: 'full',
    columns: [
      { field: 'rank', label: '#', type: 'number' },
      { field: 'experiment', label: 'Experiment', type: 'text' },
      { field: 'change', label: 'Treatment', type: 'text' },
      { field: 'primary_metric', label: 'Primary metric', type: 'text' },
      { field: 'decision_gate', label: 'Scale / choose gate', type: 'text' },
      { field: 'guardrail', label: 'Guardrail', type: 'text' },
    ],
  },
  {
    id: 'roadmap',
    title: 'Execution roadmap',
    subtitle: 'Each phase earns the right to start the next one.',
    dataset: 'roadmap',
    sourceId: 'roadmap_synthesis',
    defaultSort: { field: 'order', direction: 'asc' },
    density: 'spacious',
    layout: 'full',
    columns: [
      { field: 'order', label: '#', type: 'number' },
      { field: 'window', label: 'Window', type: 'text' },
      { field: 'objective', label: 'Objective', type: 'text' },
      { field: 'deliverables', label: 'Deliverables', type: 'text' },
      { field: 'exit_gate', label: 'Exit gate', type: 'text' },
    ],
  },
  {
    id: 'growth-ladder',
    title: 'Scale ladder from today to one million daily qualified engagers',
    subtitle: 'The multiples expose how much new machinery is required; they are not a forecast.',
    dataset: 'growth_ladder',
    sourceId: 'growth_ladder_synthesis',
    defaultSort: { field: 'order', direction: 'asc' },
    density: 'spacious',
    layout: 'full',
    columns: [
      { field: 'order', label: '#', type: 'number' },
      { field: 'milestone', label: 'Milestone', type: 'text' },
      { field: 'daily_qualified_engagers', label: 'Daily QE', type: 'number', format: 'compact' },
      { field: 'multiple_from_current', label: 'Multiple vs 4.7k', type: 'number' },
      { field: 'required_engine', label: 'Required engine', type: 'text' },
      { field: 'external_unlock', label: 'Likely platform unlock', type: 'text' },
    ],
  },
  {
    id: 'million-scenarios',
    title: 'Illustrative activation math for one million first completions',
    subtitle: 'Uses unique ready openers as the hypothetical population. Current Journey events are not unique users.',
    dataset: 'million_scenarios',
    sourceId: 'scenario_model',
    defaultSort: { field: 'unique_ready_openers_for_1m_completions', direction: 'desc' },
    density: 'spacious',
    layout: 'full',
    columns: [
      { field: 'scenario', label: 'Scenario', type: 'text' },
      { field: 'start_rate', label: 'Start', type: 'percent', format: 'percent' },
      { field: 'completion_rate', label: 'Completion', type: 'percent', format: 'percent' },
      { field: 'ready_to_completion', label: 'Ready → complete', type: 'percent', format: 'percent' },
      { field: 'unique_ready_openers_for_1m_completions', label: 'Ready openers needed', type: 'number', format: 'compact' },
      { field: 'status', label: 'Interpretation', type: 'text' },
    ],
  },
  {
    id: 'measurement-tree',
    title: 'Metric contract for operating Urjo',
    subtitle: 'Every metric is defined at a unique-player, attempt, content, or cohort grain.',
    dataset: 'measurement_tree',
    sourceId: 'measurement_synthesis',
    defaultSort: { field: 'order', direction: 'asc' },
    density: 'spacious',
    layout: 'full',
    columns: [
      { field: 'order', label: '#', type: 'number' },
      { field: 'layer', label: 'Layer', type: 'text' },
      { field: 'metric', label: 'Metric', type: 'text' },
      { field: 'definition', label: 'Exact definition', type: 'text' },
      { field: 'decision', label: 'Question answered', type: 'text' },
    ],
  },
]

const blocks = [
  { id: 'title', type: 'markdown', body: `# ${title}`, layout: 'full' },
  {
    id: 'executive-summary',
    type: 'markdown',
    layout: 'full',
    body: `## Executive Summary

Urjo has real traction, but not yet a compounding growth engine. The non-overlapping 14-day average doubled from 2.27k to 4.66k Qualified Engagers. The latest comparable week, however, grew only 3.8% to 4.75k and had 42% day-to-day volatility. That shape is consistent with distribution bursts followed by a plateau—not exponential retention.

The clearest observable bottleneck is before play. On July 10–13, only 14.64% of App.Ready events became Journey Starts, while 67.72% of Start events reached an End. These are repeated event ratios, not unique-user conversion, but the gap is too large to ignore: Urjo should first make people want to begin, not add another layer of streaks or rewards.

The repository explains why. Urjo already contains adaptive puzzles, streaks, coins, achievements, seasons, challenges, leaderboards, analytics, and social mechanics. Yet eight scheduled posts per day lock acquisition users into 6×6 or 8×8 boards, bypassing the intended 4×4 new-player path. The sophisticated preview system is not connected to the feed. Text fallback and share images are absent. The reminder does not deliver. Most progression is invisible. Challenge posting has lost its cap and is not bound to an immutable verified result.

### The central bet

Turn Urjo from “the same puzzle app reposted eight times” into an Urjo Challenge Network:

- One distinctive canonical daily post that gives every new player a fast 4×4 win.
- A compact, dynamic feed card with one obvious action and truthful rivalry context.
- A verified result that can become an optional, user-authored playable challenge post.
- A recipient deeplink that opens the exact board and target, then offers a rematch chain.
- Join, identity, progression, and weekly events that retain players after the core payoff.
- Quality caps, deletion, attribution, moderation, and rate limits that keep the content flywheel safe.

This is the repeated pattern in official Devvit breakout cases: Pixelary, Honk, Riddonkulous, and Sword & Supper all turn player activity into fresh Reddit-native content. Featuring can then amplify that engine from thousands to millions or tens of millions of impressions. Ads, push, Realtime, and monetization are multipliers—not substitutes.

### Immediate target

The latest seven-day average is 4,747. Sustaining above 5,000 is only a 5.3% lift and may clear the announced H2 2026 first Developer Funds threshold once the SFW, 300-WAU, unique logged-in, and other eligibility conditions are verified. The right 30-day goal is therefore: repair measurement and safety, lift Ready → Start at least 20% relative without hurting completion, sustain 5k+, and produce trustworthy D1/D3 and viral-K evidence for a featuring application.`,
  },
  { id: 'headline-metrics', type: 'metric-strip', cardIds: ['latest-qe', 'fourteen-day-step', 'journey-start', 'journey-completion'], layout: 'full' },
  {
    id: 'evidence',
    type: 'markdown',
    layout: 'full',
    body: `## 1. What the data actually says

### Scale improved sharply, then stopped compounding

- The 30 exported dates total 98,720 daily QE user-days. This is not 98,720 unique people; returning players appear on multiple days.
- Daily QE averages 3.29k, with a minimum of 826 and maximum of 6.64k.
- The non-overlapping 14-day daily average rose 105.3%, from 2.27k to 4.66k.
- The newest comparable seven-day window rose only 3.8%, from 4.57k to 4.75k.
- The latest week has a 42.1% coefficient of variation. July 9 to July 10 jumps 190%, which looks like feed placement, coverage, or telemetry discontinuity more than organic compounding.

### The observed leak is start intent

- Across all five Journey days there are 845.8k App.Ready events, 124.5k Starts, and 84.4k Ends.
- July 9 is structurally non-comparable: App.Ready jumps 16.5× the next day while QE rises only 2.9×. The comparable aggregate therefore uses July 10–13.
- Comparable event start rate is 14.64%; End/Start is 67.72%.
- Median session duration is roughly 12–15 seconds. That is already bite-sized and feed-friendly. Do not pad the core solve; put optional rivalry, progression, or social activity after the payoff.

### What did not drive the increase

- The user confirmed there were no ads.
- Logged-out QE is only about 0.15% of summed QE, so recent growth is overwhelmingly logged-in.
- Qualified Installs equals one on every date. It is not a player acquisition series and should not be used as one.
- The code release date is unknown. The report does not attribute the late-June increase to a feature or build.`,
  },
  { id: 'qe-chart', type: 'chart', chartId: 'daily-qe-trend', layout: 'full' },
  { id: 'journey-chart', type: 'chart', chartId: 'journey-rate-trend', layout: 'full' },
  {
    id: 'evidence-limits',
    type: 'markdown',
    layout: 'full',
    body: `## 2. Evidence limits and data-quality actions

The platform analytics CSV is malformed: its header splits into 16 comma-separated tokens because four labels containing commas are unquoted, while every data row has 12 fields. A generic parser can silently assign the wrong rolling metrics. The analysis reconstructs the 12 positional fields and verifies the 7-day and 14-day averages against the raw daily series.

The exports end July 13 despite July 15 filenames. Journey dates are explicitly UTC; the other export's timezone is unspecified. Same-date joins are provisional.

The current files cannot answer:

- Unique users across days, DAU/WAU stickiness, or D1/D3/D7/D30 retention.
- Feed impressions, actual CTR, post/source attribution, or new versus returning cohorts.
- Attempts per player, viral K, share-recipient quality, or challenge-cycle time.
- Release causality, platform placement effects, errors/latency, or paid ROAS.

Before any major feature decision, emit one canonical attempt record with stable pseudonymous player ID, session ID, attempt ID, event ID, schema/build/variant, post/content/source, first-seen cohort, Ready/Start/first-action/End timestamps, verified outcome, active time, abandonment reason, latency/error, share creator/recipient attribution, and campaign fields. Define the timezone, dedup window, and exact population for every rate.`,
  },
  {
    id: 'diagnosis',
    type: 'markdown',
    layout: 'full',
    body: `## 3. The real bottleneck is disconnected product semantics

Urjo does not need another generic retention mechanic. It needs the mechanics it already has to agree on who the player is, what the player sees first, and what action creates the next distribution opportunity.

### The acquisition path contradicts onboarding

devvit.json schedules eight posts every UTC day. Every scheduled board is locked to 6×6 or 8×8. The adaptive selector correctly gives a zero-history player 4×4—but only on unlocked, non-challenge posts. The primary feed acquisition path therefore bypasses the new-player success board. The dirty tree also replaces the tutorial with a brief overlay, increasing the cost of this mismatch.

### The intended feed hook never reaches the feed

The backend builds daily and challenge previews, curiosity masks, creator context, and social proof. The client does not fetch /api/preview, there is no feed/expanded-mode split, and the builder results are discarded after metadata storage. Daily proof freezes at one completion. The single tall entrypoint loads a generic app shell instead of a deliberate conversion surface.

### The social loop is not trustworthy enough to scale

Challenge creation is explicit and correctly posts as the user, which is good. But the current tree removed the three-per-day cap; accepts client-supplied time/mistakes rather than a stored verified completion; has no post management; does not attach deeplink challenge data; opens the share sheet and immediately advances the game; and lacks a custom share image. More prompts would amplify abuse and confusion before growth.

### Retention value exists but is mostly invisible

Urjo grants coins, achievements, freezes, titles, season points, mystery rewards, and leaderboard status. Several presentation components are unmounted, flair opt-in is unwired, missions are copy without progress, and the displayed reminder has no delivery mechanism. Rewards cannot create anticipation or identity if the player cannot see, understand, or spend them.

### Some internal metrics are unsafe to operate

Urjo's custom analytics stack is unusually ambitious, but S2R lacks the session header, normal Continue does not trigger conversion, recipient channel opens are recorded when the creator posts, logged-out dwell is discarded, and completion dedup does not match multi-puzzle sessions. Export the internal dashboard only after those units are repaired.`,
  },
  { id: 'repo-table', type: 'table', tableId: 'repo-gaps', layout: 'full' },
  {
    id: 'challenge-network',
    type: 'markdown',
    layout: 'full',
    body: `## 4. Build the Urjo Challenge Network

This should be the product thesis for the next 90 days.

### Core loop

1. Trigger — a distinctive daily or player-created Urjo post appears in Home, Games Feed, r/urjo, search, or a shared link.
2. Action — the player understands the rule and makes a first cell within seconds; a true first-time player receives an authored 4×4 success board.
3. Variable reward — the result reveals time, accuracy, a local rival/near miss, creator reaction, rank movement, or contribution to a community target.
4. Investment — after receiving value, the player may explicitly Join, equip an identity item, or create one verified challenge.
5. Distribution — that challenge becomes a genuinely distinct playable Reddit post with its own creator, target, preview, discussion, and search fallback.
6. Return — Join, daily stakes, season identity, and occasional high-value events bring the player back.

### Exact challenge product

- Start from an immutable server-issued completion snapshot: board ID, solution hash, verified time, mistakes, player, build, and expiry.
- Let the creator choose one structured rule: beat my time, solve perfectly, limited taps, hidden-clue mode, or faction contribution. Use safe predefined copy/themes, not unrestricted text at launch.
- Create one spoiler-free feed card showing creator identity, target, a partial board, attempts/beats, and one Play action.
- Set textFallback with the premise, rules, creator attribution, and safe contextual copy; update it later with the outcome and next challenge.
- Pass a signed opaque challenge ID through share deeplink data. Never trust client fields as identity or authorization.
- On recipient solve, show Beat/Not yet, creator/recipient comparison, and separate actions for Rematch, Share, Join, and Continue.
- Allow at most one post per verified solve and restore a conservative daily cap. Reward creators for qualified recipient completions—not post volume.
- Give creators a management page to view, delete, or stop accepting attempts. Add report/moderation hooks and deletion propagation before broad distribution.

### Content architecture

- One canonical daily post concentrates votes, comments, proof, and the daily leaderboard.
- User challenges supply genuinely fresh posts, each with a reason to exist.
- One weekly community event adds shared stakes without making the daily game dependent on concurrency.
- A recap post celebrates strategies, creators, champions, and the community outcome; it is not another duplicate puzzle slot.

This structure makes more players improve Reddit's content supply. That is the only credible exponential mechanism available inside the platform.`,
  },
  {
    id: 'reddit-distribution',
    type: 'markdown',
    layout: 'full',
    body: `## 5. How Reddit distribution actually works

Reddit does not publish a modern ranking formula or exact weights. Ignore folklore about a magic minute, vote ratio, or first-hour threshold.

What Reddit documents:

- Launching signals that an app is ready for algorithmic feeds.
- Clicks, dwell, and voting determine organic reach; quality and performance affect distribution and adoption.
- Home recommendations consider votes, comments, post age/type/flair, a user's prior community engagement and time spent, recent visits/subscriptions, “show less,” filtering, predictive ranking, and diversity reranking.
- Featuring promotion evaluates CTR, D1, D3, dwell, positive engagement/feedback, cross-platform polish, performance, and iteration.
- Community-game guidance favors bite-sized, instantly understandable play, explicit Join, fresh scheduled or UGC content, async scale, visible status, missions/events, and sustained engagement over spikes.

### The algorithm playbook for Urjo

- Optimize for earned Start, useful dwell, verified completion, meaningful votes/comments, and return—not empty App.Ready events.
- Concentrate the daily conversation instead of making eight near-identical posts compete with one another.
- Make every valid UGC post materially distinct in creator, target, rules, preview, and discussion.
- Add Join after value so future posts enter the player's Home candidate set.
- Ask for strategy, rivalry, creation, or reflection—not generic score spam. Generic scores belong under one sticky comment.
- Keep r/urjo public, SFW if compatible, recommended/high-traffic discoverability enabled, clearly described, actively moderated, and seeded with useful rules/FAQ/devnotes before a feature wave.
- Use descriptive, human post titles and textFallback. Do not keyword-stuff or repeat near-identical SEO text.
- Treat latency and correctness as growth inputs. A slow or broken first screen reduces both retention and distribution eligibility.

The legitimate “hack” is alignment: make the action that is fun for a player also create fresh, high-quality content or a retained Home-feed subscriber.`,
  },
  { id: 'feature-table', type: 'table', tableId: 'feature-ladder', layout: 'full' },
  {
    id: 'case-studies',
    type: 'markdown',
    layout: 'full',
    body: `## 6. What official breakout cases teach Urjo

The official case studies have selection bias and several games received featuring or direct support. Still, one pattern appears repeatedly enough to bet on.

- Honk passed 300k subscribers. The developer credits its breakout to a level builder that produced roughly one new level per minute; fresh UGC pulled people through the feed.
- Riddonkulous reported 30k+ subscribers, tens of thousands of active players, 10M+ views, and 8k+ community riddles in 30 days. It was lightweight, one-tap, UGC-driven, actively moderated, and later added cross-post live raids.
- Pixelary passed 65k subscribers. Each drawing creates a post and each guess creates a comment; changing content keeps the first screen fresh, asynchronous play works at any concurrency, and latency directly affected unsubscribe behavior.
- Sword & Supper makes each user-created mission its own discoverable post while character progression persists across posts. A closed beta of a few hundred players seeded an active community before wider discovery.

Urjo's existing Rival Challenge is the right seed, but today it is a share action bolted onto completion. It must become a safe creator-recipient product whose content, attribution, preview, replay, and measurement work end to end.`,
  },
  {
    id: 'devvit-section',
    type: 'markdown',
    layout: 'full',
    body: `## 7. Use Devvit as a distribution system, not only a host

Several underused Devvit capabilities map directly to the missing growth loop:

- Text Fallback is explicitly described by Reddit as critical for discoverability and growth because it enables Google and Reddit Answers indexing, compatibility, safety processing, and thumbnails.
- Custom post styles can control preload color, 320/512px height, and an i.redd.it share image. Urjo should use a compact feed surface and a full gameplay surface deliberately.
- showShareSheet and up to 1,024 characters of deeplink data can open an exact challenge. The payload is untrusted and should contain only a signed opaque ID.
- User Actions can explicitly Join r/urjo after value. It must be a separate manual action and cannot gate play.
- Realtime should power aggregated weekly/community progress after the async loop works, with an authoritative server and a non-live fallback.
- Push is a gated retention channel for established games, not a launch shortcut. Urjo's current reminder should be hidden until real delivery is approved and built.
- App Mention Triggers could eventually let a user invoke Urjo by explicitly mentioning the app in a comment, but access is allowlisted and broad game eligibility is unknown.

The table below maps the features in dependency order and records the relevant platform limits.`,
  },
  { id: 'devvit-table', type: 'table', tableId: 'devvit-levers', layout: 'full' },
  {
    id: 'product-changes',
    type: 'markdown',
    layout: 'full',
    body: `## 8. Exact changes to make, in priority order

### P0 — Stop misleading measurement and unsafe scale

1. Repair event grains: one attempt ID, one session ID, one content/post ID, one first-action event, one terminal event, and a build/variant/source on every record. Send the session header on completion and count second-puzzle behavior inside /next-challenge.
2. Restore a challenge-post cap, bind challenges and comments to a server-verified completion snapshot, dedupe per solve, and add creator management/deletion/reporting.
3. Hide “Tomorrow's puzzle reminder” until a real approved notification or honest alternative exists.
4. Fix Monday season-award idempotency, client-controlled run bonuses, milestone ordering, stale active-player cache, own-rank calculation, and daily preview counters.
5. Keep the solution server-side, wire account deletion in devvit.json, and cover every persistent identity key.

### P1 — Repair feed-to-first-win activation

6. Test one canonical daily post against the current eight-slot cadence. Do not silently assume one is better; measure unique daily solvers, per-post Start, contributions, and negative feedback.
7. Give every genuine new player an authored 4×4 board even when the public post advertises a 6×6/8×8 daily challenge. After the first win, reveal the day's canonical board or adaptive continuation.
8. Build a true compact feed entrypoint that consumes current preview data. Show one line of instruction, one primary action, a partial board, and one truthful target; defer menus and profile payloads.
9. Add textFallback to normal and challenge posts. Give each post distinctive spoiler-free context and update canonical posts with results/recap.
10. Upload and set dynamic share/result images. Fix the victory card to use the verified solved board, not the clue mask.
11. Add explicit Join after the first verified win. Let logged-out users play first, then offer login to save/Join/share while preserving the result across reload.

### P2 — Make retention and virality visible

12. Launch the signed Rival Challenge MVP described above and record recipient opens only when recipients actually arrive.
13. Mount a minimal progression layer: season/rank strip, equipped title/flair opt-in, coin balance/shop, achievement celebration, and accurate reward reveal. Do not add new currencies.
14. Build three real daily missions from existing actions with automatic claim and progress. Remove mission copy until the system is real.
15. Show local, fresh proof: your rank, nearest rival, today's verified solvers, challenge attempts/beats, and distance to the next meaningful reward.

### P3 — Earn scale

16. Run one weekly async community event with Realtime progress and a recap, after core latency and retention are stable.
17. Prepare AutoModerator, Crowd Control, rules, report flows, deletion, creator reputation, and moderator staffing before a UGC/feature wave.
18. Assemble the featuring packet: Start rate, verified completion, D1/D3, p95 ready latency/errors, UGC creator rate, new-completer K, qualitative feedback, and cross-platform screenshots.
19. Apply to r/GamesOnReddit/Featuring and use Feedback Friday; pursue App Mentions and push only when eligible.
20. Test paid acquisition last, against retained D3 solvers—not clicks.`,
  },
  {
    id: 'experiments-section',
    type: 'markdown',
    layout: 'full',
    body: `## 9. Experiment operating system

Do not ship a large bundle and then attribute the result to whichever feature is most exciting.

- Randomize at stable player or post/content level where possible; avoid switching a player between variants mid-cohort.
- Run activation experiments across at least two matched weekday cycles and through the D3 window. Cadence tests require day/post-level designs because posts share a feed.
- Predeclare one primary metric, guardrails, scale/kill gate, exposure window, and novelty follow-up.
- Analyze new vs returning, mobile vs desktop, logged-in vs logged-out, source surface, grid, latency, and build. Do not slice until a winner appears.
- Use unique attempts/players for conversion. Repeated events can diagnose instrumentation load but cannot supply person-level confidence intervals.
- Keep a permanent holdout for major loop changes so feature placement, seasonality, and novelty do not look like retention.
- Recheck every winner after 14 and 28 days. Reddit explicitly prioritizes sustained engagement over spikes.

The proposed gates below are starting operating thresholds. Replace them with empirical minimum-detectable effects once Urjo has a trustworthy baseline and variance.`,
  },
  { id: 'experiments-table', type: 'table', tableId: 'experiments', layout: 'full' },
  {
    id: 'roadmap-section',
    type: 'markdown',
    layout: 'full',
    body: `## 10. 30/60/90-day execution plan

The sequencing is deliberate: measurement and integrity first; activation second; compounding content third; distribution multipliers last. A small team should resist parallel feature construction until the prior phase's exit gate is met.

Suggested operating ownership:

- Product/growth owns hypotheses, event contracts, cohort readouts, and feature submission.
- Client owns compact entry, first-win path, completion actions, Join/login continuity, and visible progression.
- Server owns verified snapshots, attempt state, challenge integrity, deletion, reward idempotency, and attribution.
- Community operations owns rules, AutoModerator, feedback threads, creator moderation, recaps, and partnerships.
- Design owns a reusable daily/challenge preview system and result/share-card templates that can vary without losing recognition.`,
  },
  { id: 'roadmap-table', type: 'table', tableId: 'roadmap', layout: 'full' },
  {
    id: 'paid',
    type: 'markdown',
    layout: 'full',
    body: `## 11. Paid acquisition: use it as a cohort test, not a vanity spike

No ads ran during the observed period, so every recommendation here is prospective.

Reddit's simple “Promote your post” flow lists SFW public text, image, video, and link posts—not interactive/custom Devvit posts. Do not assume the rocket button can promote the Urjo game post. Use a normal native image/video/link teaser or an Advanced traffic campaign, and confirm with Reddit Ads whether a Devvit custom-post destination and deeplink attribution are supported before spending.

### First paid test

- Objective: Traffic, not App Install; Urjo is not an App Store/Play Store app.
- Creative: a six-to-ten-second board transformation, a rival score, or a partial-board curiosity card—not generic “Play my game” copy.
- Audiences: separate community, interest, and conversational-keyword ad groups so one targeting variable changes at a time. Community targeting reaches people who engaged with selected communities across Reddit; it is audience-based, not guaranteed placement inside those subreddits.
- Placement: test Feed and Conversation separately, then together only after understanding each cohort.
- Segments: mobile and desktop separated; new audiences separated from existing r/urjo/engagement audiences where tools allow.
- Attribution: distinct destination post/content and campaign IDs; verify that Reddit-internal transitions preserve the identifier. If not, paid measurement is blocked.

Optimize for cost per retained D3 verified solver. Scale only when paid D3 is at least 80% of organic, completion and error quality match organic, and the retained-player cost is inside an explicit budget cap. If there is no LTV model, paid spend is research—not growth capital.

Interactive Ads powered by Devvit exist only as an alpha/select-advertiser product. A later sponsored Urjo community challenge could be attractive, especially if premium funding unlocks content for everyone, but it requires Reddit sales involvement and should not enter the core plan.`,
  },
  {
    id: 'economics',
    type: 'markdown',
    layout: 'full',
    body: `## 12. Near-term economics and Developer Funds

The announced H2 2026 terms run August 1–December 31. They define a Daily Qualified Engager as a unique logged-in user engaging that day on eligible SFW content. The community must have at least 300 weekly active users.

- First threshold: rolling seven-day average of 5,000 DQE, paying $4,000 once.
- After qualifying and applying, example recurring monthly payouts are $0 at 5k average DQE, $5k at 50k, about $6.05k at 100k, and $25k at 1M.
- Logged-out, spam, bot, or manipulated engagement does not count.

Urjo's latest 4,747 seven-day average is close, but the export alone does not prove all H2 eligibility semantics. Verify r/urjo is public/SFW as intended, has at least 300 WAU, and that the dashboard metric aligns to the new DQE definition.

Developer Funds are an incentive, not an acquisition engine. Payments should wait until retention and creator demand are proven. When introduced, use cosmetics, identity, creator tools, or community-benefit unlocks that everyone can play. Avoid pay-to-win, gambling, deceptive pricing, or off-platform payment.`,
  },
  {
    id: 'millions',
    type: 'markdown',
    layout: 'full',
    body: `## 13. What “millions of users” actually requires

Two goals are often conflated:

- One million cumulative players is a distribution campaign plus conversion problem. Hero featuring can deliver millions to tens of millions of impressions, making this plausible if Urjo has a strong first screen and broad device quality.
- One million daily qualified engagers is a retained ecosystem problem. It is 211× the current 4,747 average and cannot be reached by one placement, eight scheduled posts, or a better streak alone.

At today's comparable event rates, Ready → Start → End is roughly 9.9%. If those were unique-user rates—which they are not—one million first completions would require about 10.1 million ready openers. Raising Start to 25% and completion to 75% roughly halves that requirement. This is why first-screen activation is economically more valuable than padding a 13-second solve.

The path is staged:

1. 5k–10k: a coherent daily habit, honest measurement, Join, and working challenges.
2. 10k–50k: continuous high-quality creator posts and creator-recipient retention.
3. 50k–100k: Promoted/Highlighted featuring, mature moderation, seasonal live operations, and reliable performance.
4. 100k–1M: Hero-level product quality, multiple content/creator cohorts, repeated broad distribution, global relevance, and no dependence on a single post or placement.

No table below is a forecast. It is a dependency map showing which growth engine must exist before each order of magnitude is credible.`,
  },
  { id: 'growth-table', type: 'table', tableId: 'growth-ladder', layout: 'full' },
  { id: 'million-scenario-table', type: 'table', tableId: 'million-scenarios', layout: 'full' },
  {
    id: 'measurement',
    type: 'markdown',
    layout: 'full',
    body: `## 14. Measurement contract

Use Daily Verified Solvers as the product north star: unique logged-in users with at least one server-verified solve that day. Keep Reddit DQE as the external program/distribution KPI. Add 28-day retained verified solvers as the durable-value companion.

### Growth equation

Daily verified solvers = unique ready entrants × Start rate × verified completion rate + returning verified solvers.

New-completer K = verified challenge creators per solver × unique new recipients per creator × recipient verified completion rate.

Do not call K “viral” unless recipients are new, unique, attributable, and complete a valuable action. Do not call D1 retention unless the exact cohort window has closed.

### Required attempt record

player_id, session_id, attempt_id, event_id, schema_version, build, experiment and variant, event_ts and ingestion_ts, first_seen/cohort/returning, subreddit/post/content/source surface, exposed/ready/start/first_action/end timestamps, verified outcome, grid/difficulty/rule, score/time/mistakes/hints, abandonment reason, active dwell, readiness/route latency and errors, creator/challenge/referrer IDs, Join/share/comment actions, deletion state, and campaign/cost fields.

Publish a metric dictionary and an automated reconciliation report: Journey Starts must equal unique begun attempts within known dedup rules; Ends must tie to attempts; daily post counts must tie to scheduler slots; viral opens must be recipient-side; and partial days/build migrations must be marked.`,
  },
  { id: 'measurement-table', type: 'table', tableId: 'measurement-tree', layout: 'full' },
  {
    id: 'policy',
    type: 'markdown',
    layout: 'full',
    body: `## 15. Compliant growth hacks only

Reject tactics that can create a temporary chart while destroying eligibility, trust, or distribution:

- No upvote rings, bought/coordinated votes, multiple-account engagement, or “upvote to unlock.”
- No mass DMs, indiscriminate subreddit posting, automated invites, or unsolicited app replies.
- No automated posting/commenting/subscription as a user. Each user action must be explicit, separate, transparent, and non-gating.
- No generic top-level score-comment flood. Generic results reply to one sticky; top-level comments should contain meaningful player commentary.
- No eight-slot occupation strategy with near-identical content. Use one canonical post plus genuinely distinct user-created posts.
- No unmoderated free-text UGC at launch; use structured expression, attribution, reporting, deletion, and quality caps.
- No paid traffic designed to manufacture organic votes or represent paid spikes as algorithm validation.
- No off-platform accounts/payments, pay-to-win, gambling, or unauthorized third-party/Reddit IP.

The compliant “hacks” are product mechanisms: instant value, fresh creator content, explicit Join, indexable fallback, distinctive share previews, creator attribution, asynchronous multiplayer, truthful status, fast loading, and a metric packet that earns featuring.`,
  },
  {
    id: 'unknowns',
    type: 'markdown',
    layout: 'full',
    body: `## 16. Unknown unknowns to resolve with Reddit

Ask Devvit/Reddit one concise, evidence-backed set of questions before committing engineering or spend:

- Exact CTR, D1, D3, dwell, error, and feedback benchmarks for each featuring tier are not public.
- The Games hub controller was only ramping to 5% of global iOS/Android users in early June 2026; current rollout and genre metadata are unclear.
- Journeys is announced as generally available, while documentation still references map approval/server allowlisting. Confirm Urjo receipts and event-map status.
- Confirm whether Advanced Ads can deep-link to a Devvit custom post, preserve campaign/deeplink data, and report downstream game actions. Simple Promote does not list custom posts.
- App Mention Triggers and push are gated; confirm Urjo eligibility, quotas, and expected review path.
- Confirm cross-subreddit custom-post/repost behavior when Urjo is not installed in a destination community. Current crosspost code is disabled by an approval flag nothing writes.
- Confirm expected performance rehearsal and capacity support before Highlighted/Hero placement. Autoscaling is not a published million-concurrent-player SLA.
- Clarify off-platform share and logged-out-to-login attribution.

Internal unknowns also matter: the production deployment date/version is unknown; the current working tree may not exactly match what generated the exports; r/urjo's SFW/300-WAU/H2 eligibility has not been independently verified; and the current internal D1/D7/S2R/viral endpoints were not exported. Resolve these before claiming causality or forecasting.`,
  },
  {
    id: 'next-moves',
    type: 'markdown',
    layout: 'full',
    body: `## 17. The next ten moves

1. Freeze feature expansion for two weeks and fix attempt/session/post/source semantics plus Journey receipt reconciliation.
2. Restore challenge safety: cap, verified snapshot, dedupe, deletion/manage/report, and server-authoritative result fields.
3. Remove or hide every false promise and corruptible reward path: reminder, Monday repeat payout, client run bonus, stale proof, exposed solution.
4. Run the 8 vs 4 vs 1 scheduled-post experiment while guaranteeing a 4×4 first board to every new player.
5. Ship the real compact feed entrypoint with one action and dynamic, truthful rivalry context.
6. Add updateable textFallback and dynamic i.redd.it share/result imagery to both post types.
7. Add explicit post-win Join/login continuity and instrument the exact D1/D3 cohort impact.
8. Launch the signed Rival Challenge MVP and optimize new verified completers per creator—not share clicks.
9. Mount only the existing progression pieces that create visible identity and next goals; build real missions before advertising them.
10. When activation, retention, K, latency, and moderation are credible, submit the Featuring packet and run a small retained-D3 paid cohort test.

The strategic decision is simple: Urjo should become a network of distinct, creator-anchored playable challenges—not a larger menu inside the same repeated daily post. Everything in this report follows from that choice.`,
  },
]

const artifact = {
  surface: 'report',
  manifest: {
    version: 1,
    surface: 'report',
    title,
    description: 'Evidence-ranked Reddit/Devvit growth strategy for Urjo, based on platform exports, the current repository, and official documentation through July 15, 2026.',
    generatedAt,
    sources,
    cards,
    charts,
    tables,
    blocks,
  },
  snapshot: {
    version: 1,
    generatedAt,
    status: 'ready',
    datasets: {
      headline,
      daily_qe: analytics,
      fixed_weeks: fixedWeeks,
      journey_daily: journeys,
      journey_rates_comparable: comparableJourneys,
      repo_gaps: repoGaps,
      feature_ladder: featureLadder.map((row, index) => ({ tier_order: index + 1, ...row })),
      devvit_levers: devvitLevers,
      experiments,
      roadmap,
      growth_ladder: growthLadder,
      million_scenarios: millionScenarios,
      measurement_tree: measurementTree,
    },
  },
  sources,
}

await Bun.write(OUTPUT_PATH, JSON.stringify(artifact, null, 2))
console.log(`Wrote ${OUTPUT_PATH}`)
