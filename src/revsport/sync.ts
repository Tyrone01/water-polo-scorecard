/**
 * Live FNC / RevSport fixture sync — public HTML via /api/revsport (no API key).
 * Source of truth: fncwaterpolo.org.au games hub → grades → rounds → games.
 */

import { AGE_PERIOD_MINUTES, type AgeGroup, type Match, type MatchMode } from '../types'
import { newMatch, periodLengthSec } from '../engine'
import {
  assignSidesById,
  importMetaPatch,
  importedTeamToTeam,
  placeholderTeam,
  revsportRefFrom,
} from '../importApply'
import { expandPendingRounds, fetchRevSport, rosterMissingNote, type Result } from './client'
import type { RevSportClubId } from './clubs'
import { AJWP_VENUE_NIGHT_RULE, compDecision, compDecisionNote, type CompRule } from './compIds'
import { sydneyTodayISO } from './dates'
import { competitionIdFromUrl, gameIdFromUrl, teamIdFromUrl } from './ids'
import type { ImportedGame, ImportedGrade } from './parser'

export const FNC_GAMES_HUB = 'https://www.fncwaterpolo.org.au/games'
export const AJWP_GAMES_HUB = 'https://www.revolutionise.com.au/ajwp/games'

/** Which association a live game came from (shown on the game list and the TV meta line). */
export type LiveSource = 'FNC' | 'AJWP'

export interface LiveCompetition {
  /** Path id e.g. "27800/3790" (competition / grade) */
  id: string
  /** RevSport competition id, e.g. "27800" */
  competitionId?: string
  label: string
  competition: string
  grade: string
  url: string
}

export interface LiveGame {
  id: string
  home: string
  away: string
  date?: string
  time?: string
  /** Short name from fixture card (pool name). */
  venueName: string
  detailsUrl: string
  homeTeamUrl?: string
  awayTeamUrl?: string
  competition?: string
  grade?: string
  round?: string
  referees?: string
  /** RevSport ids. Home plays White, away plays Blue. */
  competitionId?: string
  homeTeamId?: string
  awayTeamId?: string
  /** Set by the venue-night sync when more than one association is loaded. */
  source?: LiveSource
}

export interface HeldBackCompetition {
  competitionId?: string
  label: string
  url: string
  reason: 'excluded' | 'not-listed'
}

export interface LiveVenue {
  id: string
  name: string
  shortName: string
  games: LiveGame[]
}

export interface SyncSnapshot {
  hubUrl: string
  fetchedAt: string
  eventName: string
  competitions: LiveCompetition[]
  games: LiveGame[]
  venues: LiveVenue[]
  /** Competitions on the hub that were not loaded (by RevSport id). */
  heldBack: HeldBackCompetition[]
  warnings: string[]
  error?: string
}

export function inferAgeGroup(grade: string): AgeGroup {
  const m = grade.match(/(\d{1,2})\s*&?\s*U\b/i) || grade.match(/\bU\s*(\d{1,2})\b/i)
  if (m) {
    const key = `U${Number(m[1])}` as AgeGroup
    if (key in AGE_PERIOD_MINUTES) return key
  }
  return 'U18'
}

export function inferMode(stage: string): MatchMode {
  return /final|medal|semi|prelim/i.test(stage) ? 'FINALS' : 'ROUND'
}

export function venueSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/aquatic centre|indoor pool|pool|leisure centre/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'venue'
}

export function shortVenueName(name: string): string {
  const cleaned = name
    .replace(/,.*$/, '')
    .replace(/\s+(Aquatic Centre|Indoor Pool|Pool|Leisure Centre)\s*$/i, '')
    .trim()
  return cleaned || name
}

function gradePathId(url: string): string {
  const m = url.match(/\/games\/(\d+\/\d+)/i)
  return m ? m[1] : venueSlug(url)
}

