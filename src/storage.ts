import {
  ADMIN_STORAGE_KEY,
  AGE_PERIOD_MINUTES,
  DEFAULT_DRIVE_FOLDER_ID,
  DEFAULT_DRIVE_FOLDER_URL,
  DEFAULT_GOOGLE_CLIENT_ID,
  DEFAULT_HALF_TIME_BREAK_SEC,
  DEFAULT_QUARTER_BREAK_SEC,
  DEFAULT_SHOT_CLOCK_SEC,
  DEFAULT_SHOT_CLOCK_SHORT_SEC,
  STORAGE_KEY,
  type AdminSettings,
  type Match,
} from './types'
import { parseDriveFolderId } from './driveFolder'

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
    return {
      ...fallback,
      ...parsed,
      driveFolderUrl: folderUrl,
      driveFolderId: parsedId,
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

export function loadMatch(): Match | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const m = JSON.parse(raw) as Match
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
    return m
  } catch {
    return null
  }
}

export function saveMatch(match: Match): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(match))
  } catch {
    /* quota / private mode */
  }
}

/** Clears the MATCH key only. Admin settings (Drive folder, client ID, clock defaults) stay. */
export function clearMatch(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
