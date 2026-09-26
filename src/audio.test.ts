import { describe, expect, it } from 'vitest'
import { demoMatch } from './demo'
import { endQuarter, signalSiren, tickClock } from './engine'
import type { Match } from './types'

function live(partial: Partial<Match> = {}): Match {
  return { ...demoMatch(), started: true, clockSignal: null, ...partial }
}

describe('poolside clockSignal', () => {
  it('emits shot signal when shot clock hits zero while running', () => {
    const m = live({
      clockRemainingSec: 60,
      clockRunning: true,
      shotClockRemainingSec: 0.2,
      shotClockRunning: true,
    })
    const next = tickClock(m, 0.25)
    expect(next.shotClockRemainingSec).toBe(0)
    expect(next.shotClockRunning).toBe(false)
    expect(next.clockSignal?.kind).toBe('shot')
    expect(next.clockSignal?.id).toBeTruthy()
  })

  it('emits period (not shot) when game clock expires same tick', () => {
    const m = live({
      clockRemainingSec: 0.2,
      clockRunning: true,
      shotClockRemainingSec: 5,
      shotClockRunning: true,
      quarterBreakSec: 30,
      currentPeriod: 1,
    })
    const next = tickClock(m, 0.25)
    expect(next.clockSignal?.kind).toBe('period')
    expect(next.breakKind).toBe('quarter')
  })

  it('manual endQuarter emits period signal', () => {
    const m = live({
      clockRemainingSec: 120,
      clockRunning: false,
      currentPeriod: 1,
      quarterBreakSec: 30,
    })
    const { match: next } = endQuarter(m)
    expect(next.clockSignal?.kind).toBe('period')
  })

  it('does not re-emit shot on subsequent ticks after expiry', () => {
    const m = live({
      clockRemainingSec: 60,
      clockRunning: true,
      shotClockRemainingSec: 0.1,
      shotClockRunning: true,
    })
    const a = tickClock(m, 0.25)
    const id = a.clockSignal?.id
    const b = tickClock({ ...a, clockRunning: true }, 0.25)
    expect(b.clockSignal?.id).toBe(id)
  })

  it('manual Siren emits a fresh period signal for the board', () => {
    const m = live({ clockSignal: { id: 'old', kind: 'period' } })
    const next = signalSiren(m)
    expect(next.clockSignal?.kind).toBe('period')
    expect(next.clockSignal?.id).toBeTruthy()
    expect(next.clockSignal?.id).not.toBe('old')
  })
})