function toLiveGame(g: ImportedGame, meta: { competition?: string; grade?: string; round?: string }): LiveGame {
  const gameId = g.gameId || gameIdFromUrl(g.detailsUrl)
  const homeTeamId = g.homeTeamId || teamIdFromUrl(g.homeTeamUrl)
  const awayTeamId = g.awayTeamId || teamIdFromUrl(g.awayTeamUrl)
  const competitionId = g.competitionId || competitionIdFromUrl(g.homeTeamUrl)
  return {
    id: gameId || g.detailsUrl,
    home: g.home,
    away: g.away,
    date: g.date,
    time: g.time,
    venueName: (g.venue || 'Venue TBA').trim(),
    detailsUrl: g.detailsUrl,
    homeTeamUrl: g.homeTeamUrl,
    awayTeamUrl: g.awayTeamUrl,
    competition: meta.competition,
    grade: meta.grade,
    round: g.round || meta.round,
    referees: g.referees,
    ...(competitionId ? { competitionId } : {}),
    ...(homeTeamId ? { homeTeamId } : {}),
    ...(awayTeamId ? { awayTeamId } : {}),
  }
}

export function groupGamesByVenue(games: LiveGame[]): LiveVenue[] {
  const map = new Map<string, LiveVenue>()
  for (const g of games) {
    const id = venueSlug(g.venueName)
    const existing = map.get(id)
    if (existing) {
      existing.games.push(g)
      continue
    }
    map.set(id, {
      id,
      name: g.venueName,
      shortName: shortVenueName(g.venueName),
      games: [g],
    })
  }
  return [...map.values()].sort((a, b) => a.shortName.localeCompare(b.shortName))
}

function gradesFromHub(hub: Result, hubUrl: string): ImportedGrade[] {
  if (hub.grades?.length) return hub.grades
  // Hub URL itself is a grade listing (rounds / games already present).
  if (hub.games?.length || hub.rounds?.length || hub.roundUrls?.length) {
    return [
      {
        url: hubUrl,
        label: [hub.competition, hub.grade].filter(Boolean).join(' · ') || hub.heading || 'Fixtures',
      },
    ]
  }
  return []
}

async function loadGradeGames(grade: ImportedGrade): Promise<{
  games: LiveGame[]
  competition: string
  gradeLabel: string
  warnings: string[]
  error?: string
}> {
  let result = await fetchRevSport(grade.url)
  if (result.fetchError) {
    return {
      games: [],
      competition: '',
      gradeLabel: grade.label,
      warnings: [],
      error: result.fetchError,
    }
  }
  if (result.pendingRoundUrls?.length) {
    result = await expandPendingRounds(result)
  }
  const competition = result.competition || ''
  const gradeLabel = result.grade || grade.label
  const games = (result.games || []).map((g) =>
    toLiveGame(g, { competition, grade: gradeLabel, round: result.round }),
  )
  return {
    games,
    competition,
    gradeLabel,
    warnings: result.warnings || [],
  }
}

/**
 * Games from today (Sydney) onwards, so last week's games are not listed next to
 * tonight's. If nothing is ahead (end of season), every game stays listed.
 */
export function gamesFromToday(games: LiveGame[], todayISO = sydneyTodayISO()): LiveGame[] {
  const ahead = games.filter((g) => !g.date || g.date >= todayISO)
  return ahead.length ? ahead : games
}

/** Split hub grades into the ones to load and the ones held back, by RevSport competition id only. */
export function filterGradesById(
  grades: ImportedGrade[],
  club: RevSportClubId | '',
  rule?: CompRule,
): { load: ImportedGrade[]; heldBack: HeldBackCompetition[] } {
  const load: ImportedGrade[] = []
  const heldBack: HeldBackCompetition[] = []
  for (const g of grades) {
    const competitionId = competitionIdFromUrl(g.url)
    const decision = compDecision(club, competitionId, rule)
    if (decision === 'load') load.push(g)
    else heldBack.push({ competitionId, label: g.label, url: g.url, reason: decision })
  }
  return { load, heldBack }
}

