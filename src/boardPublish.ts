import { formatTime, isOutForRemainder, personalFoulCount, runningScoreFromEvents } from './engine'
import { GOAL_CODES, type BreakKind, type ClockSignal, type EventCode, type Match, type PeriodId, type Side, type Team } from './types'

/** Codes shown on the spectator rails: goals plus personal fouls / game exclusion. */
export const BOARD_RAIL_CODES: EventCode[] = [...GOAL_CODES, 'E', 'P', 'S']

export const BOARD_ID_RE = /^[a-zA-Z0-9_-]{4,40}$/
export const LIVE_BOARD_ID = 'live'


/** Public TV host (custom domain). Short paths: /alstonville not /board/alstonville. */
export const PUBLIC_BOARD_ORIGIN = 'https://board.fncwp.com'

export const FNC_BOARD_VENUE_IDS = ['alstonville', 'ballina', 'lismore', 'mullumbimby'] as const
export type FncBoardVenueId = (typeof FNC_BOARD_VENUE_IDS)[number]

export function isFncBoardVenueId(id: string): id is FncBoardVenueId {
  return (FNC_BOARD_VENUE_IDS as readonly string[]).includes(id)
}

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
  /** Optional game meta so the pool TV shows which match the table is covering. */
  grade?: string
  stage?: string
  eventName?: string
  venueLabel?: string
  /** Tombstone: table cleared this board; TV should show wait state. */
  cleared?: boolean
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

/** Slugify a venue name the same way as revsport/sync `venueSlug`. */
export function venueSlugForBoard(name: string): string {
  return name
    .toLowerCase()
    .replace(/aquatic centre|indoor pool|pool|leisure centre/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'venue'
}

function fncIdFromCandidate(raw: string): FncBoardVenueId | null {
  const lower = raw.trim().toLowerCase()
  if (!lower) return null
  for (const id of FNC_BOARD_VENUE_IDS) {
    if (lower === id || lower.startsWith(`${id}-`) || lower.startsWith(`${id} `) || lower.includes(id)) {
      return id
    }
  }
  return null
}

/**
 * Board id for the venue TV.
 * Prefer explicit `boardVenueId` (from VenueNightScreen) when it is a known FNC
 * id or a valid BOARD_ID_RE slug; else fall back to venue name/slug heuristics.
 * Known FNC ids win over longer RevSport slugs such as `alstonville-aquatic`.
 */
export function boardIdForMatch(match: Pick<Match, 'venue' | 'boardVenueId'>): string {
  const override = (match.boardVenueId || '').trim()
  if (override) {
    const fnc = fncIdFromCandidate(override)
    if (fnc) return fnc
    if (BOARD_ID_RE.test(override)) return override
  }
  const raw = (match.venue || '').trim().toLowerCase()
  const slug = venueSlugForBoard(match.venue || '')
  const fromVenue = fncIdFromCandidate(raw) || fncIdFromCandidate(slug)
  if (fromVenue) return fromVenue
  if (slug && BOARD_ID_RE.test(slug)) return slug
  return LIVE_BOARD_ID
}

/**
 * TV bookmark URL. On the public board host use short paths (/alstonville).
 * Elsewhere (workers.dev / local) keep /board/{id}.
 */
export function boardUrl(origin: string, boardId: string = LIVE_BOARD_ID): string {
  const base = origin.replace(/\/$/, '')
  const id = BOARD_ID_RE.test(boardId) ? boardId : LIVE_BOARD_ID
  const host = base.replace(/^https?:\/\//i, '').split('/')[0]?.toLowerCase() ?? ''
  const shortPaths = host === 'board.fncwp.com'
  if (shortPaths && isFncBoardVenueId(id)) return `${base}/${id}`
  if (shortPaths && id === LIVE_BOARD_ID) return `${base}/`
  return `${base}/board/${id}`
}

/** Prefer the public board host for Setup / Open board links when the tablet is on workers.dev. */
export function publicBoardUrl(boardId: string): string {
  return boardUrl(PUBLIC_BOARD_ORIGIN, boardId)
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
  const snap: BoardSnapshot = {
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
  if (match.grade) snap.grade = match.grade
  if (match.stage) snap.stage = match.stage
  if (match.eventName) snap.eventName = match.eventName
  if (match.venue) snap.venueLabel = match.venue
  return snap
}

let timer: ReturnType<typeof setTimeout> | null = null
let pending: Match | null = null

function postBoardSnapshot(id: string, body: string): Promise<Response> {
  const headers = { 'Content-Type': 'application/json' }
  const publicUrl = `${PUBLIC_BOARD_ORIGIN}/api/board/${encodeURIComponent(id)}`
  return fetch(publicUrl, { method: 'POST', headers, body }).catch(() =>
    /* Offline / no route to board.fncwp.com — same-origin Vite or workers.dev */
    fetch(`/api/board/${encodeURIComponent(id)}`, { method: 'POST', headers, body }),
  )
}

function flush(): void {
  timer = null
  const match = pending
  pending = null
  if (!match) return
  const body = JSON.stringify(buildBoardSnapshot(match))
  const id = boardIdForMatch(match)
  void postBoardSnapshot(id, body).catch(() => {
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

function deleteBoardSnapshot(id: string): Promise<Response> {
  const publicUrl = `${PUBLIC_BOARD_ORIGIN}/api/board/${encodeURIComponent(id)}`
  return fetch(publicUrl, { method: 'DELETE' }).catch(() =>
    fetch(`/api/board/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  )
}

/**
 * Clear a pool TV board so GET returns 404 / wait state.
 * Cancels any pending publish for the same id first.
 */
export function clearBoard(boardId: string): void {
  const id = BOARD_ID_RE.test(boardId) ? boardId : LIVE_BOARD_ID
  if (pending && boardIdForMatch(pending) === id) {
    pending = null
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
  }
  void deleteBoardSnapshot(id).catch(() => {
    /* clearing is best-effort; tablet still returns to venues */
  })
}
