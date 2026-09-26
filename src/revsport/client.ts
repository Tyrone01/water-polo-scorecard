import { pickRelevantDate, sydneyTodayISO } from './dates'
import {
  isRevSportUrl,
  parsePastedTable,
  parseRevSportHtml,
  type ImportedGame,
  type ImportedRound,
  type ImportResult,
} from './parser'

export type Result = ImportResult & {
  html?: string
  fetchError?: string
  pendingRoundUrls?: string[]
}

async function fetchHtml(url: string): Promise<{ html?: string; fetchError?: string }> {
  try {
    const q = new URLSearchParams()
    q.set('url', url.trim())
    const res = await fetch('/api/revsport?' + q.toString())
    const text = await res.text()
    let data: { html?: string; error?: string } = {}
    try {
      data = JSON.parse(text) as { html?: string; error?: string }
    } catch {
      return { fetchError: 'RevSport proxy HTTP ' + res.status + ' (page did not return JSON). Try a refresh or Paste HTML.' }
    }
    if (!res.ok || data.error) {
      return { fetchError: data.error || 'import failed (HTTP ' + res.status + ')' }
    }
    return { html: data.html }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'network'
    return { fetchError: msg + ' (use Paste HTML)' }
  }
}

async function hydrateRosters(parsed: ImportResult): Promise<ImportResult> {
  const urls = parsed.teamPageUrls || []
  if (!urls.length) return parsed
  const empty = !parsed.teams.length || parsed.teams.every((t) => t.players.length === 0)
  if (!empty) return parsed
  const pages = await Promise.all(urls.map((u) => fetchHtml(u)))
  const teams = parsed.teams.map((t, i) => {
    const html = pages[i]?.html || ''
    const page = html ? parseRevSportHtml(html) : { teams: [] as ImportResult['teams'] }
    const players = page.teams[0]?.players || []
    const name = t.name || page.teams[0]?.name || 'Team'
    return { name, players }
  })
  const missing = pages.filter((p) => p.fetchError)
  const warnings = [...parsed.warnings]
  if (missing.length) {
    warnings.push('Could not load one or more team lists — add players by hand or paste HTML.')
  }
  return { ...parsed, teams, warnings }
}

function roundsFrom(parsed: ImportResult): ImportedRound[] {
  if (parsed.rounds?.length) return parsed.rounds
  return (parsed.roundUrls || []).map((url) => ({ url, label: url }))
}

function pickRelevantRound(rounds: ImportedRound[], todayISO: string): ImportedRound {
  const dates = rounds.map((r) => r.date).filter((d): d is string => !!d)
  if (!dates.length) return rounds[0]
  const relevant = pickRelevantDate(dates, todayISO)
  return rounds.find((r) => r.date === relevant) || rounds[0]
}

function mergeRoundPage(meta: ImportResult, html: string, games: ImportedGame[], seen: Set<string>, pageUrl?: string): ImportResult {
  const p = parseRevSportHtml(html, sydneyTodayISO(), pageUrl)
  if (!meta.competition && p.competition) {
    meta = {
      ...meta,
      competition: p.competition,
      grade: p.grade || meta.grade,
      round: p.round || meta.round,
      heading: p.heading || meta.heading,
    }
  }
  for (const g of p.games || []) {
    if (seen.has(g.detailsUrl)) continue
    seen.add(g.detailsUrl)
    games.push(g)
  }
  return meta
}

/** Fetch only the round whose inferred date is most relevant to today. */
async function expandFixtures(parsed: ImportResult): Promise<Result> {
  const rounds = roundsFrom(parsed)
  if (!rounds.length) return parsed
  const chosen = pickRelevantRound(rounds, sydneyTodayISO())
  const pendingRoundUrls = rounds.filter((r) => r.url !== chosen.url).map((r) => r.url)
  const page = await fetchHtml(chosen.url)
  const games: ImportedGame[] = []
  const seen = new Set<string>()
  let meta: ImportResult = parsed
  if (page.html) {
    meta = mergeRoundPage(meta, page.html, games, seen, chosen.url)
  }
  const finalGames = games.length ? games : [...(parsed.games || [])]
  return { ...meta, source: 'fixtures', games: finalGames, teams: [], pendingRoundUrls }
}

/** Fetch remaining round pages in batches of 3 and merge their games. */
export async function expandPendingRounds(parsed: Result): Promise<Result> {
  const pending = parsed.pendingRoundUrls || []
  if (!pending.length) return { ...parsed, pendingRoundUrls: [] }
  const games: ImportedGame[] = [...(parsed.games || [])]
  const seen = new Set(games.map((g) => g.detailsUrl))
  let meta: ImportResult = parsed
  const batchSize = 3
  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize)
    const pages = await Promise.all(batch.map(async (u) => ({ u, page: await fetchHtml(u) })))
    for (const { u, page } of pages) {
      if (!page.html) continue
      meta = mergeRoundPage(meta, page.html, games, seen, u)
    }
  }
  return { ...meta, source: 'fixtures', games, teams: [], pendingRoundUrls: [] }
}

function namedRoundUrl(pageUrl: string): boolean {
  try {
    return /\/round\/\d+\/?$/i.test(new URL(pageUrl).pathname)
  } catch {
    return /\/round\/\d+\/?$/i.test(pageUrl)
  }
}

function samePath(a: string, b: string): boolean {
  const norm = (v: string) => {
    try {
      return new URL(v).pathname.replace(/\/$/, '')
    } catch {
      return v.replace(/\/$/, '')
    }
  }
  return norm(a) === norm(b)
}

export async function fetchRevSport(url: string): Promise<Result> {
  if (!isRevSportUrl(url)) {
    return { source: 'unknown', teams: [], warnings: [], fetchError: 'Need a Revolutionise Sport fixtures or game URL' }
  }
  const first = await fetchHtml(url)
  if (first.fetchError) {
    return { source: 'unknown', teams: [], warnings: [], fetchError: first.fetchError }
  }
  let parsed: Result = parseRevSportHtml(first.html || '', sydneyTodayISO(), url)
  if (parsed.source === 'fixtures' && (parsed.rounds?.length || parsed.roundUrls?.length)) {
    const honourThisRound = namedRoundUrl(url)
    const alreadyHasGames = (parsed.games?.length || 0) > 0
    if (honourThisRound || alreadyHasGames) {
      const others = roundsFrom(parsed)
        .map((r) => r.url)
        .filter((u) => !samePath(u, url))
      parsed = { ...parsed, pendingRoundUrls: others }
    } else {
      // Grade listing with no cards: load the relevant round (proxy may already have followed).
      parsed = await expandFixtures(parsed)
    }
  }
  if (parsed.teamPageUrls?.length) {
    parsed = await hydrateRosters(parsed)
  }
  return { ...parsed, html: first.html }
}

export function importFromPaste(text: string): ImportResult {
  return parsePastedTable(text)
}
