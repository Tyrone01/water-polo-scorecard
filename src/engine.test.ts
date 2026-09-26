import { describe, expect, it } from 'vitest'
import { demoMatch } from './demo'
import {
  applyEvent,
  deleteEvent,
  deriveLiveExclusions,
  endQuarter,
  formatTime,
  parseTimeInput,
  personalFoulCount,
  rebuild,
  reconcile,
  runningScoreFromEvents,
  setOnCard,
  strikeOff,
  undoLast,
  unstrike,
  tickClock,
  quarterLengthSec,
} from './engine'
import type { Match } from './types'

function live(match: Match): Match {
  return { ...match, started: true }
}

function stamp(match: Match, side: 'white' | 'blue', cap: string, code: Parameters<typeof applyEvent>[1]['code'], t = 7 * 60 + 30) {
  return applyEvent(match, { side, cap, code, timeRemainingSec: t })
}

describe('time helpers', () => {
  it('formats and parses paper-card times', () => {
    expect(formatTime(482)).toBe('8:02')
    expect(parseTimeInput('5.22')).toBe(5 * 60 + 22)
    expect(parseTimeInput('5:22')).toBe(5 * 60 + 22)
    expect(parseTimeInput('5:99')).toBeNull()
  })
})

describe('scoring rules', () => {
  it('records even-strength goals with White–Blue running score only on goals', () => {
    let m = live(demoMatch())
    let r = stamp(m, 'blue', '4', 'G')
    expect(r.ok).toBe(true)
    m = r.match
    expect(m.events[0].score).toBe('0–1')
    r = stamp(m, 'white', '7', 'G')
    m = r.match
    expect(m.events[1].score).toBe('1–1')
    expect(runningScoreFromEvents(m.events)).toEqual({ white: 1, blue: 1 })
    const ruby = m.white.players.find((p) => p.cap === '7')!
    expect(ruby.goalsQ1).toBe(1)
    const rec = reconcile(m)
    expect(rec.ok).toBe(true)
  })

  it('warns on EG with no live exclusion on defence', () => {
    const r = stamp(live(demoMatch()), 'white', '5', 'EG')
    expect(r.ok).toBe(true)
    expect(r.warnings.some((w) => /no live exclusion/i.test(w))).toBe(true)
  })

  it('EG after E on defence does not warn', () => {
    let m = live(demoMatch())
    m = stamp(m, 'blue', '3', 'E').match
    const liveEx = deriveLiveExclusions(m)
    expect(liveEx.some((x) => x.side === 'blue')).toBe(true)
    const r = stamp(m, 'white', '5', 'EG')
    expect(r.ok).toBe(true)
    expect(r.warnings.some((w) => /no live exclusion/i.test(w))).toBe(false)
  })

  it('P is a personal foul; player stays; PG after P', () => {
    let m = live(demoMatch())
    m = stamp(m, 'blue', '6', 'P').match
    const player = m.blue.players.find((p) => p.cap === '6')!
    expect(personalFoulCount(player)).toBe(1)
    expect(player.fouls[0].code).toBe('P')
    const r = stamp(m, 'white', '4', 'PG')
    expect(r.ok).toBe(true)
    expect(r.warnings.some((w) => /no outstanding P/i.test(w))).toBe(false)
    expect(r.match.events[1].score).toBe('1–0')
  })

  it('blocks a 4th personal foul with a red-flag error', () => {
    let m = live(demoMatch())
    m = stamp(m, 'white', '8', 'E').match
    m = stamp(m, 'white', '8', 'E', 400).match
    const third = stamp(m, 'white', '8', 'P', 350)
    expect(third.ok).toBe(true)
    expect(third.warnings.some((w) => /3rd personal foul/i.test(w))).toBe(true)
    expect(third.warnings.some((w) => /substitute immediately/i.test(w))).toBe(true)
    const fourth = stamp(third.match, 'white', '8', 'E', 300)
    expect(fourth.ok).toBe(false)
    expect(fourth.error).toMatch(/RED FLAG/)
  })

  it('S fills remaining foul boxes and puts the player out', () => {
    let m = live(demoMatch())
    m = stamp(m, 'blue', '2', 'E').match
    const r = stamp(m, 'blue', '2', 'S', 400)
    expect(r.ok).toBe(true)
    const p = r.match.blue.players.find((x) => x.cap === '2')!
    expect(p.fouls[0].code).toBe('E')
    expect(p.fouls[1].code).toBe('S')
    expect(p.fouls.filter((f) => f.code === 'line').length).toBe(1)
    const blocked = stamp(r.match, 'blue', '2', 'E', 300)
    expect(blocked.ok).toBe(false)
  })

  it('blocks timeouts in ROUND mode', () => {
    const r = stamp(live(demoMatch()), 'white', '1', 'TO')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/ROUND/)
  })

  it('allows two timeouts in FINALS for the possession team only', () => {
    let m = live({ ...demoMatch(), mode: 'FINALS', possession: 'white' })
    const first = applyEvent(m, { side: 'white', cap: '', code: 'TO', timeRemainingSec: 400 })
    expect(first.ok).toBe(true)
    m = first.match
    m = { ...m, possession: 'white' }
    const second = applyEvent(m, { side: 'white', cap: '', code: 'TO', timeRemainingSec: 200 })
    expect(second.ok).toBe(true)
    m = { ...second.match, possession: 'white' }
    const third = applyEvent(m, { side: 'white', cap: '', code: 'TO', timeRemainingSec: 100 })
    expect(third.ok).toBe(false)
    m = { ...second.match, possession: 'blue' }
    const steal = applyEvent(m, { side: 'white', cap: '', code: 'TO', timeRemainingSec: 90 })
    expect(steal.ok).toBe(false)
    expect(steal.error).toMatch(/possession/)
  })

  it('undo and delete fully recalc player stats and score', () => {
    let m = live(demoMatch())
    m = stamp(m, 'white', '9', 'G').match
    m = stamp(m, 'blue', '5', 'E', 400).match
    m = stamp(m, 'white', '9', 'EG', 390).match
    expect(runningScoreFromEvents(m.events)).toEqual({ white: 2, blue: 0 })
    m = undoLast(m)
    expect(runningScoreFromEvents(m.events)).toEqual({ white: 1, blue: 0 })
    const lily = m.white.players.find((p) => p.cap === '9')!
    expect(lily.goalsQ1).toBe(1)
    const eId = m.events[0].id
    m = deleteEvent(m, eId)
    expect(m.events.length).toBe(1)
    expect(reconcile(rebuild(m)).ok).toBe(true)
  })

  it('custom quarter and shot-clock times from setup', () => {
    let m = live({
      ...demoMatch(),
      periodMinutes: 6,
      shotClockSec: 28,
      shotClockShortSec: 18,
      shotClockRemainingSec: 28,
      clockRemainingSec: 6 * 60,
    })
    expect(m.periodMinutes).toBe(6)
    expect(m.shotClockSec).toBe(28)
    const r = stamp(m, 'white', '4', 'G')
    expect(r.ok).toBe(true)
    expect(r.match.shotClockRemainingSec).toBe(28)
  })

  it('end of quarter reconcile matches log and player totals', () => {
    let m = live(demoMatch())
    m = stamp(m, 'white', '4', 'G').match
    m = stamp(m, 'white', '4', 'G', 400).match
    m = stamp(m, 'blue', '10', 'G', 350).match
    const { check } = endQuarter(m)
    expect(check.ok).toBe(true)
    expect(check.logGoals).toEqual({ white: 2, blue: 1 })
    expect(check.playerGoals).toEqual({ white: 2, blue: 1 })
  })

  it('swim-up sets possession and does not change the score', () => {
    let m = live(demoMatch())
    const r = stamp(m, 'blue', '10', 'SU')
    expect(r.ok).toBe(true)
    expect(r.match.possession).toBe('blue')
    expect(r.match.shotClockRemainingSec).toBe(r.match.shotClockSec)
    expect(runningScoreFromEvents(r.match.events)).toEqual({ white: 0, blue: 0 })
    expect(r.match.events[0].code).toBe('SU')
  })

  it("shot clock ticks independently of the game clock", () => {
    let m = live({ ...demoMatch(), clockRunning: true, shotClockRunning: true, clockRemainingSec: 60, shotClockRemainingSec: 28 })
    m = tickClock(m, 5)
    expect(m.clockRemainingSec).toBe(55)
    expect(m.shotClockRemainingSec).toBe(23)
    m = { ...m, clockRunning: false }
    m = tickClock(m, 3)
    expect(m.clockRemainingSec).toBe(55)
    expect(m.shotClockRemainingSec).toBe(20)
    m = { ...m, shotClockRunning: false, clockRunning: true }
    m = tickClock(m, 2)
    expect(m.clockRemainingSec).toBe(53)
    expect(m.shotClockRemainingSec).toBe(20)
    m = { ...m, shotClockRunning: true }
    m = tickClock(m, 20)
    expect(m.shotClockRemainingSec).toBe(0)
    expect(m.shotClockRunning).toBe(false)
    expect(m.clockSignal?.kind).toBe('shot')
  })

  it('auto-advances to the next quarter when the game clock runs out', () => {
    let m = live({ ...demoMatch(), currentPeriod: 1, clockRunning: true, shotClockRunning: true, clockRemainingSec: 1, shotClockRemainingSec: 10, quarterBreakSec: 0 })
    m = tickClock(m, 1)
    expect(m.currentPeriod).toBe(2)
    expect(m.clockRunning).toBe(false)
    expect(m.shotClockRunning).toBe(false)
    expect(m.clockRemainingSec).toBe(quarterLengthSec(m))
    expect(m.ended).toBe(false)
    expect(m.clockSignal?.kind).toBe('period')
  })

  it('ends a round game when Q4 clock runs out', () => {
    let m = live({ ...demoMatch(), currentPeriod: 4, mode: 'ROUND', clockRunning: true, clockRemainingSec: 0.5 })
    m = tickClock(m, 1)
    expect(m.ended).toBe(true)
    expect(m.currentPeriod).toBe(4)
    expect(m.clockRunning).toBe(false)
  })

  it('Q1 clock expiry with default quarter break starts a quarter break, still period 1', () => {
    let m = live({
      ...demoMatch(),
      currentPeriod: 1,
      clockRunning: true,
      shotClockRunning: true,
      clockRemainingSec: 1,
      shotClockRemainingSec: 10,
      quarterBreakSec: 60,
    })
    m = tickClock(m, 1)
    expect(m.breakKind).toBe('quarter')
    expect(m.breakRemainingSec).toBe(60)
    expect(m.breakRunning).toBe(true)
    expect(m.currentPeriod).toBe(1)
    expect(m.ended).toBe(false)
    expect(m.clockRunning).toBe(false)
    expect(m.clockRemainingSec).toBe(0)
  })

  it('ticking a quarter break to 0 advances to period 2 with clocks stopped', () => {
    let m = live({
      ...demoMatch(),
      currentPeriod: 1,
      clockRemainingSec: 0,
      clockRunning: false,
      breakKind: 'quarter',
      breakRemainingSec: 60,
      breakRunning: true,
      quarterBreakSec: 60,
    })
    m = tickClock(m, 60)
    expect(m.currentPeriod).toBe(2)
    expect(m.clockRemainingSec).toBe(quarterLengthSec(m))
    expect(m.clockRunning).toBe(false)
    expect(m.breakKind).toBeNull()
    expect(m.breakRunning).toBe(false)
    expect(m.breakRemainingSec).toBe(0)
    expect(m.ended).toBe(false)
  })

  it('Q2 expiry starts a half-time break of 120s', () => {
    let m = live({
      ...demoMatch(),
      currentPeriod: 2,
      clockRunning: true,
      clockRemainingSec: 1,
      halfTimeBreakSec: 120,
    })
    m = tickClock(m, 1)
    expect(m.breakKind).toBe('half')
    expect(m.breakRemainingSec).toBe(120)
    expect(m.breakRunning).toBe(true)
    expect(m.currentPeriod).toBe(2)
    expect(m.ended).toBe(false)
  })

  it('does not tick game or shot clocks during a break', () => {
    let m = live({
      ...demoMatch(),
      currentPeriod: 1,
      clockRemainingSec: 0,
      clockRunning: true,
      shotClockRunning: true,
      shotClockRemainingSec: 18,
      breakKind: 'quarter',
      breakRemainingSec: 20,
      breakRunning: true,
    })
    m = tickClock(m, 5)
    expect(m.breakRemainingSec).toBe(15)
    expect(m.clockRemainingSec).toBe(0)
    expect(m.shotClockRemainingSec).toBe(18)
    expect(m.currentPeriod).toBe(1)
  })

  it('Q4 FINALS clock expiry skips the break and goes to PSO', () => {
    let m = live({
      ...demoMatch(),
      currentPeriod: 4,
      mode: 'FINALS',
      clockRunning: true,
      clockRemainingSec: 1,
      quarterBreakSec: 60,
    })
    m = tickClock(m, 1)
    expect(m.currentPeriod).toBe('PSO')
    expect(m.ended).toBe(false)
    expect(m.breakKind).toBeNull()
    expect(m.breakRunning).toBe(false)
  })

  it('End quarter during a break skips remaining time and advances', () => {
    let m = live({
      ...demoMatch(),
      currentPeriod: 1,
      clockRemainingSec: 0,
      breakKind: 'quarter',
      breakRemainingSec: 40,
      breakRunning: true,
      quarterBreakSec: 60,
    })
    m = endQuarter(m).match
    expect(m.currentPeriod).toBe(2)
    expect(m.breakKind).toBeNull()
    expect(m.breakRunning).toBe(false)
    expect(m.clockRunning).toBe(false)
    expect(m.clockRemainingSec).toBe(quarterLengthSec(m))
  })
})

