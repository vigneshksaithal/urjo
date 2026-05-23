/**
 * Tiny WebAudio coin-clink synth.
 *
 * No audio asset needed — we synthesize a short two-note bell ("ti-ting!")
 * using oscillators, similar to how Subway Surfers / Candy Crush sell the
 * micro-reward feeling. Falls back to silent no-op if WebAudio is unavailable
 * or the page hasn't yet received a user gesture (most browsers gate AudioContext
 * creation behind that).
 *
 * Usage:
 *   playCoinChime()           — single coin pip
 *   playCoinChime({ tier: 'big' }) — bigger jackpot bell for >50 coin rewards
 */

type ChimeOptions = {
    tier?: 'small' | 'big'
    volume?: number // 0..1
}

let cachedCtx: AudioContext | null = null

const getCtx = (): AudioContext | null => {
    if (cachedCtx) return cachedCtx
    if (typeof window === 'undefined') return null
    const W = window as unknown as {
        AudioContext?: typeof AudioContext
        webkitAudioContext?: typeof AudioContext
    }
    const Ctor = W.AudioContext ?? W.webkitAudioContext
    if (!Ctor) return null
    try {
        cachedCtx = new Ctor()
        return cachedCtx
    } catch {
        return null
    }
}

const playTone = (
    ctx: AudioContext,
    freq: number,
    startOffset: number,
    duration: number,
    volume: number,
): void => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.value = freq

    const start = ctx.currentTime + startOffset
    const peak = volume
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + duration + 0.05)
}

/** Play a single coin pip — short upward two-note arpeggio. */
export const playCoinChime = (opts: ChimeOptions = {}): void => {
    const ctx = getCtx()
    if (!ctx) return

    // Many browsers start the AudioContext in 'suspended' state until a user
    // gesture has occurred. Resume non-blocking; if it fails, just no-op.
    if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {
            // Ignore — playback simply won't happen
        })
    }

    const volume = opts.volume ?? 0.18
    const tier = opts.tier ?? 'small'

    if (tier === 'big') {
        // Three-note jackpot bell
        playTone(ctx, 880, 0.0, 0.18, volume)
        playTone(ctx, 1175, 0.06, 0.18, volume)
        playTone(ctx, 1568, 0.12, 0.28, volume * 0.9)
    } else {
        // Two-note "ti-ting"
        playTone(ctx, 988, 0.0, 0.12, volume)
        playTone(ctx, 1318, 0.05, 0.18, volume * 0.85)
    }
}

/** Optional: short ascending whoosh for the big "TIER!" reveal. */
export const playTierFanfare = (volume = 0.16): void => {
    const ctx = getCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => { /* ignore */ })
    }
    playTone(ctx, 523, 0.0, 0.12, volume)
    playTone(ctx, 659, 0.08, 0.12, volume)
    playTone(ctx, 784, 0.16, 0.18, volume)
    playTone(ctx, 1047, 0.24, 0.28, volume)
}
