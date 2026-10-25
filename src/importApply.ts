import { emptyPlayer, emptyTeam } from './engine'
import { MAX_ON_CARD, type Match, type Officials, type Player, type RevSportRef, type Team } from './types'
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
      ...(p.revsportId ? { revsportId: p.revsportId } : {}),
    }),
  )
  return {
    name: imported.name,
    players,
    timeouts: [],
    ...(imported.revsportId ? { revsportId: imported.revsportId } : {}),
    ...(imported.rosterMissing || (imported.revsportId && players.length === 0) ? { rosterMissing: true } : {}),
  }
}

export interface SideAssignment {
  white?: ImportedTeam
  blue?: ImportedTeam
  /** True when both sides were placed by RevSport team id. */
  byId: boolean
  warnings: string[]
}

/**
 * Put teams on White (home) and Blue (away) by RevSport team id — never by name
 * or by the order they appear on the page. A side whose id is not on the page
 * stays empty (with a note) rather than being guessed.
 */
export function assignSidesById(
  teams: ImportedTeam[],
  homeTeamId: string | undefined,
  awayTeamId: string | undefined,
): SideAssignment {
  const warnings: string[] = []
  if (!homeTeamId && !awayTeamId) {
    return { byId: false, warnings }
  }
  const find = (id: string | undefined) => (id ? teams.find((t) => t.revsportId === id) : undefined)
  const white = find(homeTeamId)
  const blue = find(awayTeamId)
  if (homeTeamId && !white) warnings.push(`Could not find the home team (RevSport id ${homeTeamId}) on the game page.`)
  if (awayTeamId && !blue) warnings.push(`Could not find the away team (RevSport id ${awayTeamId}) on the game page.`)
  return { white, blue, byId: !!white && !!blue, warnings }
}

/** Ids for a game page result, using the fixture card's home/away ids when known. */
export function revsportRefFrom(
  result: Pick<ImportResult, 'gameId' | 'competitionId'>,
  fixture?: { gameId?: string; competitionId?: string; homeTeamId?: string; awayTeamId?: string },
): RevSportRef | undefined {
  const ref: RevSportRef = {
    gameId: fixture?.gameId || result.gameId,
    competitionId: fixture?.competitionId || result.competitionId,
    homeTeamId: fixture?.homeTeamId,
    awayTeamId: fixture?.awayTeamId,
  }
  const clean = Object.fromEntries(Object.entries(ref).filter(([, v]) => !!v)) as RevSportRef
  return Object.keys(clean).length ? clean : undefined
}

/**
 * Refresh a team from RevSport without losing what the scorer has done.
 * Same RevSport team id: players are matched by RevSport player id only.
 * Matched players keep their goals, fouls and edits; new RevSport players are
 * added to the bench; players typed in by hand (no RevSport id) are kept.
 * Different (or unknown) team id: the incoming team replaces the old one.
 */
export function mergeTeamById(existing: Team | undefined, incoming: Team): Team {
  if (!existing || !existing.revsportId || existing.revsportId !== incoming.revsportId) return incoming
  const byRevSportId = new Map(
    existing.players.filter((p) => p.revsportId).map((p) => [p.revsportId as string, p]),
  )
  const players: Player[] = []
  for (const p of existing.players) players.push(p)
  let onCard = existing.players.filter((p) => p.onCard).length
  for (const p of incoming.players) {
    if (!p.revsportId) continue
    if (byRevSportId.has(p.revsportId)) continue
    const room = onCard < MAX_ON_CARD
    if (room) onCard += 1
    players.push({ ...p, onCard: room, present: room })
  }
  const rosterMissing = players.length === 0
  return {
    ...existing,
    // Same team id: keep the name the scorer sees (a team-stats page can parse as just "Team").
    name: existing.name || incoming.name,
    players,
    ...(rosterMissing ? { rosterMissing: true } : { rosterMissing: undefined }),
  }
}

/** Empty team for a side that could not be loaded, keeping its RevSport id. */
export function placeholderTeam(name: string, revsportId?: string): Team {
  return { ...emptyTeam(name), ...(revsportId ? { revsportId, rosterMissing: true } : {}) }
}

/** Caps the table can tap when RevSport has no public player list. */
export const PLACEHOLDER_ROSTER_COUNT = 11

/**
 * The yellow “No public player list” notice is `rosterMissing` and zero players.
 * Fill Placeholder 1–11 so the table can score without opening Setup.
 * A side that already has players is left alone. Placeholders have no RevSport id.
 */
export function withPlaceholderRoster(team: Team): Team {
  if (team.players.length > 0 || !team.rosterMissing) return team
  const players: Player[] = []
  for (let n = 1; n <= PLACEHOLDER_ROSTER_COUNT; n++) {
    players.push(
      emptyPlayer({
        cap: String(n),
        name: `Placeholder ${n}`,
        onCard: true,
        present: true,
        isFillIn: false,
      }),
    )
  }
  return { ...team, players, rosterMissing: true }
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
