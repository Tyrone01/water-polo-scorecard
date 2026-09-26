import { describe, expect, it } from 'vitest'
import { applyEvent } from './engine'
import { demoMatch } from './demo'
import { boardIdForMatch, boardUrl, buildBoardSnapshot } from './boardPublish'

describe('board snapshot', () => {
  it('maps a demo match score, period, and last events including SU', () => {
    let m = { ...demoMatch(), started: true }
    m = applyEvent(m, { side: 'white', cap: '4', code: 'G', timeRemainingSec: 7 * 60 + 30 }).match
    m = applyEvent(m, { side: 'blue', cap: '10', code: 'SU', timeRemainingSec: 7 * 60 }).match
    const snap = buildBoardSnapshot(m, 1_700_000_000_000)
    expect(snap.v).toBe(1)
    expect(snap.white).toBe(1)
    expect(snap.blue).toBe(0)
    expect(snap.period).toBe(1)
    expect(snap.whiteName).toMatch(/Alstonville/)
    expect(snap.blueName).toMatch(/Ballina/)
    expect(snap.last.some((e) => e.code === 'G' && e.score === '1–0')).toBe(true)
    expect(snap.last.every((e) => ['G', 'EG', 'PG', 'E', 'P', 'S'].includes(e.code))).toBe(true)
    expect(snap.last.some((e) => e.code === 'SU')).toBe(false)
    expect(boardUrl('https://example.com/')).toBe('https://example.com/board/live')
    expect(boardUrl('https://example.com/', 'alstonville')).toBe('https://example.com/board/alstonville')
    expect(boardIdForMatch({ venue: 'Alstonville Pool' })).toBe('alstonville')
    expect(snap.breakKind).toBeNull()
    expect(snap.breakRunning).toBe(false)
    expect(snap.breakRemainingSec).toBe(0)
  })

  it('includes BREAK/HALF fields so the spectator clock can show remaining break time', () => {
    const m = {
      ...demoMatch(),
      started: true,
      currentPeriod: 1,
      clockRemainingSec: 0,
      breakKind: 'quarter' as const,
      breakRemainingSec: 60,
      breakRunning: true,
    }
    const snap = buildBoardSnapshot(m, 1_700_000_000_000)
    expect(snap.breakKind).toBe('quarter')
    expect(snap.breakRemainingSec).toBe(60)
    expect(snap.breakRunning).toBe(true)
    expect(snap.clockRemainingSec).toBe(0)
    expect(snap.period).toBe(1)
  })

  it('puts two personal fouls on the same cap in last + foul summary, not out', () => {
    let m = { ...demoMatch(), started: true }
    m = applyEvent(m, { side: 'white', cap: '4', code: 'E', timeRemainingSec: 7 * 60 + 20 }).match
    m = applyEvent(m, { side: 'white', cap: '4', code: 'E', timeRemainingSec: 6 * 60 }).match
    const snap = buildBoardSnapshot(m)
    expect(snap.last.filter((e) => e.code === 'E' && e.cap === '4')).toHaveLength(2)
    expect(snap.last.some((e) => e.code === 'SU')).toBe(false)
    const row = snap.whiteFouls.find((f) => f.cap === '4')
    expect(row).toEqual({ cap: '4', pf: 2, out: false })
    expect(snap.blueFouls).toEqual([])
  })

  it('marks a third personal foul as out', () => {
    let m = { ...demoMatch(), started: true }
    m = applyEvent(m, { side: 'blue', cap: '7', code: 'E', timeRemainingSec: 7 * 60 + 10 }).match
    m = applyEvent(m, { side: 'blue', cap: '7', code: 'P', timeRemainingSec: 6 * 60 + 40 }).match
    m = applyEvent(m, { side: 'blue', cap: '7', code: 'E', timeRemainingSec: 5 * 60 }).match
    const snap = buildBoardSnapshot(m)
    expect(snap.last.some((e) => e.code === 'E' && e.cap === '7')).toBe(true)
    expect(snap.last.some((e) => e.code === 'P' && e.cap === '7')).toBe(true)
    const row = snap.blueFouls.find((f) => f.cap === '7')
    expect(row).toEqual({ cap: '7', pf: 3, out: true })
  })

  it('treats S (game exclusion) as out for the remainder', () => {
    let m = { ...demoMatch(), started: true }
    m = applyEvent(m, { side: 'white', cap: '8', code: 'S', timeRemainingSec: 4 * 60 }).match
    const snap = buildBoardSnapshot(m)
    expect(snap.last.some((e) => e.code === 'S' && e.cap === '8' && e.side === 'white')).toBe(true)
    const row = snap.whiteFouls.find((f) => f.cap === '8')
    expect(row?.out).toBe(true)
    expect(row?.pf).toBe(0)
  })

  it('keeps goals in last and still excludes SU and TO', () => {
    let m = { ...demoMatch(), started: true, mode: 'FINALS' as const, possession: 'white' as const }
    m = applyEvent(m, { side: 'white', cap: '5', code: 'G', timeRemainingSec: 7 * 60 }).match
    m = applyEvent(m, { side: 'blue', cap: '3', code: 'EG', timeRemainingSec: 6 * 60 + 30 }).match
    m = applyEvent(m, { side: 'white', cap: '1', code: 'TO', timeRemainingSec: 5 * 60 }).match
    m = applyEvent(m, { side: 'blue', cap: '9', code: 'SU', timeRemainingSec: 8 * 60 }).match
    const snap = buildBoardSnapshot(m)
    expect(snap.last.some((e) => e.code === 'G')).toBe(true)
    expect(snap.last.some((e) => e.code === 'EG')).toBe(true)
    expect(snap.last.some((e) => e.code === 'SU')).toBe(false)
    expect(snap.last.some((e) => e.code === 'TO')).toBe(false)
    expect(snap.white).toBe(1)
    expect(snap.blue).toBe(1)
  })

  it('includes both rosters and started:false for an unstarted match', () => {
    const m = demoMatch()
    expect(m.started).toBe(false)
    const snap = buildBoardSnapshot(m)
    expect(snap.started).toBe(false)
    expect(snap.whiteRoster).toHaveLength(10)
    expect(snap.blueRoster).toHaveLength(10)
    expect(snap.whiteRoster[0]).toEqual({ cap: '1', name: 'Mia Thompson', fillIn: false })
    expect(snap.whiteRoster.some((p) => p.cap === '11')).toBe(false)
    expect(snap.v).toBe(1)
  })

  it('started match still has rosters in the payload while last uses events', () => {
    let m = { ...demoMatch(), started: true }
    m = applyEvent(m, { side: 'white', cap: '4', code: 'G', timeRemainingSec: 7 * 60 }).match
    const snap = buildBoardSnapshot(m)
    expect(snap.started).toBe(true)
    expect(snap.whiteRoster).toHaveLength(10)
    expect(snap.blueRoster).toHaveLength(10)
    expect(snap.last.some((e) => e.code === 'G' && e.cap === '4')).toBe(true)
  })
})
