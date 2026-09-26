import { emptyPlayer } from './engine'
import { MAX_ON_CARD, type Match, type Officials, type Player, type Team } from './types'
import type { ImportResult, ImportedTeam } from './revsport/parser'

export function importedTeamToTeam(imported: ImportedTeam): Team {
  const players: Player[] = imported.players.map((p, i) =>
    emptyPlayer({
      cap: p.cap || String(i + 1),
      name: p.name,
      capGuessed: p.capGuessed,
      onCard: i < MAX_ON_CARD,
      present: i < MAX_ON_CARD,
      isFillIn: false,
    }),
  )
  return { name: imported.name, players, timeouts: [] }
}

export function importMetaPatch(match: Match, result: ImportResult): Partial<Match> {
  const officials: Officials = { ...match.officials }
  if (result.referees) {
    const parts = result.referees
      .split(/\s*(?:,|&| and )\s*/i)
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts[0]) officials.referee1 = parts[0]
    if (parts[1]) officials.referee2 = parts[1]
  }
  const venue = result.venue || match.venue
  return {
    eventName: result.competition || match.eventName,
    grade: result.grade || match.grade,
    stage: result.round || match.stage,
    venue,
    date: result.date || match.date,
    startTime: result.startTime || match.startTime,
    officials,
  }
}