/** Fetch all FNC competitions / grades / fixtures and group by venue. */
export async function syncFncLive(
  hubUrl = FNC_GAMES_HUB,
  club: RevSportClubId | '' = 'FNC',
  rule?: CompRule,
): Promise<SyncSnapshot> {
  const fetchedAt = new Date().toISOString()
  const warnings: string[] = []
  const hub = await fetchRevSport(hubUrl)
  if (hub.fetchError) {
    return {
      hubUrl,
      fetchedAt,
      eventName: 'Far North Coast Water Polo',
      competitions: [],
      games: [],
      venues: [],
      heldBack: [],
      warnings,
      error: hub.fetchError,
    }
  }

  const allGrades = gradesFromHub(hub, hubUrl)
  const { load: grades, heldBack } = filterGradesById(allGrades, club, rule)
  for (const h of heldBack) warnings.push(compDecisionNote(h.reason, h.competitionId, h.label))
  if (!grades.length) {
    const none = allGrades.length
      ? 'None of the competitions on the games page are on the scorecard\'s list.'
      : 'No competitions/grades found on the FNC games hub.'
    return {
      hubUrl,
      fetchedAt,
      eventName: hub.competition || hub.heading || 'Far North Coast Water Polo',
      competitions: [],
      games: [],
      venues: [],
      heldBack,
      warnings: [...warnings, ...(hub.warnings || []), none],
      error: allGrades.length ? none : 'No grades found',
    }
  }

  const competitions: LiveCompetition[] = []
  const games: LiveGame[] = []
  const seenGame = new Set<string>()

  for (const grade of grades) {
    const loaded = await loadGradeGames(grade)
    if (loaded.error) {
      warnings.push(`${grade.label}: ${loaded.error}`)
      continue
    }
    warnings.push(...loaded.warnings)
    const label =
      [loaded.competition, loaded.gradeLabel].filter(Boolean).join(' · ') || grade.label
    const competitionId = competitionIdFromUrl(grade.url)
    competitions.push({
      id: gradePathId(grade.url),
      ...(competitionId ? { competitionId } : {}),
      label,
      competition: loaded.competition || hub.competition || '',
      grade: loaded.gradeLabel,
      url: grade.url,
    })
    for (const g of loaded.games) {
      if (seenGame.has(g.id)) continue
      seenGame.add(g.id)
      games.push(g)
    }
  }

  const eventName =
    competitions.length === 1
      ? competitions[0].label
      : hub.competition || 'Far North Coast Water Polo'

  return {
    hubUrl,
    fetchedAt,
    eventName,
    competitions,
    games,
    venues: groupGamesByVenue(gamesFromToday(games)),
    heldBack,
    warnings: warnings.filter(Boolean),
  }
}

/**
 * Pool game lists: FNC (27800, 27655) plus AJWP Friday nights (28040, 28041), loaded in
 * parallel and merged. Competitions are picked by RevSport id only. Games are de-duplicated
 * by RevSport game id. An AJWP failure only adds a warning, so the FNC list still shows.
 */
export async function syncVenueNightLive(): Promise<SyncSnapshot> {
  const [fnc, ajwp] = await Promise.all([
    syncFncLive(FNC_GAMES_HUB, 'FNC'),
    syncFncLive(AJWP_GAMES_HUB, 'AJWP', AJWP_VENUE_NIGHT_RULE),
  ])
  return mergeVenueNightSnapshots([
    { source: 'FNC', snap: fnc },
    { source: 'AJWP', snap: ajwp },
  ])
}

