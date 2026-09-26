import type { ClockSignal, ClockSignalKind } from './types'

let context: AudioContext | null = null
let unlocked = false

const CHANNEL = 'wp-poolside-audio'
const DEDUPE_MS = 700
let channel: BroadcastChannel | null = null
const lastPlayed: Partial<Record<ClockSignalKind, number>> = {}

type AudioContextWindow = Window & { webkitAudioContext?: typeof AudioContext }

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL)
      channel.onmessage = (ev: MessageEvent) => {
        const data = ev.data as { kind?: ClockSignalKind; t?: number } | null
        if (data?.kind && typeof data.t === 'number') lastPlayed[data.kind] = data.t
      }
    } catch {
      channel = null
    }
  }
  return channel
}

function getContext(): AudioContext | null {
  if (context) return context
  if (typeof window === 'undefined') return null
  const AudioContextCtor = window.AudioContext || (window as AudioContextWindow).webkitAudioContext
  if (!AudioContextCtor) return null
  try {
    context = new AudioContextCtor()
    return context
  } catch {
    return null
  }
}

function shouldSkip(kind: ClockSignalKind): boolean {
  getChannel()
  const t = lastPlayed[kind]
  return t != null && Date.now() - t < DEDUPE_MS
}

function markPlayed(kind: ClockSignalKind): void {
  const t = Date.now()
  lastPlayed[kind] = t
  try {
    getChannel()?.postMessage({ kind, t })
  } catch {
    /* ignore */
  }
}

/** Call from a user gesture before relying on a later clock transition. */
export function unlockAudio(): void {
  const ctx = getContext()
  if (!ctx) return
  unlocked = true
  getChannel()
  if (ctx.state === 'suspended') void ctx.resume().catch(() => { unlocked = false })
}


/**
 * Poolside electronic horn (water polo scoreboard style):
 * loud, flat dual-tone blast — not a police-style wail.
 * Used for Siren, shot-clock zero, and quarter end.
 */
function playPoolHorn(ctx: AudioContext): void {
  const now = ctx.currentTime
  const duration = 1.15
  const master = ctx.createGain()
  master.connect(ctx.destination)
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.42, now + 0.012)
  master.gain.setValueAtTime(0.42, now + duration - 0.06)
  master.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  // Dual square tones ~major-ish stack, steady pitch (classic electronic horn)
  for (const [freq, level] of [
    [415, 0.55],
    [622, 0.45],
  ] as const) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(freq, now)
    g.gain.setValueAtTime(level, now)
    osc.connect(g)
    g.connect(master)
    osc.start(now)
    osc.stop(now + duration + 0.02)
  }
  // Light saw underlay for buzz / "air" of a board horn
  const saw = ctx.createOscillator()
  const sg = ctx.createGain()
  saw.type = 'sawtooth'
  saw.frequency.setValueAtTime(207, now)
  sg.gain.setValueAtTime(0.18, now)
  saw.connect(sg)
  sg.connect(master)
  saw.start(now)
  saw.stop(now + duration + 0.02)
}

export function playClockSound(kind: ClockSignalKind): void {
  const ctx = getContext()
  if (!ctx || !unlocked) return
  if (ctx.state === 'suspended') {
    void ctx.resume().then(() => playClockSound(kind)).catch(() => { /* autoplay may remain blocked */ })
    return
  }
  // Shot, period, and manual Siren share one horn.
  // Dedupe by 'period' so shot+period in the same moment only blast once.
  const dedupeKind: ClockSignalKind = 'period'
  if (shouldSkip(dedupeKind) || shouldSkip(kind)) return
  try {
    markPlayed(kind)
    markPlayed(dedupeKind)
    playPoolHorn(ctx)
  } catch {
    /* Audio is an enhancement; never interrupt scoring. */
  }
}

export function playClockSignal(signal: ClockSignal | null | undefined): void {
  if (signal) playClockSound(signal.kind)
}
