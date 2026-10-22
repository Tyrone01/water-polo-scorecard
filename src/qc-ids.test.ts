// QC (The Finisher): real-behaviour checks for ID-only matching and the results CSV.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resultsCsv } from './csv'
import { emptyPlayer, newMatch } from './engine'
import { mergeTeamById } from './importApply'
import { parseRevSportHtml } from './revsport/parser'
import type { Team } from './types'

const here = path.dirname(fileURLToPath(import.meta.url))

function team(name: string, revsportId: string | undefined, players: Parameters<typeof emptyPlayer>[0][]): Team {
  return { name, revsportId, timeouts: [], players: players.map((p) => emptyPlayer(p)) }
}

describe('ID-only player matching (QC)', () => {
  it('a player renamed in RevSport keeps their goals (matched by player id, not name)', () => {
    const existing = team('Mermaids', '443851', [{ cap: '4', name: 'Jess T.', revsportId: 'p1', id: 'a' }])
    existing.players[0].goalsQ1 = 3
    const incoming = team('Mermaids', '443851', [{ cap: '4', name: 'Jessica Taylor', revsportId: 'p1', id: 'b' }])
    const merged = mergeTeamById(existing, incoming)
    expect(merged.players).toHaveLength(1)
    expect(merged.players[0].goalsQ1).toBe(3)
    expect(merged.players[0].id).toBe('a')
  })

  it('two players with the same name but different ids stay separate', () => {
    const existing = team('Lennox', '443846', [{ cap: '3', name: 'Sam Lee', revsportId: 'pA' }])
    existing.players[0].goalsQ2 = 2
    const incoming = team('Lennox', '443846', [
      { cap: '3', name: 'Sam Lee', revsportId: 'pA' },
      { cap: '8', name: 'Sam Lee', revsportId: 'pB' },
    ])
    const merged = mergeTeamById(existing, incoming)
    expect(merged.players.map((p) => [p.revsportId, p.cap, p.goalsQ2])).toEqual([
      ['pA', '3', 2],
      ['pB', '8', 0],
    ])
  })

  it('same name, same cap, typed in by hand, is NOT merged with a RevSport player (no name fallback)', () => {
    const existing = team('Bin chicks', '443848', [{ cap: '7', name: 'Kate R.', id: 'typed' }])
    existing.players[0].goalsQ1 = 1
    const incoming = team('Bin chicks', '443848', [{ cap: '7', name: 'Kate R.', revsportId: 'pK' }])
    const merged = mergeTeamById(existing, incoming)
    expect(merged.players.map((p) => p.revsportId || p.id)).toEqual(['typed', 'pK'])
    expect(merged.players[0].goalsQ1).toBe(1)
  })

  it('players typed in by hand survive a refresh, and an empty RevSport list keeps them all', () => {
    const existing = team('Bin chicks', '443848', [
      { cap: '4', name: 'Typed A', id: 't1' },
      { cap: '5', name: 'Typed B', id: 't2' },
    ])
    existing.players[1].goalsQ3 = 2
    const merged = mergeTeamById(existing, { ...team('Bin chicks', '443848', []), rosterMissing: true })
    expect(merged.players.map((p) => p.id)).toEqual(['t1', 't2'])
    expect(merged.players[1].goalsQ3).toBe(2)
    expect(merged.rosterMissing).toBeUndefined()
  })

  it('a player whose RevSport id changed keeps their goals on the old entry; the new id is added separately', () => {
    const existing = team('Ibis', '443852', [{ cap: '2', name: 'Pat O.', revsportId: 'old' }])
    existing.players[0].goalsQ1 = 1
    const merged = mergeTeamById(existing, team('Ibis', '443852', [{ cap: '2', name: 'Pat O.', revsportId: 'new' }]))
    expect(merged.players.map((p) => [p.revsportId, p.goalsQ1])).toEqual([['old', 1], ['new', 0]])
  })

  it('parser gives two same-name rows their own player ids (real FNC team-stats page, one name duplicated)', () => {
    const url = 'https://www.fncwaterpolo.org.au/games/team-stats/27800/443850'
    const html = readFileSync(path.join(here, '../fixtures/fnc-27800-team-stats-443850.html'), 'utf8')
    const before = parseRevSportHtml(html, '2026-10-26', url).teams[0].players
    const [a, b] = before
    const dup = html.split(`>${b.name}\n`).join(`>${a.name}\n`)
    const after = parseRevSportHtml(dup, '2026-10-26', url).teams[0].players
    expect(after).toHaveLength(before.length)
    expect(after.filter((p) => p.name === a.name).map((p) => p.revsportId)).toEqual([a.revsportId, b.revsportId])
    expect(a.revsportId).not.toBe(b.revsportId)
  })
})

describe('results CSV (QC)', () => {
  it('quotes names with commas and keeps shootout goals out of Score', () => {
    const white = team('Crossbar Queens', '443856', [{ cap: '1', name: 'Ruth, B.', revsportId: 'r1' }])
    white.players[0].goalsQ1 = 2
    white.players[0].goalsPen = 1
    const blue = team('Byron ladies', '443847', [{ cap: '6', name: 'Matilda D.', revsportId: 'm6' }])
    blue.players[0].goalsQ4 = 2
    const csv = resultsCsv(newMatch({ white, blue, date: '2026-10-26', grade: 'WOMENS', stage: 'Round 3', revsport: { gameId: '2684432', competitionId: '27800', homeTeamId: '443856', awayTeamId: '443847' } }))
    const lines = csv.split('\n')
    expect(lines[1]).toContain('White (home),443856,Crossbar Queens,2,1,443847,Byron ladies,2')
    expect(lines[2]).toContain('r1,1,"Ruth, B.",2,1 in shootout (not in Goals)')
    expect(lines[3]).toContain('Blue (away),443847,Byron ladies,2,0,443856')
  })
})
