import { describe, expect, it } from 'vitest'
import { resultsCsv, resultsFilename } from './csv'
import { emptyPlayer, newMatch } from './engine'
import { assignSidesById, mergeTeamById } from './importApply'
import type { Team } from './types'

function team(name: string, revsportId: string | undefined, players: Parameters<typeof emptyPlayer>[0][]): Team {
  return { name, revsportId, timeouts: [], players: players.map((p) => emptyPlayer(p)) }
}

describe('results CSV for RevSport (hand entry)', () => {
  it('has the game id, team ids, score and scorers by player id and cap', () => {
    const white = team('Bin chicks', '443848', [
      { cap: '3', name: 'Typed In', id: 'w3' },
      { cap: '1', name: 'Nobody', id: 'w1' },
    ])
    white.players[0].goalsQ2 = 2
    const blue = team('Geriatric walruses', '443850', [
      { cap: '2', name: 'Veronica S.', revsportId: 'mwzjUP' },
      { cap: '7', name: 'Second', revsportId: 'abc123' },
    ])
    blue.players[0].goalsQ1 = 1
    blue.players[0].goalsQ4 = 2
    blue.players[1].goalsQ3 = 1
    const match = newMatch({
      date: '2026-10-19',
      grade: 'WOMENS',
      stage: 'Round 2',
      white,
      blue,
      revsport: { gameId: '2684429', competitionId: '27800', homeTeamId: '443848', awayTeamId: '443850' },
    })
    const csv = resultsCsv(match)
    const lines = csv.split('\n')
    expect(lines[0]).toContain('RevSport game ID')
    expect(lines[1]).toBe(
      'TEAM,2684429,27800,2026-10-19,WOMENS,Round 2,White (home),443848,Bin chicks,2,,443850,Geriatric walruses,4,,,,,',
    )
    expect(lines[2]).toMatch(/^SCORER,2684429,.*,,3,Typed In,2,Not on the RevSport player list — match by cap$/)
    expect(lines[3]).toMatch(/^TEAM,2684429,.*Blue \(away\),443850,Geriatric walruses,4,,443848,Bin chicks,2,/)
    expect(lines[4]).toMatch(/,mwzjUP,2,Veronica S\.,3,$/)
    expect(lines[5]).toMatch(/,abc123,7,Second,1,$/)
    expect(lines).toHaveLength(6)
    expect(resultsFilename(match)).toBe('game-2684429-results-for-revsport.csv')
  })
})

describe('team and player matching by RevSport id', () => {
  it('assignSidesById never falls back to order', () => {
    const teams = [
      { name: 'A', revsportId: '1', players: [] },
      { name: 'B', revsportId: '2', players: [] },
    ]
    expect(assignSidesById(teams, '2', '1')).toMatchObject({ white: { name: 'B' }, blue: { name: 'A' }, byId: true })
    const missing = assignSidesById(teams, '3', '1')
    expect(missing.white).toBeUndefined()
    expect(missing.byId).toBe(false)
  })

  it('a refresh keeps scored players by id, adds new ones, keeps typed-in ones', () => {
    const existing = team('Mermaids', '443851', [
      { cap: '4', name: 'Old name', revsportId: 'p1' },
      { cap: '9', name: 'Typed in', id: 'manual' },
    ])
    existing.players[0].goalsQ1 = 2
    const incoming = team('Mermaids', '443851', [
      { cap: '4', name: 'Old name', revsportId: 'p1' },
      { cap: '5', name: 'Same Name', revsportId: 'p2' },
    ])
    const merged = mergeTeamById(existing, incoming)
    expect(merged.players.map((p) => p.revsportId || p.id)).toEqual(['p1', 'manual', 'p2'])
    expect(merged.players[0].goalsQ1).toBe(2)
  })

  it('same name but a different team id replaces the team', () => {
    const existing = team('Lennox', '443846', [{ cap: '1', name: 'X', revsportId: 'p1' }])
    const incoming = team('Lennox', '447355', [{ cap: '2', name: 'Y', revsportId: 'p9' }])
    expect(mergeTeamById(existing, incoming)).toBe(incoming)
  })
})
