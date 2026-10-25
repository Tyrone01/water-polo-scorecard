import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyEvent, deleteEvent, signalSiren, tickClock } from './engine'
import { demoMatch } from './demo'
import {
  boardIdForMatch,
  boardUrl,
  buildBoardSnapshot,
  clearBoard,
  coerceBoardSnapshot,
  publishBoard,
  publicBoardUrl,
  resetBoardPublishState,
} from './boardPublish'

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
    expect(boardUrl('https://board.fncwp.com', 'alstonville')).toBe('https://board.fncwp.com/alstonville')
    expect(publicBoardUrl('ballina')).toBe('https://board.fncwp.com/ballina')
    expect(boardIdForMatch({ venue: 'Alstonville Pool' })).toBe('alstonville')
    expect(boardIdForMatch({ venue: 'Alstonville Aquatic Centre' })).toBe('alstonville')
    expect(boardIdForMatch({ venue: 'alstonville-aquatic' })).toBe('alstonville')
    expect(boardIdForMatch({ venue: 'Ballina Indoor Pool' })).toBe('ballina')
    expect(boardIdForMatch({ venue: 'Lismore Memorial Baths' })).toBe('lismore')
    expect(boardIdForMatch({ venue: 'Mullumbimby Pool' })).toBe('mullumbimby')
    expect(boardIdForMatch({ venue: 'Somewhere Else' })).toBe('somewhere-else')
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

describe('boardIdForMatch FNC venues', () => {
  it('maps long FNC venue slugs and names to fixed TV ids', () => {
    expect(boardIdForMatch({ venue: 'Alstonville Aquatic' })).toBe('alstonville')
    expect(boardIdForMatch({ venue: 'ballina-indoor' })).toBe('ballina')
    expect(boardIdForMatch({ venue: 'LISMORE' })).toBe('lismore')
    expect(boardIdForMatch({ venue: 'Mullumbimby Leisure Centre' })).toBe('mullumbimby')
  })
})

describe('boardVenueId override', () => {
  it('uses boardVenueId over a mismatched venue name', () => {
    expect(boardIdForMatch({ venue: 'Somewhere else', boardVenueId: 'ballina' })).toBe('ballina')
    expect(boardIdForMatch({ venue: 'Alstonville Aquatic Centre', boardVenueId: 'lismore' })).toBe('lismore')
    expect(boardIdForMatch({ venue: 'Random Hall', boardVenueId: 'mullumbimby' })).toBe('mullumbimby')
  })

  it('maps a long boardVenueId slug to the fixed FNC TV id', () => {
    expect(boardIdForMatch({ venue: 'x', boardVenueId: 'alstonville-aquatic' })).toBe('alstonville')
  })
})

describe('board snapshot meta', () => {
  it('includes grade, stage, eventName, venueLabel from the match', () => {
    const m = {
      ...demoMatch(),
      grade: '16&U Girls',
      stage: 'Round 3',
      eventName: 'FNC Juniors',
      venue: 'Alstonville Aquatic Centre',
      boardVenueId: 'alstonville',
    }
    const snap = buildBoardSnapshot(m)
    expect(snap.grade).toBe('16&U Girls')
    expect(snap.stage).toBe('Round 3')
    expect(snap.eventName).toBe('FNC Juniors')
    expect(snap.venueLabel).toBe('Alstonville Aquatic Centre')
    expect(boardIdForMatch(m)).toBe('alstonville')
  })
})

