/**
 * FNC 2026/27 (RevSport competition 27800) — real public pages saved 23 Oct 2026.
 * Everything that ties a game, team or player to RevSport is by id only.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compDecision } from './compIds'
import { competitionIdFromUrl, gameIdFromUrl, gradeIdFromUrl, playerIdFromHref, teamIdFromUrl } from './ids'
import { parseRevSportHtml } from './parser'
import { filterGradesById, loadLiveMatch, syncFncLive, type LiveGame } from './sync'

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures')
const read = (f: string) => readFileSync(path.join(fixtures, f), 'utf8')
const HUB = 'https://www.fncwaterpolo.org.au/games'
const hub27800 = read('fnc-27800-games-hub.html')
const hubOld27655 = read('fnc-games-hub.html')
const listing3790 = read('fnc-27800-3790-listing.html')
const round2 = read('fnc-27800-3790-round2.html')
const game2684429 = read('fnc-27800-game-2684429.html')
const stats443848 = read('fnc-27800-team-stats-443848.html')
const stats443850 = read('fnc-27800-team-stats-443850.html')

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Stand-in for the Worker's /api/revsport route, serving saved pages by URL. */
function stubRevSport(pages: Record<string, string>, fallback?: (target: string) => string | undefined) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const target = new URL(String(input), 'https://scorecard.test').searchParams.get('url') || ''
      calls.push(target)
      const html = pages[target] ?? fallback?.(target)
      if (html === undefined) return jsonResponse({ error: 'not in fixtures: ' + target }, 502)
      return jsonResponse({ html, status: 200 })
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('RevSport ids from URLs', () => {
  it('reads game, team, competition, grade and player ids', () => {
    expect(gameIdFromUrl('https://www.fncwaterpolo.org.au/game/2684429')).toBe('2684429')
    expect(teamIdFromUrl('https://www.fncwaterpolo.org.au/games/team/27800/443848')).toBe('443848')
    expect(teamIdFromUrl('https://www.fncwaterpolo.org.au/games/team-stats/27800/443850')).toBe('443850')
    expect(teamIdFromUrl('https://www.revolutionise.com.au/ajwp/teams/379405')).toBe('379405')
    expect(competitionIdFromUrl('https://www.fncwaterpolo.org.au/games/27800/3790/round/2')).toBe('27800')
    expect(competitionIdFromUrl('https://www.fncwaterpolo.org.au/games/team-stats/27655/443855')).toBe('27655')
    expect(gradeIdFromUrl('https://www.fncwaterpolo.org.au/games/27800/3790')).toBe('3790')
    expect(playerIdFromHref('https://www.fncwaterpolo.org.au/games/statistics/mwzjUP?competition_id=27800')).toBe('mwzjUP')
    expect(gameIdFromUrl('https://www.fncwaterpolo.org.au/games')).toBeUndefined()
  })
})

