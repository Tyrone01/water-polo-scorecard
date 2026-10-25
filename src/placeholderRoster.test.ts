import { describe, expect, it } from 'vitest'
import { emptyPlayer, emptyTeam } from './engine'
import { PLACEHOLDER_ROSTER_COUNT, withPlaceholderRoster } from './importApply'
import type { Team } from './types'

function named(team: Team): string[] {
  return team.players.map((p) => p.name)
}

describe('empty public roster gets placeholders', () => {
  it('fills Placeholder 1–11 with caps 1–11 and no RevSport ids', () => {
    const filled = withPlaceholderRoster({ ...emptyTeam('Ducks'), revsportId: '443848', rosterMissing: true })
    expect(PLACEHOLDER_ROSTER_COUNT).toBe(11)
    expect(filled.players).toHaveLength(11)
    expect(named(filled)).toEqual(Array.from({ length: 11 }, (_, i) => `Placeholder ${i + 1}`))
    expect(filled.players.map((p) => p.cap)).toEqual(Array.from({ length: 11 }, (_, i) => String(i + 1)))
    expect(filled.players.every((p) => p.revsportId == null)).toBe(true)
    expect(filled.players.every((p) => p.onCard && p.present)).toBe(true)
    expect(filled.rosterMissing).toBe(true)
    expect(filled.revsportId).toBe('443848')
  })

  it('does not overwrite a roster that already has players', () => {
    const real = {
      ...emptyTeam('Ibis'),
      revsportId: '443850',
      rosterMissing: true,
      players: [emptyPlayer({ cap: '4', name: 'Pat O.', revsportId: 'p1' })],
    }
    const next = withPlaceholderRoster(real)
    expect(next).toBe(real)
    expect(named(next)).toEqual(['Pat O.'])
    expect(next.players[0].revsportId).toBe('p1')
  })

  it('leaves a side alone when the yellow notice would not show', () => {
    const bare = emptyTeam('White')
    expect(withPlaceholderRoster(bare)).toBe(bare)
    expect(bare.players).toHaveLength(0)
  })
})
