import {
  ADMIN_STORAGE_KEY,
  AGE_PERIOD_MINUTES,
  DEFAULT_DRIVE_FOLDER_ID,
  DEFAULT_DRIVE_FOLDER_URL,
  RETIRED_AJWP_POC_FOLDER_ID,
  DEFAULT_GOOGLE_CLIENT_ID,
  DEFAULT_HALF_TIME_BREAK_SEC,
  DEFAULT_QUARTER_BREAK_SEC,
  DEFAULT_SHOT_CLOCK_SEC,
  DEFAULT_SHOT_CLOCK_SHORT_SEC,
  STORAGE_KEY,
  type AdminSettings,
  type Match,
  type Player,
  type Team,
} from './types'
import { parseDriveFolderId } from './driveFolder'
import { emptyTeam } from './engine'

export function defaultAdmin(): AdminSettings {
  return {
    driveFolderId: DEFAULT_DRIVE_FOLDER_ID,
    driveFolderUrl: DEFAULT_DRIVE_FOLDER_URL,
    googleClientId: DEFAULT_GOOGLE_CLIENT_ID,
    ageGroup: 'U16',
    periodMinutes: AGE_PERIOD_MINUTES.U16,
    shotClockSec: DEFAULT_SHOT_CLOCK_SEC,
    shotClockShortSec: DEFAULT_SHOT_CLOCK_SHORT_SEC,
    quarterBreakSec: DEFAULT_QUARTER_BREAK_SEC,
    halfTimeBreakSec: DEFAULT_HALF_TIME_BREAK_SEC,
    mode: 'ROUND',
  }
}

export function loadAdmin(): AdminSettings {
  const fallback = defaultAdmin()
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<AdminSettings>
    const folderUrl = parsed.driveFolderUrl || fallback.driveFolderUrl
    const parsedId = parseDriveFolderId(folderUrl) || parsed.driveFolderId || fallback.driveFolderId
    const retired = parsedId === RETIRED_AJWP_POC_FOLDER_ID
    return {
      ...fallback,
      ...parsed,
      driveFolderUrl: retired ? fallback.driveFolderUrl : folderUrl,
      driveFolderId: retired ? fallback.driveFolderId : parsedId,
      googleClientId: parsed.googleClientId || fallback.googleClientId,
      ageGroup: parsed.ageGroup ?? fallback.ageGroup,
      periodMinutes: parsed.periodMinutes ?? fallback.periodMinutes,
      shotClockSec: parsed.shotClockSec ?? fallback.shotClockSec,
      shotClockShortSec: parsed.shotClockShortSec ?? fallback.shotClockShortSec,
      quarterBreakSec: parsed.quarterBreakSec ?? fallback.quarterBreakSec,
      halfTimeBreakSec: parsed.halfTimeBreakSec ?? fallback.halfTimeBreakSec,
      mode: parsed.mode ?? fallback.mode,
    }
  } catch {
    return fallback
  }
}

export function saveAdmin(settings: AdminSettings): void {
  try {
    localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* quota / private mode */
  }
}

function normalizePlayer(p: Player): Player {
  return {
    ...p,
    fouls: Array.isArray(p.fouls) ? p.fouls : [],
    goalsQ1: p.goalsQ1 ?? 0,
    goalsQ2: p.goalsQ2 ?? 0,
    goalsQ3: p.goalsQ3 ?? 0,
    goalsQ4: p.goalsQ4 ?? 0,
    goalsPen: p.goalsPen ?? 0,
    onCard: p.onCard ?? true,
    present: p.present ?? true,
    struckOff: p.struckOff ?? false,
    isFillIn: p.isFillIn ?? false,
    capGuessed: p.capGuessed ?? false,
    cap: p.cap ?? '',
    name: p.name ?? '',
  }
}

