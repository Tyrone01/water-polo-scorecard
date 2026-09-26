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

function blip(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType,
  gainLevel: number,
): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  osc.connect(gain)
  gain.connect(ctx.destination)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(gainLevel, start + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

/** Short harsh two-tone buzz for shot-clock expiry. */
function playShotBuzz(ctx: AudioContext): void {
  const now = ctx.currentTime
  blip(ctx, 880, now, 0.12, 'square', 0.24)
  blip(ctx, 720, now + 0.15, 0.14, 'square', 0.22)
}

/** Longer wailing siren for quarter/game-clock expiry and manual Siren. */
function playPeriodSiren(ctx: AudioContext): void {
  const now = ctx.currentTime
  const duration = 1.4
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(660, now)
  osc.frequency.linearRampToValueAtTime(390, now + 0.35)
  osc.frequency.linearRampToValueAtTime(660, now + 0.7)
  osc.frequency.linearRampToValueAtTime(390, now + 1.05)
  osc.frequency.linearRampToValueAtTime(520, now + 1.35)
  osc.connect(gain)
  gain.connect(ctx.destination)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.28, now + 0.015)
  gain.gain.setValueAtTime(0.28, now + duration - 0.08)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  osc.start(now)
  osc.stop(now + duration + 0.03)
}

export function playClockSound(kind: ClockSignalKind): void {
  const ctx = getContext()
  if (!ctx || !unlocked) return
  if (ctx.state === 'suspended') {
    void ctx.resume().then(() => playClockSound(kind)).catch(() => { /* autoplay may remain blocked */ })
    return
  }
  if (shouldSkip(kind)) return
  try {
    markPlayed(kind)
    if (kind === 'shot') playShotBuzz(ctx)
    else playPeriodSiren(ctx)
  } catch {
    /* Audio is an enhancement; never interrupt scoring. */
  }
}

export function playClockSignal(signal: ClockSignal | null | undefined): void {
  if (signal) playClockSound(signal.kind)
}
