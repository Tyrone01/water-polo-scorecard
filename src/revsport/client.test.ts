import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRevSport } from './client'

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures')
const listing = readFileSync(path.join(fixtures, 'ajwp-games-listing.html'), 'utf8')
const round1 = readFileSync(path.join(fixtures, 'ajwp-games-round1.html'), 'utf8')

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('fetchRevSport listing URL', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads games from the relevant round when the grade page has no cards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const href = String(input)
        const target = new URL(href, 'https://scorecard.local').searchParams.get('url') || ''
        if (/\/round\/1\/?$/.test(target)) return jsonResponse({ html: round1, status: 200 })
        return jsonResponse({ html: listing, status: 200 })
      }),
    )
    const result = await fetchRevSport('https://www.revolutionise.com.au/ajwp/games/24352/3690')
    expect(result.fetchError).toBeUndefined()
    expect(result.source).toBe('fixtures')
    expect(result.games?.length).toBe(2)
    expect(result.games?.[0].detailsUrl).toMatch(/\/game\/2306256/)
  })

  it('does not fetch again when the first page already has games', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ html: round1, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchRevSport('https://www.revolutionise.com.au/ajwp/games/24352/3690')
    expect(result.games?.length).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})


describe('fetchRevSport game hydrate from team-stats', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads Social players from team-stats URLs on the match page', async () => {
    const game = readFileSync(path.join(fixtures, 'fnc-game-2659571-socials.html'), 'utf8')
    const mems = readFileSync(path.join(fixtures, 'fnc-team-stats-social-mems.html'), 'utf8')
    const ladies = readFileSync(path.join(fixtures, 'fnc-team-stats-social-ladies1.html'), 'utf8')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const href = String(input)
        const target = new URL(href, 'https://scorecard.local').searchParams.get('url') || ''
        if (/\/game\/2659571/.test(target)) return jsonResponse({ html: game, status: 200 })
        if (/team-stats\/27655\/443855/.test(target)) return jsonResponse({ html: mems, status: 200 })
        if (/team-stats\/27655\/443852/.test(target)) return jsonResponse({ html: ladies, status: 200 })
        return jsonResponse({ error: 'unexpected ' + target }, 500)
      }),
    )
    const result = await fetchRevSport('https://www.fncwaterpolo.org.au/game/2659571')
    expect(result.fetchError).toBeUndefined()
    expect(result.teamPageUrls?.[0]).toMatch(/team-stats\/27655\/443855/)
    expect(result.teamPageUrls?.[1]).toMatch(/team-stats\/27655\/443852/)
    expect(result.teams[0].players.length).toBe(7)
    expect(result.teams[1].players.length).toBe(6)
    expect(result.teams[0].name).toMatch(/Social mems/i)
    expect(result.teams[1].name).toMatch(/Social ladies 1/i)
  })
})