function normalizeTeam(team: Team | undefined, fallbackName: string): Team {
  if (!team || !Array.isArray(team.players)) {
    return { ...emptyTeam(team?.name || fallbackName), ...(team?.revsportId ? { revsportId: team.revsportId } : {}) }
  }
  return {
    ...team,
    name: team.name || fallbackName,
    players: team.players.map(normalizePlayer),
    timeouts: Array.isArray(team.timeouts) ? team.timeouts : [],
  }
}

export function loadMatch(): Match | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const m = JSON.parse(raw) as Match
    if (!m || typeof m !== 'object') return null
    if (!m.sourceUrl) m.sourceUrl = ''
    if (!m.periodMinutes) m.periodMinutes = AGE_PERIOD_MINUTES[m.ageGroup] ?? 8
    if (!m.shotClockSec) m.shotClockSec = 28
    if (!m.shotClockShortSec) m.shotClockShortSec = 18
    if (m.shotClockRemainingSec == null) m.shotClockRemainingSec = m.shotClockSec
    if (m.shotClockRunning == null) m.shotClockRunning = false
    if (m.quarterBreakSec == null) m.quarterBreakSec = DEFAULT_QUARTER_BREAK_SEC
    if (m.halfTimeBreakSec == null) m.halfTimeBreakSec = DEFAULT_HALF_TIME_BREAK_SEC
    if (m.breakRemainingSec == null) m.breakRemainingSec = 0
    if (m.breakRunning == null) m.breakRunning = false
    if (m.breakKind === undefined) m.breakKind = null
    if (!m.driveSave) m.driveSave = { status: m.ended ? 'idle' : 'idle' }
    if (!Array.isArray(m.events)) m.events = []
    if (!Array.isArray(m.alerts)) m.alerts = []
    m.white = normalizeTeam(m.white, 'White')
    m.blue = normalizeTeam(m.blue, 'Blue')
    return m
  } catch {
    return null
  }
}

/** Fields that matter if the phone dies. Clock seconds alone do not. */
function durableMatchKey(match: Match): string {
  const card = (t: Team) =>
    t.players
      .map((p) =>
        [
          p.id,
          p.cap,
          p.name,
          p.onCard ? 1 : 0,
          p.present ? 1 : 0,
          p.struckOff ? 1 : 0,
          p.fouls.map((f) => f.eventId).join('.'),
          p.goalsQ1,
          p.goalsQ2,
          p.goalsQ3,
          p.goalsQ4,
          p.goalsPen,
        ].join(':'),
      )
      .join(',')
  return [
    match.id,
    match.events.map((e) => `${e.id}:${e.code}:${e.cap}:${e.side}:${e.time}:${e.period}`).join(','),
    match.clockRunning ? 1 : 0,
    match.clockStarted ? 1 : 0,
    match.shotClockRunning ? 1 : 0,
    match.breakRunning ? 1 : 0,
    match.breakKind ?? '',
    match.currentPeriod,
    match.ended ? 1 : 0,
    match.started ? 1 : 0,
    match.possession ?? '',
    match.white.name,
    match.blue.name,
    card(match.white),
    card(match.blue),
    match.driveSave?.status ?? '',
    match.alerts.join('|'),
    match.clockSignal?.id ?? '',
  ].join('~')
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingMatch: Match | null = null
let lastDurable = ''

function writeMatch(match: Match): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(match))
  } catch {
    /* quota / private mode */
  }
}

export function saveMatch(match: Match): void {
  pendingMatch = match
  const key = durableMatchKey(match)
  if (key !== lastDurable) {
    lastDurable = key
    if (saveTimer != null) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    writeMatch(match)
    return
  }
  // Clock ticks rewrite the same game 4 times a second. One write a second is enough.
  if (saveTimer != null) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    if (pendingMatch) writeMatch(pendingMatch)
  }, 1000)
}

function flushPendingMatch(): void {
  if (saveTimer != null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (pendingMatch) writeMatch(pendingMatch)
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingMatch)
}

/** Clears the MATCH key only. Admin settings (Drive folder, client ID, clock defaults) stay. */
export function clearMatch(): void {
  pendingMatch = null
  lastDurable = ''
  if (saveTimer != null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
