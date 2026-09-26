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
