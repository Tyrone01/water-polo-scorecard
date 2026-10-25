import { formatTime, isOutForRemainder, personalFoulCount, runningScoreFromEvents } from './engine'
import { GOAL_CODES, type BreakKind, type ClockSignal, type EventCode, type Match, type PeriodId, type Side, type Team } from './types'

/** Codes shown on the spectator rails: goals plus personal fouls / game exclusion. */
export const BOARD_RAIL_CODES: EventCode[] = [...GOAL_CODES, 'E', 'P', 'S']

export const BOARD_ID_RE = /^[a-zA-Z0-9_-]{4,40}$/
export const LIVE_BOARD_ID = 'live'


/**
 * Public TV host (custom domain). Short paths: /alstonville not /board/alstonville.
 * A build can set VITE_PUBLIC_BOARD_ORIGIN (empty = this site only), so previews and
 * other hosts never post to the live pool boards.
 */
const envBoardOrigin = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_PUBLIC_BOARD_ORIGIN
export const PUBLIC_BOARD_ORIGIN = (envBoardOrigin ?? 'https://board.fncwp.com').replace(/\/$/, '')

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
  const origin = PUBLIC_BOARD_ORIGIN || (typeof location !== 'undefined' ? location.origin : '')
  return boardUrl(origin, boardId)
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

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function optText(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined
}

/**
 * TV polls must not throw if a stored value is partial or from an older build.
 * Returns null when the payload is not a snapshot. A cleared tombstone is returned
 * with `cleared: true` so the TV can go back to the waiting screen.
 */
export function coerceBoardSnapshot(data: unknown): BoardSnapshot | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Partial<BoardSnapshot>
  if (d.cleared) {
    return {
      v: 1,
      updatedAt: num(d.updatedAt),
      whiteName: '',
      blueName: '',
      white: 0,
      blue: 0,
      period: 1,
      clockRemainingSec: 0,
      shotClockRemainingSec: 0,
      clockRunning: false,
      shotClockRunning: false,
      clockSignal: null,
      breakKind: null,
      breakRemainingSec: 0,
      breakRunning: false,
      possession: null,
      ended: false,
      last: [],
      whiteFouls: [],
      blueFouls: [],
      started: false,
      whiteRoster: [],
      blueRoster: [],
      cleared: true,
    }
  }
  if (typeof d.updatedAt !== 'number' || !Number.isFinite(d.updatedAt)) return null
  const period = d.period === 'PSO' || d.period === 1 || d.period === 2 || d.period === 3 || d.period === 4 ? d.period : 1
  const last = Array.isArray(d.last)
    ? d.last.filter((e): e is BoardLastEvent => {
        if (!e || typeof e !== 'object') return false
        return (e.side === 'white' || e.side === 'blue') && typeof e.code === 'string'
      })
    : []
  const fouls = (rows: unknown): BoardFoulSummary[] =>
    Array.isArray(rows)
      ? rows.filter((f): f is BoardFoulSummary => {
          if (!f || typeof f !== 'object') return false
          return typeof (f as BoardFoulSummary).cap === 'string' && typeof (f as BoardFoulSummary).pf === 'number'
        })
      : []
  const roster = (rows: unknown): BoardRosterPlayer[] =>
    Array.isArray(rows)
      ? rows.filter((p): p is BoardRosterPlayer => {
          if (!p || typeof p !== 'object') return false
          return typeof (p as BoardRosterPlayer).cap === 'string' && typeof (p as BoardRosterPlayer).name === 'string'
        })
      : []
  const signal =
    d.clockSignal && typeof d.clockSignal === 'object' && typeof d.clockSignal.id === 'string' && d.clockSignal.id
      ? d.clockSignal
      : null
  const snap: BoardSnapshot = {
    v: 1,
    updatedAt: d.updatedAt,
    whiteName: typeof d.whiteName === 'string' ? d.whiteName : 'White',
    blueName: typeof d.blueName === 'string' ? d.blueName : 'Blue',
    white: num(d.white),
    blue: num(d.blue),
    period,
    clockRemainingSec: num(d.clockRemainingSec),
    shotClockRemainingSec: num(d.shotClockRemainingSec),
    clockRunning: Boolean(d.clockRunning),
    shotClockRunning: Boolean(d.shotClockRunning),
    clockSignal: signal,
    breakKind: d.breakKind === 'quarter' || d.breakKind === 'half' ? d.breakKind : null,
    breakRemainingSec: num(d.breakRemainingSec),
    breakRunning: Boolean(d.breakRunning),
    possession: d.possession === 'white' || d.possession === 'blue' ? d.possession : null,
    ended: Boolean(d.ended),
    last,
    whiteFouls: fouls(d.whiteFouls),
    blueFouls: fouls(d.blueFouls),
    started: Boolean(d.started),
    whiteRoster: roster(d.whiteRoster),
    blueRoster: roster(d.blueRoster),
  }
  const grade = optText(d.grade)
  const stage = optText(d.stage)
  const eventName = optText(d.eventName)
  const venueLabel = optText(d.venueLabel)
  if (grade) snap.grade = grade
  if (stage) snap.stage = stage
  if (eventName) snap.eventName = eventName
  if (venueLabel) snap.venueLabel = venueLabel
  return snap
}

