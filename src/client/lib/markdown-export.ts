import type { DashboardData, RollingMetrics, CurrentPhase } from '../../shared/growth-types'

/**
 * Format a single metric value for markdown display.
 * Percentages are multiplied by 100 and shown to 1 decimal place.
 * Hours are shown to 1 decimal place with "h" suffix.
 * Numbers are rendered as-is. Null values become "—".
 */
export const formatMetricValue = (
    value: number | null,
    type: 'percent' | 'hours' | 'number',
): string => {
    if (value === null) return '—'

    switch (type) {
        case 'percent':
            return `${(value * 100).toFixed(1)}%`
        case 'hours':
            return `${value.toFixed(1)}h`
        case 'number':
            return value.toString()
    }
}

/**
 * Generate a complete GFM markdown snapshot from dashboard data.
 * Includes heading, phase context, rolling averages, data table, and legend.
 */
export const generateMarkdownSnapshot = (
    dashboards: readonly DashboardData[],
    rolling: RollingMetrics,
    phase: CurrentPhase,
): string => {
    const today = new Date().toISOString().slice(0, 10)
    const lines: string[] = []

    // Level-1 heading with game name and date
    lines.push(`# Urjo Analytics — ${today}`)
    lines.push('')

    // Phase context line
    lines.push(`Phase ${phase.phase}: ${phase.label} (Day ${phase.dayNumber})`)
    lines.push('')

    // Rolling averages summary
    lines.push('## Rolling Averages (7-day)')
    lines.push('')
    lines.push(`- DQE: ${formatMetricValue(rolling.dqe7d, 'number')}`)
    lines.push(`- First Action Rate: ${formatMetricValue(rolling.firstActionRate7d, 'percent')}`)
    lines.push(`- Completion Rate: ${formatMetricValue(rolling.completionRate7d, 'percent')}`)
    lines.push(`- D1 Return Rate: ${formatMetricValue(rolling.d1ReturnRate7d, 'percent')}`)
    lines.push(`- Share Rate: ${formatMetricValue(rolling.shareRate7d, 'percent')}`)
    lines.push(`- K-Factor: ${formatMetricValue(rolling.kFactor7d, 'number')}`)
    lines.push(`- Viral Cycle Time: ${formatMetricValue(rolling.viralCycleTimeHours7d, 'hours')}`)
    lines.push('')

    // Pipe-delimited table
    lines.push('## 14-Day Metrics')
    lines.push('')

    const headerCols = ['Date', 'Opens', 'Actions', 'Completions', '1st Act%', 'Compl%', 'D1 Ret%', 'Share%', 'K', 'Cycle']
    const separatorCols = ['---', '---', '---', '---', '---', '---', '---', '---', '---', '---']

    lines.push(`| ${headerCols.join(' | ')} |`)
    lines.push(`|${separatorCols.join('|')}|`)

    for (const d of dashboards) {
        const date = d.date
        const opens = d.daily.postOpens.toString()
        const actions = d.daily.firstActions.toString()
        const completions = d.daily.completions.toString()
        const firstActPct = formatMetricValue(d.daily.firstActionRate, 'percent')
        const complPct = formatMetricValue(d.daily.completionRate, 'percent')
        const d1Ret = formatMetricValue(d.daily.d1ReturnRate, 'percent')
        const shareRate = formatMetricValue(d.daily.growth?.shareRate ?? null, 'percent')
        const kFactor = formatMetricValue(d.daily.growth?.kFactor ?? null, 'number')
        const cycle = formatMetricValue(d.daily.growth?.viralCycleTimeHours ?? null, 'hours')

        const rowCols = [date, opens, actions, completions, firstActPct, complPct, d1Ret, shareRate, kFactor, cycle]

        lines.push(`| ${rowCols.join(' | ')} |`)
    }

    lines.push('')

    // Legend section
    lines.push('## Legend')
    lines.push('')
    lines.push('- **1st Act%** = first action rate (opens → first action)')
    lines.push('- **Compl%** = completion rate (opens → completion)')
    lines.push('- **D1 Ret%** = day-1 return rate')
    lines.push('- **Share%** = share rate (completers who shared)')
    lines.push('- **K** = K-factor (viral coefficient)')
    lines.push('- **Cycle** = viral cycle time (hours from share to new player completion)')
    lines.push('')

    return lines.join('\n')
}

/**
 * Copy text to clipboard. Tries the Clipboard API first,
 * falls back to a temporary textarea + execCommand('copy').
 * Returns true on success, false if both methods fail.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
    // Try Clipboard API first
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        // Clipboard API unavailable or rejected — fall through to fallback
    }

    // Fallback: temporary textarea + execCommand
    try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        textarea.style.top = '-9999px'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        const success = document.execCommand('copy')
        document.body.removeChild(textarea)
        return success
    } catch {
        return false
    }
}
