import { describe, expect, it } from 'vitest'
import { emptyTeam, newMatch } from './engine'
import { prestartSquad, showPrestartCaps } from './prestartCaps'
import type { Player } from './types'

function player(cap: string, name: string): Player {
  return {
    id: `p-${cap}`,
    cap,
    name,
    isFillIn: false,
    onCard: true,
    present: true,
    struckOff: false,
    capGuessed: false,
    fouls: [],
    goalsQ1: 0,
    goalsQ2: 0,
    goalsQ3: 0,
    goalsQ4: 0,
    goalsPen: 0,
  }
}

describe('pre-start caps', () => {
  it('shows Placeholder 1–11 when a side has nobody', () => {
    const squad = prestartSquad(emptyTeam('Byron ladies'))
    expect(squad.map((p) => p.name)).toEqual(Array.from({ length: 11 }, (_, i) => `Placeholder ${i + 1}`))
    expect(squad.map((p) => p.cap)).toEqual(Array.from({ length: 11 }, (_, i) => String(i + 1)))
    expect(squad.every((p) => p.playerId == null)).toBe(true)
  })

  it('keeps real names and fills the missing caps up to 11', () => {
    const team = {
      ...emptyTeam('Crossbar Queens'),
      players: [player('2', 'Bea Queen'), player('1', 'Ada Queen')],
    }
    const before = team.players.map((p) => p.name)
    const squad = prestartSquad(team)
    expect(squad[0]).toMatchObject({ cap: '1', name: 'Ada Queen', playerId: 'p-1' })
    expect(squad[1]).toMatchObject({ cap: '2', name: 'Bea Queen', playerId: 'p-2' })
    expect(squad[2]).toEqual({ cap: '3', name: 'Placeholder 3' })
    expect(squad).toHaveLength(11)
    expect(squad[10].name).toBe('Placeholder 11')
    expect(team.players.map((p) => p.name)).toEqual(before)
  })

  it('shows a full real squad without inventing extra placeholders', () => {
    const team = {
      ...emptyTeam('Ducks'),
      players: Array.from({ length: 11 }, (_, i) => player(String(i + 1), `Player ${i + 1}`)),
    }
    const squad = prestartSquad(team)
    expect(squad.map((p) => p.name)).toEqual(Array.from({ length: 11 }, (_, i) => `Player ${i + 1}`))
  })

  it('stays up until the game clock starts, then stays hidden if the clock is paused', () => {
    const fresh = newMatch({ white: emptyTeam('Crossbar Queens'), blue: emptyTeam('Byron ladies') })
    expect(showPrestartCaps(fresh)).toBe(true)
    expect(showPrestartCaps({ ...fresh, clockRunning: true })).toBe(false)
    expect(showPrestartCaps({ ...fresh, clockStarted: true, clockRunning: false })).toBe(false)
    expect(showPrestartCaps({ ...fresh, currentPeriod: 2 })).toBe(false)
    expect(showPrestartCaps({ ...fresh, clockRemainingSec: 400, periodMinutes: 8 })).toBe(false)
    expect(showPrestartCaps({ ...fresh, ended: true })).toBe(false)
  })
})
