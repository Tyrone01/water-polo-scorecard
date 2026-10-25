/**
 * AJWP Friday night comp button. Competitions and games are matched by id only.
 * Real public pages saved 23 Oct 2026. This list is separate from the FNC pools.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AJWP_FRIDAY_RULE, compDecision } from './compIds'
import { fridayOnOrAfter } from './dates'
import { AJWP_GAMES_HUB, syncAjwpFridayNight } from './sync'

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

function stub() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const target = new URL(String(input), 'https://scorecard.test').searchParams.get('url') || ''
      const html = AJWP_PAGES[target]
      if (html === undefined) {
        return new Response(JSON.stringify({ error: 'not in fixtures: ' + target }), { status: 502 })
      }
      return new Response(JSON.stringify({ html, status: 200 }), { status: 200 })
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AJWP Friday comp ids', () => {
  it('loads 28040 and 28041 for the Friday button and still loads every AJWP comp in Setup', () => {
    expect(compDecision('AJWP', '28040', AJWP_FRIDAY_RULE)).toBe('load')
    expect(compDecision('AJWP', '28041', AJWP_FRIDAY_RULE)).toBe('load')
    expect(compDecision('AJWP', '28999', AJWP_FRIDAY_RULE)).toBe('not-listed')
    expect(compDecision('AJWP', '28999')).toBe('load')
    expect(compDecision('FNC', '28040')).toBe('not-listed')
  })

  it('picks the Friday on or after today', () => {
    expect(fridayOnOrAfter('2026-10-23')).toBe('2026-10-23')
    expect(fridayOnOrAfter('2026-10-25')).toBe('2026-10-30')
  })
})

describe('AJWP Friday games', () => {
  it('lists that Friday by game id and team id, not by mixing into FNC', async () => {
    stub()
    const friday = await syncAjwpFridayNight('2026-10-23')
    expect(friday.error).toBeUndefined()
    expect(friday.eventName).toBe('AJWP Friday night comp')
    expect(friday.games.length).toBeGreaterThan(0)
    expect(friday.games.every((g) => g.date === '2026-10-23')).toBe(true)
    expect(friday.games.every((g) => g.competitionId === '28040' || g.competitionId === '28041')).toBe(true)
    expect(friday.games.every((g) => g.source === 'AJWP')).toBe(true)
    const g = friday.games.find((x) => x.id === '2706242')
    expect(g).toMatchObject({ competitionId: '28040', homeTeamId: '451869', awayTeamId: '451871' })
    expect(friday.warnings.join(' ')).not.toMatch(/RevSport/i)
    expect(friday.eventName).not.toMatch(/RevSport/i)
  })

  it('on a Sunday shows the coming Friday, not last Friday', async () => {
    stub()
    const snap = await syncAjwpFridayNight('2026-10-25')
    expect(snap.error).toBeUndefined()
    expect(snap.games.length).toBeGreaterThan(0)
    expect(snap.games.every((g) => g.date === '2026-10-30')).toBe(true)
    expect(snap.games.some((g) => g.id === '2706242')).toBe(false)
  })
})