describe('competition allow-list (by id only)', () => {
  it('FNC loads 27800, skips practice 27655, holds back anything new', () => {
    expect(compDecision('FNC', '27800')).toBe('load')
    expect(compDecision('FNC', '27655')).toBe('excluded')
    expect(compDecision('FNC', '27999')).toBe('not-listed')
    expect(compDecision('FNC', undefined)).toBe('not-listed')
  })

  it('other clubs keep loading every competition', () => {
    for (const club of ['AJWP', 'QWP', 'NSWWP', ''] as const) {
      expect(compDecision(club, '24352')).toBe('load')
      expect(compDecision(club, '27655')).toBe('load')
    }
  })

  it('splits the live FNC hub: all four 27800 grades load', () => {
    const hub = parseRevSportHtml(hub27800, '2026-10-23', HUB)
    const { load, heldBack } = filterGradesById(hub.grades || [], 'FNC')
    expect(load.map((g) => g.url.replace(/.*\/games\//, ''))).toEqual([
      '27800/3789',
      '27800/3790',
      '27800/39100',
      '27800/44372',
    ])
    expect(heldBack).toEqual([])
  })

  it('holds back the practice competition 27655 even if its grade has a normal name', () => {
    const hub = parseRevSportHtml(hubOld27655, '2026-09-26', HUB)
    const { load, heldBack } = filterGradesById(hub.grades || [], 'FNC')
    expect(load).toEqual([])
    expect(heldBack).toHaveLength(1)
    expect(heldBack[0]).toMatchObject({ competitionId: '27655', reason: 'excluded' })
  })

  it('a grade from an unknown competition is held back, not guessed', () => {
    const grades = [
      { url: 'https://www.fncwaterpolo.org.au/games/27800/3790', label: 'WOMENS' },
      { url: 'https://www.fncwaterpolo.org.au/games/28001/5000', label: 'FNC' },
    ]
    const { load, heldBack } = filterGradesById(grades, 'FNC')
    expect(load.map((g) => g.label)).toEqual(['WOMENS'])
    expect(heldBack[0]).toMatchObject({ competitionId: '28001', reason: 'not-listed' })
  })
})

describe('parser keeps RevSport ids (FNC 27800 pages)', () => {
  it('fixture cards carry game and home/away team ids', () => {
    const r = parseRevSportHtml(round2, '2026-10-23', 'https://www.fncwaterpolo.org.au/games/27800/3790/round/2')
    const g = r.games?.find((x) => x.gameId === '2684429')
    expect(g).toMatchObject({ homeTeamId: '443848', awayTeamId: '443850', competitionId: '27800' })
    for (const game of r.games || []) {
      expect(game.gameId).toMatch(/^\d+$/)
      expect(game.homeTeamId).toMatch(/^\d+$/)
      expect(game.awayTeamId).toMatch(/^\d+$/)
    }
  })

  it('team-stats players carry RevSport player ids and printed caps', () => {
    const url = 'https://www.fncwaterpolo.org.au/games/team-stats/27800/443850'
    const r = parseRevSportHtml(stats443850, '2026-10-23', url)
    // Has a goals column, so the parser reads it like a match card; the team id comes from the URL.
    expect(['team-stats', 'game']).toContain(r.source)
    expect(r.teams[0].revsportId).toBe('443850')
    const players = r.teams[0].players
    expect(players).toHaveLength(11)
    expect(players.every((p) => /^[A-Za-z0-9_-]+$/.test(p.revsportId || ''))).toBe(true)
    expect(new Set(players.map((p) => p.revsportId)).size).toBe(11)
    expect(players.every((p) => p.cap && !p.capGuessed)).toBe(true)
  })

  it('a team with no public list parses as zero players', () => {
    const r = parseRevSportHtml(stats443848, '2026-10-23', 'https://www.fncwaterpolo.org.au/games/team-stats/27800/443848')
    expect(r.teams[0].players).toHaveLength(0)
  })
})

describe('loadLiveMatch sets sides by team id and flags missing rosters', () => {
  const pages = {
    'https://www.fncwaterpolo.org.au/game/2684429': game2684429,
    'https://www.fncwaterpolo.org.au/games/team-stats/27800/443848': stats443848,
    'https://www.fncwaterpolo.org.au/games/team-stats/27800/443850': stats443850,
  }
  const teamsFallback = (t: string) => (/\/teams\/\d+$/.test(t) ? stats443848 : undefined)
  const fixture: LiveGame = {
    id: '2684429',
    home: 'Bin chicks',
    away: 'Geriatric walruses',
    venueName: 'Alstonville Aquatic Centre',
    detailsUrl: 'https://www.fncwaterpolo.org.au/game/2684429',
    competitionId: '27800',
    homeTeamId: '443848',
    awayTeamId: '443850',
  }

  it('home id plays White, away id plays Blue; players keep RevSport ids', async () => {
    stubRevSport(pages, teamsFallback)
    const { match, error, warnings } = await loadLiveMatch(fixture)
    expect(error).toBeUndefined()
    expect(match!.white.revsportId).toBe('443848')
    expect(match!.blue.revsportId).toBe('443850')
    expect(match!.blue.players).toHaveLength(11)
    expect(match!.blue.players.every((p) => !!p.revsportId)).toBe(true)
    expect(match!.revsport).toEqual({
      gameId: '2684429',
      competitionId: '27800',
      homeTeamId: '443848',
      awayTeamId: '443850',
    })
    expect(match!.white.rosterMissing).toBe(true)
    expect(match!.white.players).toHaveLength(0)
    expect(warnings.join('\n')).toMatch(/has no public player list on RevSport/)
  })

  it('ignores page order: swapping the fixture ids swaps the sides', async () => {
    stubRevSport(pages, teamsFallback)
    const { match } = await loadLiveMatch({ ...fixture, homeTeamId: '443850', awayTeamId: '443848' })
    expect(match!.white.revsportId).toBe('443850')
    expect(match!.white.players).toHaveLength(11)
    expect(match!.blue.revsportId).toBe('443848')
  })

  it('a team id that is not on the game page leaves that side empty with a note', async () => {
    stubRevSport(pages, teamsFallback)
    const { match, warnings } = await loadLiveMatch({ ...fixture, awayTeamId: '999999' })
    expect(match!.white.revsportId).toBe('443848')
    expect(match!.blue.revsportId).toBe('999999')
    expect(match!.blue.players).toHaveLength(0)
    expect(warnings.join('\n')).toMatch(/Could not find the away team \(RevSport id 999999\)/)
  })
})

describe('syncFncLive (27800 hub)', () => {
  it('loads only 27800 grades and keys games by RevSport game id', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-18T09:00:00+11:00'))
    stubRevSport({ [HUB]: hub27800 }, (t) => {
      if (/\/games\/27800\/\d+\/round\/\d+$/.test(t)) return round2
      if (/\/games\/27800\/\d+$/.test(t)) return listing3790
      return undefined
    })
    const snap = await syncFncLive(HUB)
    expect(snap.error).toBeUndefined()
    expect(snap.heldBack).toEqual([])
    expect(snap.competitions.map((c) => c.competitionId)).toEqual(['27800', '27800', '27800', '27800'])
    const ids = snap.games.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('2684429')
    const g = snap.games.find((x) => x.id === '2684429')!
    expect(g).toMatchObject({ homeTeamId: '443848', awayTeamId: '443850', competitionId: '27800' })
  })

  it('a hub with only the practice competition loads nothing and says why', async () => {
    const calls = stubRevSport({ [HUB]: hubOld27655 })
    const snap = await syncFncLive(HUB)
    expect(snap.games).toEqual([])
    expect(snap.heldBack[0]).toMatchObject({ competitionId: '27655', reason: 'excluded' })
    expect(snap.warnings.join('\n')).toMatch(/practice competition/)
    expect(calls).toEqual([HUB])
  })
})
