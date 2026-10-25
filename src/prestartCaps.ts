import { PLACEHOLDER_ROSTER_COUNT } from './importApply'
import type { Team } from './types'

export interface PrestartCap {
  cap: string
  name: string
  /** Set when this cap is a real player on the team. Display-only placeholders have none. */
  playerId?: string
}

function capNumber(cap: string): number {
  const n = Number(cap)
  return Number.isInteger(n) ? n : Number.POSITIVE_INFINITY
}

/**
 * Caps to show before the game clock starts.
 * Real names win for a cap. Empty sides, and any missing cap from 1–11, use Placeholder N.
 * Does not add players to the team.
 */
export function prestartSquad(team: Team): PrestartCap[] {
  const players = [...team.players].sort((a, b) => capNumber(a.cap) - capNumber(b.cap) || a.cap.localeCompare(b.cap))
  if (players.length >= PLACEHOLDER_ROSTER_COUNT) {
    return players.map((p) => ({ cap: p.cap, name: p.name || `Placeholder ${p.cap}`, playerId: p.id }))
  }
  const byCap = new Map(players.map((p) => [p.cap, p]))
  const rows: PrestartCap[] = []
  for (let n = 1; n <= PLACEHOLDER_ROSTER_COUNT; n++) {
    const cap = String(n)
    const player = byCap.get(cap)
    rows.push(
      player
        ? { cap, name: player.name || `Placeholder ${n}`, playerId: player.id }
        : { cap, name: `Placeholder ${n}` },
    )
  }
  for (const p of players) {
    const n = capNumber(p.cap)
    if (n >= 1 && n <= PLACEHOLDER_ROSTER_COUNT) continue
    rows.push({ cap: p.cap, name: p.name || `Placeholder ${p.cap}`, playerId: p.id })
  }
  return rows
}

/** Full squad stays up until the game clock itself has been started. */
export function showPrestartCaps(match: {
  ended?: boolean
  clockRunning?: boolean
  clockStarted?: boolean
  currentPeriod?: number | string
  breakKind?: string | null
  clockRemainingSec?: number
  periodMinutes?: number
}): boolean {
  if (match.ended || match.clockRunning || match.clockStarted) return false
  if (match.breakKind) return false
  if (match.currentPeriod != null && match.currentPeriod !== 1) return false
  if (
    typeof match.clockRemainingSec === 'number' &&
    typeof match.periodMinutes === 'number' &&
    match.periodMinutes > 0 &&
    match.clockRemainingSec < match.periodMinutes * 60 - 0.5
  ) {
    return false
  }
  return true
}
