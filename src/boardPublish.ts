import { formatTime, isOutForRemainder, personalFoulCount, runningScoreFromEvents } from './engine'
import { GOAL_CODES, type BreakKind, type ClockSignal, type EventCode, type Match, type PeriodId, type Side, type Team } from './types'

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
  clockSignal?: ClockSignal | null
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

function venueSlugForBoard(name: string): string {
  return name
    .toLowerCase()
    .replace(/aquatic centre|indoor pool|pool|leisure centre/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'venue'
}

/** Board id from match.venue (alstonville, ballina, …); falls back to live. */
export function boardIdForMatch(match: Pick<Match, 'venue'>): string {
  const slug = venueSlugForBoard(match.venue || '')
  if (slug && BOARD_ID_RE.test(slug)) return slug
  return LIVE_BOARD_ID
}

export function boardUrl(origin: string, boardId: string = LIVE_BOARD_ID): string {
  const base = origin.replace(/\/$/, '')
  const id = BOARD_ID_RE.test(boardId) ? boardId : LIVE_BOARD_ID
  return `${base}/board/${id}`
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
    clockSignal: match.clockSignal ?? null,
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
  const id = boardIdForMatch(match)
  void fetch(`/api/board/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {
    /* tablet scoring still works if the board API is down */
  })
}

function clocksNearZero(match: Match): boolean {
  const shotRem = match.shotClockRemainingSec ?? match.shotClockSec
  if (match.shotClockRunning && shotRem <= 1) return true
  if (match.clockRunning && match.clockRemainingSec <= 1) return true
  return false
}

/** Debounced ~400ms POST; clock signals and near-zero clocks flush immediately. */
export function publishBoard(match: Match): void {
  pending = match
  if (match.clockSignal || clocksNearZero(match)) {
    if (timer != null) clearTimeout(timer)
    timer = setTimeout(flush, 0)
    return
  }
  if (timer != null) return
  timer = setTimeout(flush, 400)
}
