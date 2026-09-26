import {
  AGE_PERIOD_MINUTES,
  DEFAULT_HALF_TIME_BREAK_SEC,
  DEFAULT_QUARTER_BREAK_SEC,
  DEFAULT_SHOT_CLOCK_SEC,
  DEFAULT_SHOT_CLOCK_SHORT_SEC,
  EXCLUSION_SECONDS,
  GOAL_CODES,
  MAX_FILL_INS,
  MAX_ON_CARD,
  MAX_PERSONAL_FOULS,
  MAX_TIMEOUTS_FINALS,
  type AgeGroup,
  type ApplyResult,
  type BreakKind,
  type ClockSignal,
  type EventCode,
  type FoulSlot,
  type LogEvent,
  type Match,
  type PeriodId,
  type Player,
  type Side,
  type Team,
} from './types'

export function uid(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}

export function periodMinutes(age: AgeGroup): number {
  return AGE_PERIOD_MINUTES[age]
}

export function periodLengthSec(age: AgeGroup, period: PeriodId, minutes?: number): number {
  if (period === 'PSO') return 0
  return (minutes ?? periodMinutes(age)) * 60
}

export function quarterLengthSec(match: Match): number {
  return Math.max(1, match.periodMinutes || periodMinutes(match.ageGroup)) * 60
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

/** Paper-card times look like 5.22 or 5:22 remaining. */
export function parseTimeInput(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const m = t.match(/^(\d+)[:.](\d{1,2})$/)
  if (m) {
    const min = Number(m[1])
    const sec = Number(m[2])
    if (sec > 59) return null
    return min * 60 + sec
  }
  if (/^\d+$/.test(t)) return Number(t)
  return null
}

export function emptyPlayer(partial: Partial<Player> & { cap: string; name: string }): Player {
  return {
    id: partial.id || uid(),
    cap: partial.cap,
    name: partial.name,
    isFillIn: partial.isFillIn ?? false,
    onCard: partial.onCard ?? true,
    present: partial.present ?? true,
    struckOff: partial.struckOff ?? false,
    capGuessed: partial.capGuessed ?? false,
    fouls: [],
    goalsQ1: 0,
    goalsQ2: 0,
    goalsQ3: 0,
    goalsQ4: 0,
    goalsPen: 0,
  }
}

export function emptyTeam(name: string, players: Player[] = []): Team {
  return { name, players, timeouts: [] }
}

export function newMatch(partial: Partial<Match> = {}): Match {
  const age = partial.ageGroup ?? 'U16'
  return {
    id: partial.id || uid(),
    eventName: partial.eventName ?? '',
    stage: partial.stage ?? 'Round',
    venue: partial.venue ?? '',
    grade: partial.grade ?? '16&U',
    date: partial.date ?? new Date().toISOString().slice(0, 10),
    startTime: partial.startTime ?? '18:00',
    ageGroup: age,
    periodMinutes: partial.periodMinutes ?? periodMinutes(age),
    shotClockSec: partial.shotClockSec ?? DEFAULT_SHOT_CLOCK_SEC,
    shotClockShortSec: partial.shotClockShortSec ?? DEFAULT_SHOT_CLOCK_SHORT_SEC,
    shotClockRemainingSec: partial.shotClockRemainingSec ?? (partial.shotClockSec ?? DEFAULT_SHOT_CLOCK_SEC),
    shotClockRunning: partial.shotClockRunning ?? false,
    clockSignal: partial.clockSignal ?? null,
    quarterBreakSec: partial.quarterBreakSec ?? DEFAULT_QUARTER_BREAK_SEC,
    halfTimeBreakSec: partial.halfTimeBreakSec ?? DEFAULT_HALF_TIME_BREAK_SEC,
    breakRemainingSec: partial.breakRemainingSec ?? 0,
    breakRunning: partial.breakRunning ?? false,
    breakKind: partial.breakKind ?? null,
    mode: partial.mode ?? 'ROUND',
    officials: partial.officials ?? {
      referee1: '',
      referee2: '',
      tableSecretary: '',
      timekeeper: '',
    },
    white: partial.white ?? emptyTeam('White'),
    blue: partial.blue ?? emptyTeam('Blue'),
    events: partial.events ?? [],
    lastStrike: partial.lastStrike ?? null,
    currentPeriod: partial.currentPeriod ?? 1,
    clockRemainingSec: partial.clockRemainingSec ?? periodLengthSec(age, 1, partial.periodMinutes),
    clockRunning: false,
    possession: partial.possession ?? null,
    sourceUrl: partial.sourceUrl ?? '',
    comments: partial.comments ?? '',
    finalResult: partial.finalResult ?? '',
    started: partial.started ?? false,
    ended: partial.ended ?? false,
    alerts: [],
    driveSave: partial.driveSave ?? { status: 'idle' },
  }
}

export function teamOf(match: Match, side: Side): Team {
  return side === 'white' ? match.white : match.blue
}

export function otherSide(side: Side): Side {
  return side === 'white' ? 'blue' : 'white'
}

export function findPlayer(team: Team, playerId: string): Player | undefined {
  return team.players.find((p) => p.id === playerId)
}

export function findPlayerByCap(team: Team, cap: string): Player | undefined {
  return team.players.find((p) => p.cap === cap && p.onCard && !p.struckOff)
}

export function onCardCount(team: Team): number {
  return team.players.filter((p) => p.onCard && !p.struckOff).length
}

export function fillInCount(team: Team): number {
  return team.players.filter((p) => p.isFillIn && p.onCard && !p.struckOff).length
}

export function personalFoulCount(player: Player): number {
  return player.fouls.filter((f) => f.code === 'E' || f.code === 'P').length
}

export function isOutForRemainder(player: Player): boolean {
  if (player.struckOff) return true
  if (player.fouls.some((f) => f.code === 'S' || f.code === 'line')) return true
  return personalFoulCount(player) >= MAX_PERSONAL_FOULS
}

export function playerGoalTotal(p: Player): number {
  return p.goalsQ1 + p.goalsQ2 + p.goalsQ3 + p.goalsQ4 + p.goalsPen
}

export function isGoal(code: EventCode): boolean {
  return GOAL_CODES.includes(code)
}

export function runningScoreFromEvents(events: LogEvent[]): { white: number; blue: number } {
  let white = 0
  let blue = 0
  for (const e of events) {
    if (isGoal(e.code)) {
      if (e.side === 'white') white += 1
      else blue += 1
    }
  }
  return { white, blue }
}

export function formatScore(s: { white: number; blue: number }): string {
  return `${s.white}–${s.blue}`
}

function resetPlayerStats(p: Player): Player {
  return {
    ...p,
    fouls: [],
    goalsQ1: 0,
    goalsQ2: 0,
    goalsQ3: 0,
    goalsQ4: 0,
    goalsPen: 0,
  }
}

function addGoal(p: Player, period: PeriodId): Player {
  const n = { ...p }
  if (period === 1) n.goalsQ1 += 1
  else if (period === 2) n.goalsQ2 += 1
  else if (period === 3) n.goalsQ3 += 1
  else if (period === 4) n.goalsQ4 += 1
  else n.goalsPen += 1
  return n
}

function withPlayer(team: Team, playerId: string, fn: (p: Player) => Player): Team {
  return {
    ...team,
    players: team.players.map((p) => (p.id === playerId ? fn(p) : p)),
  }
}

function stampFoul(player: Player, slot: FoulSlot, fillRestWithS = false): Player {
  const fouls = [...player.fouls, slot]
  if (fillRestWithS) {
    const remaining = MAX_PERSONAL_FOULS - fouls.length
    for (let i = 0; i < remaining; i++) {
      fouls.push({ ...slot, code: 'line', eventId: slot.eventId + '-line' + i })
    }
  }
  return { ...player, fouls }
}

/** Dual-write: rebuild player stats + running scores from the chronological log. */
export function rebuild(match: Match): Match {
  let white: Team = {
    ...match.white,
    players: match.white.players.map(resetPlayerStats),
    timeouts: [],
  }
  let blue: Team = {
    ...match.blue,
    players: match.blue.players.map(resetPlayerStats),
    timeouts: [],
  }
  const events: LogEvent[] = []
  let w = 0
  let b = 0

  for (const raw of match.events) {
    const e = { ...raw }
    const team = e.side === 'white' ? white : blue
    const player =
      (e.playerId && findPlayer(team, e.playerId)) || findPlayerByCap(team, e.cap)

    if (isGoal(e.code)) {
      if (e.side === 'white') w += 1
      else b += 1
      e.score = `${w}–${b}`
      if (player) {
        const add = (p: Player) => addGoal(p, e.period)
        if (e.side === 'white') white = withPlayer(white, player.id, add)
        else blue = withPlayer(blue, player.id, add)
      }
    } else {
      e.score = undefined
    }

    if (e.code === 'E' || e.code === 'P' || e.code === 'S') {
      if (player) {
        const slot: FoulSlot = {
          code: e.code === 'S' ? 'S' : e.code,
          period: e.period,
          time: e.time,
          eventId: e.id,
        }
        const apply = (p: Player) => stampFoul(p, slot, e.code === 'S')
        if (e.side === 'white') white = withPlayer(white, player.id, apply)
        else blue = withPlayer(blue, player.id, apply)
      }
    }

    if (e.code === 'TO') {
      const to = { period: e.period, time: e.time, eventId: e.id }
      if (e.side === 'white') white = { ...white, timeouts: [...white.timeouts, to] }
      else blue = { ...blue, timeouts: [...blue.timeouts, to] }
    }

    events.push(e)
  }

  return { ...match, white, blue, events, alerts: [] }
}

export interface LiveExclusion {
  side: Side
  cap: string
  playerId?: string
  remainingSec: number
  eventId: string
}

export function deriveLiveExclusions(match: Match): LiveExclusion[] {
  const live: LiveExclusion[] = []
  const period = match.currentPeriod
  const clock = match.clockRemainingSec
  for (const e of match.events) {
    if (e.period !== period) continue
    if (e.code === 'E') {
      const elapsed = e.timeRemainingSec - clock
      const remainingSec = EXCLUSION_SECONDS - Math.max(0, elapsed)
      if (remainingSec > 0) {
        live.push({
          side: e.side,
          cap: e.cap,
          playerId: e.playerId,
          remainingSec,
          eventId: e.id,
        })
      }
    }
    if (isGoal(e.code)) {
      const conceded = otherSide(e.side)
      for (let i = live.length - 1; i >= 0; i--) {
        if (live[i].side === conceded) live.splice(i, 1)
      }
    }
  }
  return live.filter((x) => x.remainingSec > 0)
}

export function derivePendingPenalty(match: Match): {
  against: Side
  cap: string
  eventId: string
} | null {
  let pending: { against: Side; cap: string; eventId: string } | null = null
  for (const e of match.events) {
    if (e.period !== match.currentPeriod) continue
    if (e.code === 'P') pending = { against: e.side, cap: e.cap, eventId: e.id }
    if (e.code === 'PG' && pending && e.side === otherSide(pending.against)) {
      pending = null
    }
  }
  return pending
}

export interface NewEventInput {
  side: Side
  cap: string
  playerId?: string
  code: EventCode
  timeRemainingSec: number
  period?: PeriodId
  notes?: string
}

function rosterPlayer(match: Match, side: Side, input: NewEventInput): Player | undefined {
  const team = teamOf(match, side)
  if (input.playerId) return findPlayer(team, input.playerId)
  return findPlayerByCap(team, input.cap)
}

export function validateEvent(match: Match, input: NewEventInput): { error?: string; warnings: string[] } {
  const warnings: string[] = []
  const period = input.period ?? match.currentPeriod

  if (period === 'PSO' && match.mode !== 'FINALS') {
    return { error: 'Penalty shoot-out is only logged in MEDAL/FINALS mode.', warnings }
  }

  if (input.code === 'TO') {
    if (match.mode === 'ROUND') {
      return {
        error: 'Timeouts are not permitted in ROUND mode (FNC rounds: 0 timeouts).',
        warnings,
      }
    }
    if (match.possession && match.possession !== input.side) {
      return {
        error: 'Timeouts may only be called by the team in possession.',
        warnings,
      }
    }
    const used = teamOf(match, input.side).timeouts.length
    if (used >= MAX_TIMEOUTS_FINALS) {
      return {
        error: `Maximum ${MAX_TIMEOUTS_FINALS} timeouts per team in MEDAL/FINALS.`,
        warnings,
      }
    }
    return { warnings }
  }

  const player = rosterPlayer(match, input.side, input)
  if (!player) {
    return { error: `No player with cap #${input.cap} on the ${input.side} card.`, warnings }
  }
  if (!player.onCard) {
    return { error: `${player.name} is on the bench — tick them onto the card first.`, warnings }
  }
  if (player.struckOff) {
    return { error: `${player.name} has been struck off and cannot be recorded.`, warnings }
  }

  if (input.code === 'E' || input.code === 'P' || input.code === 'S') {
    if (isOutForRemainder(player)) {
      return {
        error: `RED FLAG: ${player.name} (#${player.cap}) is already out for the remainder. 4th major blocked.`,
        warnings,
      }
    }
    if (
      (input.code === 'E' || input.code === 'P') &&
      personalFoulCount(player) >= MAX_PERSONAL_FOULS
    ) {
      return {
        error: `RED FLAG: ${player.name} (#${player.cap}) already has 3 personal fouls. Blocked.`,
        warnings,
      }
    }
  }

  if (input.code === 'SU') {
    const already = match.events.some((e) => e.period === period && e.code === 'SU')
    if (already) {
      warnings.push('A swim-up is already logged this period. Recording another.')
    }
  }

  if (input.code === 'EG') {
    const live = deriveLiveExclusions(match)
    const defenceHasE = live.some((x) => x.side === otherSide(input.side))
    if (!defenceHasE) {
      warnings.push(
        'EG with no live exclusion on the defence. Record anyway if the referee signalled extra-man goal.',
      )
    }
  }

  if (input.code === 'PG') {
    const pending = derivePendingPenalty(match)
    if (!pending || pending.against !== otherSide(input.side)) {
      warnings.push('PG recorded with no outstanding P against the defence.')
    }
  }

  if (input.code === 'E' || input.code === 'P') {
    const next = personalFoulCount(player) + 1
    if (next >= MAX_PERSONAL_FOULS) {
      warnings.push(
        `RED FLAG: 3rd personal foul on ${player.name} (#${player.cap}) — out for remainder.`,
      )
      if (input.code === 'P') {
        warnings.push('3rd foul is a penalty — substitute immediately (player stays in only until the sub).')
      }
    }
  }

  if (input.code === 'S') {
    warnings.push(`${player.name} (#${player.cap}) suspended — out for remainder. Remaining foul boxes filled.`)
  }

  return { warnings }
}

export function applyEvent(match: Match, input: NewEventInput): ApplyResult {
  const period = input.period ?? match.currentPeriod
  const check = validateEvent(match, input)
  if (check.error) {
    return { ok: false, match, error: check.error, warnings: check.warnings }
  }

  const player = rosterPlayer(match, input.side, input)
  const event: LogEvent = {
    id: uid(),
    period,
    time: formatTime(input.timeRemainingSec),
    timeRemainingSec: input.timeRemainingSec,
    cap: input.cap,
    side: input.side,
    code: input.code,
    playerId: player?.id,
    notes: input.notes,
  }

  let possession = match.possession
  if (input.code === 'E' || input.code === 'P') possession = otherSide(input.side)
  if (isGoal(input.code)) possession = otherSide(input.side)
  if (input.code === 'SU') possession = input.side

  let shotClockRemainingSec = match.shotClockRemainingSec
  let shotClockRunning = match.shotClockRunning
  if (isGoal(input.code) || input.code === 'TO' || input.code === 'P' || input.code === 'E' || input.code === 'SU') {
    shotClockRemainingSec = match.shotClockSec
  }
  // Goals: reset + stop in the same motion so the officer does not tap Stop separately.
  if (isGoal(input.code) || input.code === 'TO') {
    shotClockRunning = false
  }
  const next = rebuild({
    ...match,
    events: [...match.events, event],
    possession,
    alerts: check.warnings,
    shotClockRemainingSec,
    shotClockRunning,
    lastStrike: null,
  })
  return { ok: true, match: next, warnings: check.warnings }
}

export function undoLast(match: Match): Match {
  if (match.lastStrike) {
    const r = unstrike(match, match.lastStrike.side, match.lastStrike.playerId)
    if (!r.ok) return match
    return { ...r.match, lastStrike: null }
  }
  if (match.events.length === 0) return match
  return rebuild({ ...match, events: match.events.slice(0, -1) })
}

export function deleteEvent(match: Match, eventId: string): Match {
  return rebuild({ ...match, events: match.events.filter((e) => e.id !== eventId) })
}

export function editEvent(
  match: Match,
  eventId: string,
  patch: Partial<Pick<LogEvent, 'cap' | 'side' | 'code' | 'time' | 'timeRemainingSec' | 'period' | 'playerId' | 'notes'>>,
): ApplyResult {
  const idx = match.events.findIndex((e) => e.id === eventId)
  if (idx < 0) return { ok: false, match, error: 'Event not found', warnings: [] }
  const events = match.events.map((e) => (e.id === eventId ? { ...e, ...patch } : e))
  const rebuilt = rebuild({ ...match, events })
  return { ok: true, match: rebuilt, warnings: [] }
}

export function tickClock(match: Match, elapsedSec: number): Match {
  if (match.ended) return match
  if (match.breakRunning) {
    const breakRemainingSec = Math.max(0, (match.breakRemainingSec ?? 0) - elapsedSec)
    if (breakRemainingSec <= 0) return advanceFromQuarter({ ...match, breakRemainingSec: 0, breakRunning: false })
    return { ...match, breakRemainingSec }
  }
  let clockRemainingSec = match.clockRemainingSec
  let clockRunning = match.clockRunning
  let shotClockRemainingSec = match.shotClockRemainingSec ?? match.shotClockSec
  let shotClockRunning = match.shotClockRunning
  let clockSignal = match.clockSignal ?? null
  let quarterExpired = false
  if (clockRunning) {
    clockRemainingSec = Math.max(0, clockRemainingSec - elapsedSec)
    if (clockRemainingSec <= 0) {
      clockRunning = false
      shotClockRunning = false
      shotClockRemainingSec = 0
      quarterExpired = true
    }
  }
  if (!quarterExpired && shotClockRunning) {
    shotClockRemainingSec = Math.max(0, shotClockRemainingSec - elapsedSec)
    if (shotClockRemainingSec <= 0) {
      shotClockRunning = false
      clockSignal = newClockSignal('shot')
    }
  }
  const next: Match = {
    ...match,
    clockRemainingSec,
    clockRunning,
    shotClockRemainingSec,
    shotClockRunning,
    clockSignal,
  }
  if (quarterExpired) return endQuarter(next).match
  return next
}

function newClockSignal(kind: ClockSignal['kind']): ClockSignal {
  return { id: uid(), kind }
}

/** Manual Siren: same horn as quarter end, unique id so the board replays it. */
export function signalSiren(match: Match): Match {
  return { ...match, clockSignal: newClockSignal('period') }
}

function clearBreakFields(match: Match): Match {
  return {
    ...match,
    breakRemainingSec: 0,
    breakRunning: false,
    breakKind: null,
  }
}

export function setPeriod(match: Match, period: PeriodId): Match {
  const clockRemainingSec = period === 'PSO' ? 0 : quarterLengthSec(match)
  return clearBreakFields({
    ...match,
    currentPeriod: period,
    clockRemainingSec,
    shotClockRemainingSec: match.shotClockSec,
    clockRunning: false,
    shotClockRunning: false,
  })
}

function nextPeriodId(match: Match): PeriodId | null {
  if (match.currentPeriod === 1) return 2
  if (match.currentPeriod === 2) return 3
  if (match.currentPeriod === 3) return 4
  if (match.currentPeriod === 4 && match.mode === 'FINALS') return 'PSO'
  return null
}

function withQ3AbsentAlert(match: Match): Match {
  if (match.currentPeriod !== 3) return match
  const absent = [...match.white.players, ...match.blue.players].filter(
    (p) => p.onCard && !p.present && !p.struckOff,
  )
  if (!absent.length) return match
  return {
    ...match,
    alerts: [
      ...match.alerts,
      `Start of Q3: strike off players not present: ${absent.map((p) => `#${p.cap} ${p.name}`).join(', ')}`,
    ],
  }
}

function endMatch(match: Match): Match {
  const score = runningScoreFromEvents(match.events)
  return clearBreakFields({
    ...match,
    ended: true,
    clockRunning: false,
    shotClockRunning: false,
    finalResult: `${match.white.name} ${score.white} – ${score.blue} ${match.blue.name}`,
  })
}

function breakForNextPeriod(match: Match, nextPeriod: PeriodId): { kind: BreakKind; sec: number } | null {
  if (nextPeriod === 2 || nextPeriod === 4) {
    const sec = match.quarterBreakSec ?? 0
    if (sec <= 0) return null
    return { kind: 'quarter', sec }
  }
  if (nextPeriod === 3) {
    const sec = match.halfTimeBreakSec ?? 0
    if (sec <= 0) return null
    return { kind: 'half', sec }
  }
  return null
}

function startBreak(match: Match, kind: BreakKind, sec: number): Match {
  return {
    ...match,
    clockRemainingSec: 0,
    clockRunning: false,
    shotClockRunning: false,
    breakKind: kind,
    breakRemainingSec: sec,
    breakRunning: true,
  }
}

function advanceFromQuarter(match: Match): Match {
  const nextPeriod = nextPeriodId(match)
  if (nextPeriod == null) return endMatch(match)
  return withQ3AbsentAlert(setPeriod(match, nextPeriod))
}

export function endQuarter(match: Match): { match: Match; check: ReconcileResult } {
  const signalled = { ...match, clockSignal: newClockSignal('period') }
  const check = reconcile(signalled)
  if (signalled.breakKind) {
    return { match: advanceFromQuarter(signalled), check }
  }
  const nextPeriod = nextPeriodId(signalled)
  if (nextPeriod == null) {
    return { match: endMatch(signalled), check }
  }
  const brk = breakForNextPeriod(signalled, nextPeriod)
  if (brk) {
    return { match: startBreak(signalled, brk.kind, brk.sec), check }
  }
  return { match: advanceFromQuarter(signalled), check }
}

export interface ReconcileResult {
  ok: boolean
  issues: string[]
  logGoals: { white: number; blue: number }
  playerGoals: { white: number; blue: number }
  logFouls: { white: number; blue: number }
  playerFouls: { white: number; blue: number }
}

function foulEvents(code: EventCode): boolean {
  return code === 'E' || code === 'P' || code === 'S'
}

export function reconcile(match: Match): ReconcileResult {
  const issues: string[] = []
  const logGoals = runningScoreFromEvents(match.events)
  const playerGoals = {
    white: match.white.players.reduce((s, p) => s + playerGoalTotal(p), 0),
    blue: match.blue.players.reduce((s, p) => s + playerGoalTotal(p), 0),
  }
  const logFouls = {
    white: match.events.filter((e) => e.side === 'white' && foulEvents(e.code)).length,
    blue: match.events.filter((e) => e.side === 'blue' && foulEvents(e.code)).length,
  }
  const slotCount = (t: Team) =>
    t.players.reduce((s, p) => s + p.fouls.filter((f) => f.code !== 'line').length, 0)
  const playerFouls = { white: slotCount(match.white), blue: slotCount(match.blue) }

  if (logGoals.white !== playerGoals.white) {
    issues.push(`White goals: log ${logGoals.white} vs player totals ${playerGoals.white}`)
  }
  if (logGoals.blue !== playerGoals.blue) {
    issues.push(`Blue goals: log ${logGoals.blue} vs player totals ${playerGoals.blue}`)
  }
  if (logFouls.white !== playerFouls.white) {
    issues.push(`White majors: log ${logFouls.white} vs player slots ${playerFouls.white}`)
  }
  if (logFouls.blue !== playerFouls.blue) {
    issues.push(`Blue majors: log ${logFouls.blue} vs player slots ${playerFouls.blue}`)
  }
  for (const side of ['white', 'blue'] as Side[]) {
    const n = onCardCount(teamOf(match, side))
    if (n > MAX_ON_CARD) issues.push(`${side} has ${n} on the card (max ${MAX_ON_CARD})`)
    const f = fillInCount(teamOf(match, side))
    if (f > MAX_FILL_INS) issues.push(`${side} has ${f} fill-ins (max ${MAX_FILL_INS})`)
  }
  return { ok: issues.length === 0, issues, logGoals, playerGoals, logFouls, playerFouls }
}

export function strikeOff(match: Match, side: Side, playerId: string): Match {
  const team = teamOf(match, side)
  const players = team.players.map((p) =>
    p.id === playerId ? { ...p, struckOff: true, present: false, onCard: false } : p,
  )
  const lastStrike = { side, playerId }
  if (side === 'white') return { ...match, white: { ...team, players }, lastStrike }
  return { ...match, blue: { ...team, players }, lastStrike }
}

export function unstrike(match: Match, side: Side, playerId: string): ApplyResult {
  const team = teamOf(match, side)
  const player = findPlayer(team, playerId)
  if (!player) return { ok: false, match, error: 'Player not found', warnings: [] }
  if (!player.struckOff) {
    const lastStrike =
      match.lastStrike?.side === side && match.lastStrike.playerId === playerId ? null : match.lastStrike
    return { ok: true, match: lastStrike === match.lastStrike ? match : { ...match, lastStrike }, warnings: [] }
  }
  const others = team.players.filter((p) => p.id !== playerId && p.onCard && !p.struckOff)
  if (others.length >= MAX_ON_CARD) {
    return { ok: false, match, error: `Max ${MAX_ON_CARD} players on the card.`, warnings: [] }
  }
  if (player.isFillIn && fillInCount(team) >= MAX_FILL_INS) {
    return { ok: false, match, error: `Max ${MAX_FILL_INS} fill-ins on the card.`, warnings: [] }
  }
  const players = team.players.map((p) =>
    p.id === playerId ? { ...p, struckOff: false, present: true, onCard: true } : p,
  )
  let next: Match = side === 'white' ? { ...match, white: { ...team, players } } : { ...match, blue: { ...team, players } }
  if (next.lastStrike?.side === side && next.lastStrike.playerId === playerId) {
    next = { ...next, lastStrike: null }
  }
  return { ok: true, match: next, warnings: [] }
}

export function setPresent(match: Match, side: Side, playerId: string, present: boolean): Match {
  const team = teamOf(match, side)
  const players = team.players.map((p) => (p.id === playerId ? { ...p, present } : p))
  if (side === 'white') return { ...match, white: { ...team, players } }
  return { ...match, blue: { ...team, players } }
}

export function setOnCard(match: Match, side: Side, playerId: string, onCard: boolean): ApplyResult {
  const team = teamOf(match, side)
  const player = findPlayer(team, playerId)
  if (!player) return { ok: false, match, error: 'Player not found', warnings: [] }
  if (onCard) {
    const others = team.players.filter((p) => p.id !== playerId && p.onCard && !p.struckOff)
    if (others.length >= MAX_ON_CARD) {
      return { ok: false, match, error: `Max ${MAX_ON_CARD} players on the card.`, warnings: [] }
    }
    if (player.isFillIn && fillInCount(team) >= MAX_FILL_INS) {
      return { ok: false, match, error: `Max ${MAX_FILL_INS} fill-ins on the card.`, warnings: [] }
    }
  }
  const players = team.players.map((p) => (p.id === playerId ? { ...p, onCard } : p))
  const next = side === 'white' ? { ...match, white: { ...team, players } } : { ...match, blue: { ...team, players } }
  return { ok: true, match: next, warnings: [] }
}

export function inferPossessionAfter(match: Match): Side | null {
  const last = [...match.events].reverse()[0]
  if (!last) return match.possession
  if (last.code === 'E' || last.code === 'P' || isGoal(last.code)) return otherSide(last.side)
  if (last.code === 'TO' || last.code === 'SU') return last.side
  return match.possession
}

export function timeoutAllowance(mode: Match['mode']): number {
  return mode === 'FINALS' ? MAX_TIMEOUTS_FINALS : 0
}

export function quarterGoalLine(team: Team): number[] {
  const q = [0, 0, 0, 0, 0]
  for (const p of team.players) {
    q[0] += p.goalsQ1
    q[1] += p.goalsQ2
    q[2] += p.goalsQ3
    q[3] += p.goalsQ4
    q[4] += p.goalsPen
  }
  return q
}

export function setupIssues(match: Match): string[] {
  const issues: string[] = []
  if (!match.eventName.trim()) issues.push('Event name is required')
  if (!match.white.name.trim() || !match.blue.name.trim()) issues.push('Both team names are required')
  for (const side of ['white', 'blue'] as Side[]) {
    const team = teamOf(match, side)
    const card = team.players.filter((p) => p.onCard && !p.struckOff)
    if (card.length === 0) issues.push(`${team.name || side}: add at least one player on the card`)
    if (card.length > MAX_ON_CARD) issues.push(`${team.name || side}: max ${MAX_ON_CARD} on the card`)
    if (fillInCount(team) > MAX_FILL_INS) issues.push(`${team.name || side}: max ${MAX_FILL_INS} fill-ins`)
    const caps = card.map((p) => p.cap)
    const dup = caps.filter((c, i) => caps.indexOf(c) !== i)
    if (dup.length) issues.push(`${team.name || side}: duplicate cap ${dup[0]}`)
    for (const p of card) {
      if (!p.cap.trim() || !p.name.trim()) issues.push(`${team.name || side}: every on-card player needs a cap and name`)
    }
  }
  return issues
}

/** TODO: integrate physical scoreboards (Omega / Daktronics / club LED) — out of scope for v1. */
export function pushToPhysicalScoreboard(_match: Match): void {
  // TODO: physical scoreboard integration
}
