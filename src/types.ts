export type Side = 'white' | 'blue'

export type EventCode = 'G' | 'P' | 'PG' | 'E' | 'EG' | 'S' | 'TO' | 'SU'

export type AgeGroup = 'U12' | 'U13' | 'U14' | 'U15' | 'U16' | 'U17' | 'U18'

export type MatchMode = 'ROUND' | 'FINALS'

export type PeriodId = 1 | 2 | 3 | 4 | 'PSO'

export type BreakKind = 'quarter' | 'half'

export type FoulCode = 'E' | 'P' | 'S' | 'line'

export interface Officials {
  referee1: string
  referee2: string
  tableSecretary: string
  timekeeper: string
}

export interface FoulSlot {
  code: FoulCode
  period: PeriodId
  time: string
  eventId: string
}

export interface Player {
  id: string
  cap: string
  name: string
  isFillIn: boolean
  onCard: boolean
  present: boolean
  struckOff: boolean
  capGuessed: boolean
  fouls: FoulSlot[]
  goalsQ1: number
  goalsQ2: number
  goalsQ3: number
  goalsQ4: number
  goalsPen: number
}

export interface Team {
  name: string
  players: Player[]
  timeouts: { period: PeriodId; time: string; eventId: string }[]
}

export interface LogEvent {
  id: string
  period: PeriodId
  time: string
  timeRemainingSec: number
  cap: string
  side: Side
  code: EventCode
  playerId?: string
  score?: string
  notes?: string
}

export interface Match {
  id: string
  eventName: string
  stage: string
  venue: string
  grade: string
  date: string
  startTime: string
  ageGroup: AgeGroup
  periodMinutes: number
  shotClockSec: number
  shotClockShortSec: number
  shotClockRemainingSec: number
  shotClockRunning: boolean
  mode: MatchMode
  officials: Officials
  white: Team
  blue: Team
  events: LogEvent[]
  lastStrike?: { side: Side; playerId: string } | null
  currentPeriod: PeriodId
  clockRemainingSec: number
  clockRunning: boolean
  quarterBreakSec: number
  halfTimeBreakSec: number
  breakRemainingSec: number
  breakRunning: boolean
  breakKind: BreakKind | null
  possession: Side | null
  sourceUrl: string
  comments: string
  finalResult: string
  started: boolean
  ended: boolean
  alerts: string[]
  driveSave?: DriveSave
}

export type DriveSaveStatus = 'idle' | 'saving' | 'verified' | 'error'

export interface DriveSave {
  status: DriveSaveStatus
  error?: string
  logFileId?: string
  summaryFileId?: string
  logUrl?: string
  summaryUrl?: string
  savedAt?: string
}

export interface AdminSettings {
  driveFolderId: string
  driveFolderUrl: string
  googleClientId: string
  lastEmail?: string
  lastSaveAt?: string
  lastSaveLogUrl?: string
  lastSaveSummaryUrl?: string
  ageGroup: AgeGroup
  periodMinutes: number
  shotClockSec: number
  shotClockShortSec: number
  quarterBreakSec: number
  halfTimeBreakSec: number
  mode: MatchMode
}

export interface ApplyResult {
  ok: boolean
  match: Match
  error?: string
  warnings: string[]
}

export const LEGEND: { code: EventCode; label: string; tip: string }[] = [
  { code: 'G', label: 'Goal (even strength)', tip: 'Even-strength goal. Tap the scorer, then G. Only if the referee awards it. Score is always White–Blue.' },
  { code: 'P', label: 'Penalty foul', tip: 'Penalty foul. Personal foul — player stays in the water. Counts toward 3 majors. Then log PG if the throw is scored.' },
  { code: 'PG', label: 'Penalty Goal', tip: 'Goal from a penalty throw. Tap the shooter, then PG. Log the P against the fouler first if you have not already.' },
  { code: 'E', label: 'Exclusion Foul', tip: 'Exclusion. Personal foul. Player sits 18 seconds of actual play. Third major (E or P) and they are out for the rest of the game.' },
  { code: 'EG', label: 'Exclusion Goal', tip: 'Extra-man goal, scored while the defence has someone excluded. Tap the scorer, then EG.' },
  { code: 'S', label: 'Suspension', tip: 'Game exclusion with substitute (misconduct). Player is done. Remaining foul boxes are lined off. Referee report after.' },
  { code: 'TO', label: 'Time Out', tip: 'Timeout. Round games: none. Medal/finals: 2 per team, 1 minute, only when that team has the ball.' },
  { code: 'SU', label: 'Swim Up', tip: 'Swim-up. Tap the player who won the ball at the start of the quarter. Sets possession to that team and resets the shot clock.' },
]

export const AGE_PERIOD_MINUTES: Record<AgeGroup, number> = {
  U12: 6,
  U13: 7,
  U14: 7,
  U15: 8,
  U16: 8,
  U17: 8,
  U18: 8,
}

export const EXCLUSION_SECONDS = 18
export const TIMEOUT_SECONDS = 60
export const DEFAULT_SHOT_CLOCK_SEC = 28
export const DEFAULT_SHOT_CLOCK_SHORT_SEC = 18
export const DEFAULT_QUARTER_BREAK_SEC = 60
export const DEFAULT_HALF_TIME_BREAK_SEC = 120
export const MAX_ON_CARD = 10
export const MAX_FILL_INS = 3
export const MAX_PERSONAL_FOULS = 3
export const MAX_TIMEOUTS_FINALS = 2
export const STORAGE_KEY = 'wpq-scorecard-v1'
export const ADMIN_STORAGE_KEY = 'ajwp-scorecard-admin-v1'
export const DEFAULT_DRIVE_FOLDER_ID = '1zoopKHp_dBAtYVKHSmD-MUjkkZ3cOp8Z'
export const DEFAULT_DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1zoopKHp_dBAtYVKHSmD-MUjkkZ3cOp8Z'
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const DEFAULT_GOOGLE_CLIENT_ID = '251564153707-4d57t4mdibcq9ulvehk7k0jrkgovbm3b.apps.googleusercontent.com'

/** POC only. Set false (or delete the buttons) before a real game. */
export const TEST_NUKE_GAME = true

/** Flip true at go-live so a competition listing auto-picks the most likely round/game for today. */
export const PICK_FIXTURES_BY_TODAY = false

export const GOAL_CODES: EventCode[] = ['G', 'EG', 'PG']
export const PERSONAL_FOUL_CODES: EventCode[] = ['E', 'P']