describe('strike / unstrike', () => {
  it('strikeOff then unstrike restores onCard/present/struckOff', () => {
    let m = live(demoMatch())
    const p = m.white.players.find((x) => x.cap === '4')!
    m = strikeOff(m, 'white', p.id)
    const struck = m.white.players.find((x) => x.id === p.id)!
    expect(struck.struckOff).toBe(true)
    expect(struck.present).toBe(false)
    expect(struck.onCard).toBe(false)
    expect(m.lastStrike).toEqual({ side: 'white', playerId: p.id })
    const r = unstrike(m, 'white', p.id)
    expect(r.ok).toBe(true)
    const restored = r.match.white.players.find((x) => x.id === p.id)!
    expect(restored.struckOff).toBe(false)
    expect(restored.present).toBe(true)
    expect(restored.onCard).toBe(true)
    expect(r.match.lastStrike).toBeNull()
  })

  it('undoLast after strikeOff restores the player without dropping events', () => {
    let m = live(demoMatch())
    m = stamp(m, 'white', '9', 'G').match
    const p = m.white.players.find((x) => x.cap === '4')!
    m = strikeOff(m, 'white', p.id)
    expect(m.events.length).toBe(1)
    expect(m.lastStrike).toEqual({ side: 'white', playerId: p.id })
    m = undoLast(m)
    const restored = m.white.players.find((x) => x.id === p.id)!
    expect(restored.struckOff).toBe(false)
    expect(restored.onCard).toBe(true)
    expect(restored.present).toBe(true)
    expect(m.events.length).toBe(1)
    expect(m.lastStrike).toBeNull()
  })

  it('applyEvent after strike, undoLast undoes the event not the strike', () => {
    let m = live(demoMatch())
    const p = m.white.players.find((x) => x.cap === '4')!
    m = strikeOff(m, 'white', p.id)
    m = stamp(m, 'white', '9', 'G').match
    expect(m.lastStrike).toBeNull()
    expect(m.white.players.find((x) => x.id === p.id)!.struckOff).toBe(true)
    m = undoLast(m)
    expect(m.events.length).toBe(0)
    expect(m.white.players.find((x) => x.id === p.id)!.struckOff).toBe(true)
    const r = unstrike(m, 'white', p.id)
    expect(r.ok).toBe(true)
    expect(r.match.white.players.find((x) => x.id === p.id)!.struckOff).toBe(false)
  })

  it('unstrike blocked when card already has 10 others', () => {
    let m = live(demoMatch())
    const p = m.white.players.find((x) => x.cap === '1')!
    m = strikeOff(m, 'white', p.id)
    const bench = m.white.players.find((x) => x.cap === '11')!
    const rOn = setOnCard(m, 'white', bench.id, true)
    expect(rOn.ok).toBe(true)
    m = rOn.match
    const r = unstrike(m, 'white', p.id)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Max 10/)
    expect(r.match.white.players.find((x) => x.id === p.id)!.struckOff).toBe(true)
  })
})