/**
 * Cloudflare KV allows 1 write per second to the same key. A faster put throws
 * "KV PUT failed: 429 Too Many Requests" and the Worker request fails.
 * https://developers.cloudflare.com/kv/api/write-key-value-pairs/
 */
const MIN_BOARD_WRITE_MS = 1000

let timer: ReturnType<typeof setTimeout> | null = null
let timerDue = 0
let pending: Match | null = null
let writing = false
let lastWriteAt = -MIN_BOARD_WRITE_MS
let lastFingerprint = ''
let inflight: AbortController | null = null

/**
 * Stable across clock ticks. A sticky clockSignal (the horn id stays on the match)
 * must not count as a new event on every tick — that used to bypass the debounce
 * and post about 4 times a second for the rest of the game.
 */
function boardFingerprint(match: Match): string {
  const shot = match.shotClockRemainingSec ?? match.shotClockSec
  const card = (team: Match['white']) =>
    team.players
      .map((p) => `${p.id}:${p.cap}:${p.name}:${p.onCard ? 1 : 0}:${p.struckOff ? 1 : 0}:${personalFoulCount(p)}:${isOutForRemainder(p) ? 1 : 0}`)
      .join(',')
  return [
    match.clockSignal?.id ?? '',
    match.events.map((e) => e.id).join(','),
    match.currentPeriod,
    match.clockRunning ? 'c' : '',
    match.shotClockRunning ? 's' : '',
    match.breakRunning ? 'b' : '',
    match.breakKind ?? '',
    match.possession ?? '',
    match.ended ? 'e' : '',
    match.started ? 'st' : '',
    match.white.name,
    match.blue.name,
    match.clockRunning && match.clockRemainingSec <= 1 ? 'clock-low' : '',
    match.shotClockRunning && shot <= 1 ? 'shot-low' : '',
    card(match.white),
    card(match.blue),
  ].join('|')
}

function postBoardSnapshot(id: string, body: string, signal?: AbortSignal): Promise<Response> {
  const headers = { 'Content-Type': 'application/json' }
  const init: RequestInit = { method: 'POST', headers, body, signal }
  if (!PUBLIC_BOARD_ORIGIN) return fetch(`/api/board/${encodeURIComponent(id)}`, init)
  const publicUrl = `${PUBLIC_BOARD_ORIGIN}/api/board/${encodeURIComponent(id)}`
  return fetch(publicUrl, init).catch((err) => {
    if (signal?.aborted) throw err
    /* Offline / no route to board.fncwp.com — same-origin Vite or workers.dev */
    return fetch(`/api/board/${encodeURIComponent(id)}`, init)
  })
}

function arm(match: Match): void {
  pending = match
  if (writing) return
  const now = Date.now()
  const urgent = boardFingerprint(match) !== lastFingerprint
  const gap = Math.max(0, MIN_BOARD_WRITE_MS - (now - lastWriteAt))
  const delay = urgent ? gap : Math.max(gap, MIN_BOARD_WRITE_MS)
  const due = now + delay
  if (timer != null && due >= timerDue) return
  if (timer != null) clearTimeout(timer)
  timerDue = due
  timer = setTimeout(flush, delay)
}

function flush(): void {
  timer = null
  timerDue = 0
  const match = pending
  pending = null
  if (!match || writing) {
    if (match) pending = match
    return
  }
  writing = true
  lastWriteAt = Date.now()
  lastFingerprint = boardFingerprint(match)
  const body = JSON.stringify(buildBoardSnapshot(match, lastWriteAt))
  const id = boardIdForMatch(match)
  const ctrl = new AbortController()
  inflight = ctrl
  void postBoardSnapshot(id, body, ctrl.signal)
    .then((res) => {
      if (!res.ok && !pending) pending = match
    })
    .catch(() => {
      /* tablet scoring still works if the board API is down; retry the latest match */
      if (!ctrl.signal.aborted && !pending) pending = match
    })
    .finally(() => {
      if (inflight === ctrl) inflight = null
      writing = false
      if (ctrl.signal.aborted) return
      if (pending) arm(pending)
    })
}

/** At most one KV write per second per pool board. Goals still go out as soon as the gap allows. */
export function publishBoard(match: Match): void {
  arm(match)
}

/** Test helper. Production callers do not use this. */
export function resetBoardPublishState(): void {
  if (timer != null) clearTimeout(timer)
  timer = null
  timerDue = 0
  pending = null
  writing = false
  lastWriteAt = -MIN_BOARD_WRITE_MS
  lastFingerprint = ''
  inflight?.abort()
  inflight = null
}

function deleteBoardSnapshot(id: string): Promise<Response> {
  if (!PUBLIC_BOARD_ORIGIN) return fetch(`/api/board/${encodeURIComponent(id)}`, { method: 'DELETE' })
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
      timerDue = 0
    }
  }
  inflight?.abort()
  inflight = null
  writing = false
  void deleteBoardSnapshot(id).catch(() => {
    /* clearing is best-effort; tablet still returns to venues */
  })
}
