import { formatTime, isOutForRemainder, personalFoulCount, runningScoreFromEvents } from './engine'
import { GOAL_CODES, type BreakKind, type EventCode, type Match, type PeriodId, type Side, type Team } from './types'

/** Codes shown on the spectator rails: goals plus personal fouls / game exclusion. */
export const BOARD_RAIL_CODES: EventCode[] = [...GOAL_CODES, 'E', 'P', 'S']

export const BOARD_ID_RE = /^[a-zA-Z0-9_-]{4,40}$/
export const LIVE_BOARD_ID = 'live'

export interface BoardLastEvent {
  time: string
  cap: string
  side: Side
  code: EventCode
  score?: string
}

export interface BoardFoulSummary {
  cap: string
  pf: number
  out: boolean
}

export interface BoardRosterPlayer {
  cap: string
  name: string
  fillIn: boolean
}

export interface BoardSnapshot {
  v: 1
  updatedAt: number
  whiteName: string
  blueName: string
  white: number
  blue: number
  period: PeriodId
  clockRemainingSec: number
  shotClockRemainingSec: number
  clockRunning: boolean
  shotClockRunning: boolean
  breakKind: BreakKind | null
  breakRemainingSec: number
  breakRunning: boolean
  possession: Side | null
  ended: boolean
  last: BoardLastEvent[]
  whiteFouls: BoardFoulSummary[]
  blueFouls: BoardFoulSummary[]
  started: boolean
  whiteRoster: BoardRosterPlayer[]
  blueRoster: BoardRosterPlayer[]
}

function rosterOf(team: Team): BoardRosterPlayer[] {
  return team.players
    .filter((p) => p.onCard && !p.struckOff)
    .map((p) => ({ cap: p.cap, name: p.name, fillIn: p.isFillIn }))
}

function foulSummaries(team: Team): BoardFoulSummary[] {
  const rows: BoardFoulSummary[] = []
  for (const p of team.players) {
    const pf = personalFoulCount(p)
    const out = isOutForRemainder(p)
    if (pf >= 1 || out) rows.push({ cap: p.cap, pf, out })
  }
  return rows
}

export function boardUrl(origin: string): string {
  const base = origin.replace(/\/$/, '')
  return `${base}/board`
}

export function buildBoardSnapshot(match: Match, now = Date.now()): BoardSnapshot {
  const score = runningScoreFromEvents(match.events)
  const last: BoardLastEvent[] = match.events.filter((e) => BOARD_RAIL_CODES.includes(e.code)).slice(-24).map((e) => {
    const row: BoardLastEvent = {
      time: e.time || formatTime(e.timeRemainingSec),
      cap: e.cap,
      side: e.side,
      code: e.code,
    }
    if (e.score) row.score = e.score
    return row
  })
  return {
    v: 1,
    updatedAt: now,
    whiteName: match.white.name,
    blueName: match.blue.name,
    white: score.white,
    blue: score.blue,
    period: match.currentPeriod,
    clockRemainingSec: match.clockRemainingSec,
    shotClockRemainingSec: match.shotClockRemainingSec ?? match.shotClockSec,
    clockRunning: match.clockRunning,
    shotClockRunning: match.shotClockRunning,
    breakKind: match.breakKind ?? null,
    breakRemainingSec: match.breakRemainingSec ?? 0,
    breakRunning: match.breakRunning ?? false,
    possession: match.possession,
    ended: match.ended,
    last,
    whiteFouls: foulSummaries(match.white),
    blueFouls: foulSummaries(match.blue),
    started: match.started,
    whiteRoster: rosterOf(match.white),
    blueRoster: rosterOf(match.blue),
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
let pending: Match | null = null

function flush(): void {
  timer = null
  const match = pending
  pending = null
  if (!match) return
  const body = JSON.stringify(buildBoardSnapshot(match))
  void fetch(`/api/board/${LIVE_BOARD_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {
    /* tablet scoring still works if the board API is down */
  })
}

/** Debounced ~400ms POST of a compact snapshot for the spectator board. */
export function publishBoard(match: Match): void {
  pending = match
  if (timer != null) return
  timer = setTimeout(flush, 400)
}