export function mergeVenueNightSnapshots(
  parts: { source: LiveSource; snap: SyncSnapshot }[],
  todayISO = sydneyTodayISO(),
): SyncSnapshot {
  const games: LiveGame[] = []
  const seen = new Set<string>()
  const competitions: LiveCompetition[] = []
  const heldBack: HeldBackCompetition[] = []
  const warnings: string[] = []
  const errors: string[] = []
  const loaded: LiveSource[] = []
  for (const { source, snap } of parts) {
    if (snap.error && !snap.games.length) {
      errors.push(`${source}: ${snap.error}`)
      continue
    }
    if (snap.games.length) loaded.push(source)
    competitions.push(...snap.competitions)
    heldBack.push(...snap.heldBack)
    warnings.push(...snap.warnings.map((w) => (source === 'FNC' ? w : `${source}: ${w}`)))
    for (const g of snap.games) {
      if (seen.has(g.id)) continue
      seen.add(g.id)
      games.push({ ...g, source })
    }
  }
  const first = parts[0]?.snap
  if (!games.length) {
    return {
      hubUrl: first?.hubUrl || FNC_GAMES_HUB,
      fetchedAt: first?.fetchedAt || new Date().toISOString(),
      eventName: first?.eventName || 'Far North Coast Water Polo',
      competitions,
      games: [],
      venues: [],
      heldBack,
      warnings: [...warnings, ...errors].filter(Boolean),
      error: errors.join(' ') || first?.error || 'No fixtures found',
    }
  }
  const fncName = parts.find((p) => p.source === 'FNC')?.snap.eventName
  const eventName = loaded.includes('FNC')
    ? loaded.length > 1
      ? `${fncName || 'Far North Coast Water Polo'} + ${loaded.filter((s) => s !== 'FNC').join(' + ')}`
      : fncName || 'Far North Coast Water Polo'
    : loaded.join(' + ')
  return {
    hubUrl: first?.hubUrl || FNC_GAMES_HUB,
    fetchedAt: first?.fetchedAt || new Date().toISOString(),
    eventName,
    competitions,
    games,
    venues: groupGamesByVenue(gamesFromToday(games, todayISO)),
    heldBack,
    warnings: [...warnings, ...errors].filter(Boolean),
  }
}

/** Load one game's match info + rosters from RevSport and build a Match. */
export async function loadLiveMatch(game: LiveGame): Promise<{ match?: Match; error?: string; warnings: string[] }> {
  const result = await fetchRevSport(game.detailsUrl)
  if (result.fetchError) {
    return { error: result.fetchError, warnings: [] }
  }

  const grade = result.grade || game.grade || ''
  const stage = result.round || game.round || ''
  const ageGroup = inferAgeGroup(grade)
  const mode = inferMode(stage)
  // Sides by RevSport team id only: home plays White, away plays Blue.
  const sides = assignSidesById(result.teams, game.homeTeamId, game.awayTeamId)
  const warnings = [...(result.warnings || []), ...sides.warnings]
  if (!game.homeTeamId && !game.awayTeamId) {
    warnings.push('This fixture has no RevSport team ids, so White and Blue were left empty. Add the teams in Setup.')
  }
  const white = sides.white ? importedTeamToTeam(sides.white) : placeholderTeam(game.home, game.homeTeamId)
  const blue = sides.blue ? importedTeamToTeam(sides.blue) : placeholderTeam(game.away, game.awayTeamId)
  if (!white.name) white.name = game.home || 'White'
  if (!blue.name) blue.name = game.away || 'Blue'
  for (const t of [white, blue]) {
    const note = rosterMissingNote(t.name)
    if (t.rosterMissing && !warnings.includes(note)) warnings.push(note)
  }

  const base = newMatch({
    eventName:
      game.source === 'AJWP'
        ? ['AJWP', grade].filter(Boolean).join(' · ')
        : [result.competition || game.competition, grade].filter(Boolean).join(' · ') || 'FNC Water Polo',
    stage: stage || 'Round',
    venue: result.venue || game.venueName,
    grade: grade || 'Open',
    date: result.date || game.date || '',
    startTime: result.startTime || game.time || '',
    ageGroup,
    mode,
    white,
    blue,
    sourceUrl: game.detailsUrl,
    revsport: revsportRefFrom(result, { gameId: gameIdFromUrl(game.detailsUrl) || game.id, ...game }),
    currentPeriod: 1,
    clockRemainingSec: periodLengthSec(ageGroup, 1),
    started: false,
  })

  const patched = { ...base, ...importMetaPatch(base, result), white, blue, sourceUrl: game.detailsUrl }
  // Prefer full venue from match-info over card short name.
  if (result.venue) patched.venue = result.venue

  return { match: patched, warnings }
}
