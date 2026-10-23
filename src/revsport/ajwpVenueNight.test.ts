/**
 * AJWP Friday nights (RevSport 28040 A grade, 28041 B/C Grade) on the Alstonville pool list.
 * Real public pages saved 23 Oct 2026. Competitions and games are matched by RevSport id only.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AJWP_VENUE_NIGHT_RULE, compDecision } from './compIds'
import {
  AJWP_GAMES_HUB,
  FNC_GAMES_HUB,
  liveEventTitle,
  mergeVenueNightSnapshots,
  syncFncLive,
  syncVenueNightLive,
  type LiveGame,
  type SyncSnapshot,
} from './sync'

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures')
const read = (f: string) => readFileSync(path.join(fixtures, f), 'utf8')

const AJWP_PAGES: Record<string, string> = {
  [AJWP_GAMES_HUB]: read('ajwp-2026-games-hub.html'),
  [`${AJWP_GAMES_HUB}/28040/3690`]: read('ajwp-28040-3690-round1.html'),
  [`${AJWP_GAMES_HUB}/28040/3690/round/1`]: read('ajwp-28040-3690-round1.html'),
  [`${AJWP_GAMES_HUB}/28040/3690/round/2`]: read('ajwp-28040-3690-round2.html'),
  [`${AJWP_GAMES_HUB}/28041/3691`]: read('ajwp-28041-3691-round1.html'),
  [`${AJWP_GAMES_HUB}/28041/3691/round/1`]: read('ajwp-28041-3691-round1.html'),
  [`${AJWP_GAMES_HUB}/28041/3691/round/2`]: read('ajwp-28041-3691-round2.html'),
}
const FNC_PAGES: Record<string, string> = { [FNC_GAMES_HUB]: read('fnc-27800-games-hub.html') }
const listing3790 = read('fnc-27800-3790-listing.html')
const round2 = read('fnc-27800-3790-round2.html')

function stub(fail: (t: string) => boolean = () => false) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const target = new URL(String(input), 'https://scorecard.test').searchParams.get('url') || ''
      calls.push(target)
      let html: string | undefined = AJWP_PAGES[target] ?? FNC_PAGES[target]
      if (html === undefined && /\/games\/27800\/\d+\/round\/\d+$/.test(target)) html = round2
      if (html === undefined && /\/games\/27800\/\d+$/.test(target)) html = listing3790
      if (html === undefined || fail(target)) {
        return new Response(JSON.stringify({ error: 'not in fixtures: ' + target }), { status: 502 })
      }
      return new Response(JSON.stringify({ html, status: 200 }), { status: 200 })
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('AJWP venue-night allow-list (by id only)', () => {
  it('loads 28040 and 28041 and holds back any other AJWP competition', () => {
    expect(compDecision('AJWP', '28040', AJWP_VENUE_NIGHT_RULE)).toBe('load')
    expect(compDecision('AJWP', '28041', AJWP_VENUE_NIGHT_RULE)).toBe('load')
    expect(compDecision('AJWP', '28999', AJWP_VENUE_NIGHT_RULE)).toBe('not-listed')
    // Manual AJWP imports in Setup keep loading everything.
    expect(compDecision('AJWP', '28999')).toBe('load')
  })
})

describe('AJWP Friday games at Alstonville', () => {
  it('lists tonight (Fri 23 Oct) and next Friday by RevSport game and team id', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-23T12:00:00+11:00'))
    stub()
    const snap = await syncFncLive(AJWP_GAMES_HUB, 'AJWP', AJWP_VENUE_NIGHT_RULE)
    expect(snap.error).toBeUndefined()
    expect([...new Set(snap.competitions.map((c) => c.competitionId))]).toEqual(['28040', '28041'])
    const tonight = snap.games.filter((g) => g.date === '2026-10-23')
    expect(tonight.map((g) => g.time).sort()).toEqual(['17:00', '17:40', '18:20', '19:00'])
    expect(snap.games.some((g) => g.date === '2026-10-30')).toBe(true)
    const g = snap.games.find((x) => x.id === '2706242')!
    expect(g).toMatchObject({ competitionId: '28040', homeTeamId: '451869', awayTeamId: '451871' })
    expect(snap.venues.map((v) => v.id)).toEqual(['alstonville'])
  })

  it('merges AJWP into the FNC Alstonville list, de-duplicated by game id', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-23T12:00:00+11:00'))
    stub()
    const snap = await syncVenueNightLive()
    expect(snap.error).toBeUndefined()
    const ids = snap.games.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    const ajwp = snap.games.filter((g) => g.source === 'AJWP')
    expect(ajwp.length).toBe(8)
    expect(ajwp.every((g) => g.competitionId === '28040' || g.competitionId === '28041')).toBe(true)
    expect(snap.games.filter((g) => g.source === 'FNC').every((g) => g.competitionId === '27800')).toBe(true)
    const alstonville = snap.venues.find((v) => v.id === 'alstonville')!
    expect(alstonville.games.filter((g) => g.source === 'AJWP' && g.date === '2026-10-23')).toHaveLength(4)
    expect(snap.eventName).toMatch(/\+ AJWP$/)
  })

  it('keeps the FNC list when AJWP cannot be reached', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-23T12:00:00+11:00'))
    stub((t) => t.startsWith(AJWP_GAMES_HUB))
    const snap = await syncVenueNightLive()
    expect(snap.error).toBeUndefined()
    expect(snap.games.length).toBeGreaterThan(0)
    expect(snap.games.every((g) => g.source === 'FNC')).toBe(true)
    expect(snap.warnings.join(' ')).toMatch(/^AJWP: |AJWP: /)
  })
})

describe('AJWP labels', () => {
  it('uses AJWP on the pool list and keeps the Friday button title', () => {
    expect(liveEventTitle({ source: 'AJWP', listedOn: 'venue-night', grade: 'A Grade' })).toBe('AJWP · A Grade')
    expect(liveEventTitle({ source: 'AJWP', listedOn: 'friday', grade: 'A Grade' })).toBe('AJWP Friday night · A Grade')
    expect(liveEventTitle({ source: 'FNC', grade: 'WOMENS', competition: 'FNC' })).toBe('FNC · WOMENS')
  })
})

describe('mergeVenueNightSnapshots', () => {
  const base = (games: LiveGame[], extra: Partial<SyncSnapshot> = {}): SyncSnapshot => ({
    hubUrl: 'x', fetchedAt: 'now', eventName: 'FNC', competitions: [], games, venues: [], heldBack: [], warnings: [], ...extra,
  })
  const game = (id: string, date: string, venueName = 'Alstonville Pool'): LiveGame => ({
    id, home: 'A', away: 'B', date, time: '18:00', venueName, detailsUrl: `https://x/game/${id}`,
  })
  it('a game id listed by both sources shows once', () => {
    const snap = mergeVenueNightSnapshots(
      [
        { source: 'FNC', snap: base([game('1', '2026-10-26', 'Alstonville Aquatic Centre')]) },
        { source: 'AJWP', snap: base([game('1', '2026-10-26'), game('2', '2026-10-23')]) },
      ],
      '2026-10-23',
    )
    expect(snap.games.map((g) => `${g.source}:${g.id}`)).toEqual(['FNC:1', 'AJWP:2'])
    expect(snap.venues).toHaveLength(1)
    expect(snap.venues[0]).toMatchObject({ id: 'alstonville', name: 'Alstonville Aquatic Centre' })
  })
  it('errors only when every source fails', () => {
    const snap = mergeVenueNightSnapshots([
      { source: 'FNC', snap: base([], { error: 'down' }) },
      { source: 'AJWP', snap: base([], { error: 'down' }) },
    ])
    expect(snap.error).toMatch(/FNC: down AJWP: down/)
  })
})
