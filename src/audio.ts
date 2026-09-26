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
 * Poolside electronic horn: three sharp dual-tone bursts
 * (Siren, shot-clock zero, and quarter end).
 */
function playPoolHorn(ctx: AudioContext): void {
  const now = ctx.currentTime
  const burst = 0.14
  const gap = 0.11
  const total = burst * 3 + gap * 2 + 0.04

  const master = ctx.createGain()
  master.connect(ctx.destination)
  master.gain.setValueAtTime(1, now)

  for (const [freq, level] of [
    [415, 0.55],
    [622, 0.48],
    [207, 0.16],
  ] as const) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = freq < 300 ? 'sawtooth' : 'square'
    osc.frequency.setValueAtTime(freq, now)
    osc.connect(g)
    g.connect(master)
    g.gain.setValueAtTime(0.0001, now)
    for (let i = 0; i < 3; i++) {
      const start = now + i * (burst + gap)
      const end = start + burst
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(level, start + 0.008)
      g.gain.setValueAtTime(level, end - 0.025)
      g.gain.exponentialRampToValueAtTime(0.0001, end)
    }
    osc.start(now)
    osc.stop(now + total)
  }
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