describe('spectator snapshot guard', () => {
  it('keeps a real snapshot and fills in a partial one instead of throwing', () => {
    let m = { ...demoMatch(), started: true }
    m = applyEvent(m, { side: 'white', cap: '4', code: 'G', timeRemainingSec: 400 }).match
    const snap = buildBoardSnapshot(m, 50)
    expect(coerceBoardSnapshot(snap)).toEqual(snap)
    const partial = coerceBoardSnapshot({ updatedAt: 5, whiteName: 'A' })
    expect(partial?.last).toEqual([])
    expect(partial?.whiteFouls).toEqual([])
    expect(partial?.white).toBe(0)
    expect(coerceBoardSnapshot(null)).toBeNull()
    expect(coerceBoardSnapshot({ cleared: true, updatedAt: 9 })?.cleared).toBe(true)
  })

  it('drops a deleted goal from the score and the event rail, and leaves the clock running', () => {
    let m = {
      ...demoMatch(),
      started: true,
      clockRunning: true,
      clockRemainingSec: 90,
      shotClockRunning: true,
      shotClockRemainingSec: 18,
    }
    m = applyEvent(m, { side: 'white', cap: '4', code: 'G', timeRemainingSec: 80 }).match
    m = { ...m, clockRunning: true, clockRemainingSec: 90, shotClockRunning: true, shotClockRemainingSec: 18 }
    expect(buildBoardSnapshot(m).white).toBe(1)
    m = deleteEvent(m, m.events[0].id)
    const snap = buildBoardSnapshot(m)
    expect(snap.white).toBe(0)
    expect(snap.blue).toBe(0)
    expect(snap.last.some((e) => e.code === 'G')).toBe(false)
    expect(snap.clockRunning).toBe(true)
    expect(snap.clockRemainingSec).toBe(90)
  })
})

describe('live board write rate', () => {
  afterEach(() => {
    resetBoardPublishState()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('posts once at the start, then at most once a second after a siren', async () => {
    vi.useFakeTimers()
    resetBoardPublishState()
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    let m = {
      ...demoMatch(),
      started: true,
      clockRunning: true,
      shotClockRunning: true,
      clockRemainingSec: 120,
      shotClockRemainingSec: 20,
    }
    publishBoard(m)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    m = signalSiren(m)
    publishBoard(m)
    for (let i = 0; i < 8; i++) {
      m = tickClock(m, 0.25)
      publishBoard(m)
    }
    await vi.advanceTimersByTimeAsync(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3)
    const sent = JSON.parse(String((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body)) as { clockSignal?: { id?: string } }
    expect(sent.clockSignal?.id).toBe(m.clockSignal?.id)
  })

  it('sends a goal on the next write, not a burst of clock posts', async () => {
    vi.useFakeTimers()
    resetBoardPublishState()
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    let m = { ...demoMatch(), started: true, clockRunning: true, clockRemainingSec: 200 }
    publishBoard(m)
    await vi.advanceTimersByTimeAsync(0)
    m = applyEvent(m, { side: 'white', cap: '4', code: 'G', timeRemainingSec: 180 }).match
    publishBoard(m)
    await vi.advanceTimersByTimeAsync(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    const sent = JSON.parse(String((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body)) as {
      white: number
      last: { code: string }[]
    }
    expect(sent.white).toBe(1)
    expect(sent.last.some((e) => e.code === 'G')).toBe(true)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3)
  })

  it('sends the board write token on publish and clear when the build has one', async () => {
    vi.stubEnv('VITE_BOARD_WRITE_TOKEN', 'preview-token')
    vi.useFakeTimers()
    resetBoardPublishState()
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const m = { ...demoMatch(), started: true }
    publishBoard(m)
    await vi.advanceTimersByTimeAsync(0)
    const post = fetchMock.mock.calls[0]
    expect(String(post?.[0])).toBe('https://board.fncwp.com/api/board/alstonville')
    const postHeaders = new Headers((post?.[1] as RequestInit).headers)
    expect(postHeaders.get('Authorization')).toBe('Bearer preview-token')
    expect(postHeaders.get('Content-Type')).toBe('application/json')

    clearBoard('alstonville')
    const del = fetchMock.mock.calls.at(-1)
    expect(del?.[1]).toMatchObject({ method: 'DELETE' })
    const delHeaders = new Headers((del?.[1] as RequestInit).headers)
    expect(delHeaders.get('Authorization')).toBe('Bearer preview-token')
  })

  it('leaves the write header off when the build has no token', async () => {
    vi.useFakeTimers()
    resetBoardPublishState()
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    publishBoard({ ...demoMatch(), started: true })
    await vi.advanceTimersByTimeAsync(0)
    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers)
    expect(headers.get('Authorization')).toBeNull()
  })
})
