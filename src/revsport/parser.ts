/**
 * Parse Revolutionise Sport public HTML (match card, fixtures, team list, team-stats).
 * Do not invent players — only names/caps that appear on the page.
 */

import { inferIsoDate, sydneyTodayISO } from './dates'
import { htmlLooksLikeRevSport, isRevSportPath, isRevSportUrl, resolveHref } from './url'

export { htmlLooksLikeRevSport, isRevSportUrl, isRevSportPath } from './url'

export interface ImportedPlayer {
  name: string
  cap: string | null
  capGuessed: boolean
  attended?: boolean | number
}

export interface ImportedTeam {
  name: string
  players: ImportedPlayer[]
}

export interface ImportedGame {
  home: string
  away: string
  date?: string
  time?: string
  venue?: string
  subvenue?: string
  referees?: string
  detailsUrl: string
  homeTeamUrl?: string
  awayTeamUrl?: string
}

export interface ImportedRound {
  url: string
  label: string
  date?: string
}

export interface ImportedGrade {
  url: string
  label: string
}

export interface ImportResult {
  source: 'game' | 'team-stats' | 'fixtures' | 'match-info' | 'team-list' | 'unknown'
  competition?: string
  grade?: string
  round?: string
  heading?: string
  venue?: string
  date?: string
  startTime?: string
  referees?: string
  teams: ImportedTeam[]
  games?: ImportedGame[]
  roundUrls?: string[]
  rounds?: ImportedRound[]
  grades?: ImportedGrade[]
  teamPageUrls?: string[]
  warnings: string[]
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&middot;/gi, '·')
    .replace(/&bull;/gi, '·')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

export function stripTags(html: string): string {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
  const text = noScript.replace(/<[^>]+>/g, ' ')
  return decodeEntities(text).replace(/\s+/g, ' ').trim()
}

interface ParsedTable {
  heading: string
  headers: string[]
  rows: string[][]
  startIndex: number
}

function parseTables(html: string): ParsedTable[] {
  const tables: ParsedTable[] = []
  const re = /<table\b[^>]*>([\s\S]*?)<\/table>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const inner = m[1]
    const rows: string[][] = []
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
    let tr: RegExpExecArray | null
    while ((tr = trRe.exec(inner))) {
      const cells: string[] = []
      const tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi
      let td: RegExpExecArray | null
      while ((td = tdRe.exec(tr[1]))) {
        cells.push(stripTags(td[1]))
      }
      if (cells.some((c) => c.length > 0)) rows.push(cells)
    }
    if (rows.length === 0) continue
    const before = html.slice(Math.max(0, m.index - 1200), m.index)
    const headings = [...before.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    const last = headings[headings.length - 1]
    const heading = last ? stripTags(last[2]) : ''
    const headerish = rows[0].every((c) => /name|#|goals|foul|attend/i.test(c) || c.length < 24)
    const headers = headerish ? rows[0] : []
    const body = headerish ? rows.slice(1) : rows
    tables.push({ heading, headers, rows: body, startIndex: m.index })
  }
  return tables
}

const CAP_RE = /\(#\s*(\d+[A-Za-z]?)\)/

export function parsePlayerName(raw: string): { name: string; cap: string | null } {
  let s = decodeEntities(raw).replace(/\s+/g, ' ').trim()
  s = s.replace(/\bAttended\b/gi, '').trim()
  s = s.replace(/^\d+\.\s*/, '')
  const capM = s.match(CAP_RE)
  const cap = capM ? capM[1] : null
  const name = s.replace(CAP_RE, '').replace(/\s+/g, ' ').trim()
  return { name, cap }
}

function isJunkName(name: string): boolean {
  if (!name) return true
  if (/^&nbsp;$/i.test(name)) return true
  if (/^(name|goals|major fouls|#|attended)$/i.test(name)) return true
  if (/^[\d.\s]+$/.test(name)) return true
  return name.length < 2
}

function assignMissingCaps(players: ImportedPlayer[]): ImportedPlayer[] {
  const used = new Set(players.filter((p) => p.cap).map((p) => p.cap as string))
  let next = 1
  return players.map((p) => {
    if (p.cap) return { ...p, capGuessed: false }
    while (used.has(String(next))) next += 1
    const cap = String(next)
    used.add(cap)
    next += 1
    return { ...p, cap, capGuessed: true }
  })
}

function headerIndex(headers: string[], ...needles: string[]): number {
  const lower = headers.map((h) => h.toLowerCase())
  for (const n of needles) {
    const i = lower.findIndex((h) => h.includes(n))
    if (i >= 0) return i
  }
  return -1
}

function tableKind(t: ParsedTable): 'game' | 'team-stats' | 'team-list' | 'other' {
  if (/team list/i.test(t.heading)) return 'team-list'
  const h = t.headers.map((x) => x.toLowerCase()).join(' | ')
  if (h.includes('name') && (h.includes('goal') || h.includes('foul'))) return 'game'
  if (h.includes('attend')) return 'team-stats'
  if (h.includes('name') && (h === '# | name' || h.includes('#'))) return 'team-stats'
  if (t.rows.some((r) => r.some((c) => CAP_RE.test(c)))) {
    if (t.headers.some((x) => /attend/i.test(x))) return 'team-stats'
    if (t.headers.some((x) => /goal|foul/i.test(x))) return 'game'
  }
  const firstNum = t.rows.filter((r) => /^\d+\.?$/.test((r[0] || '').trim())).length
  if (headerIndex(t.headers, 'name') >= 0 && firstNum >= 3 && firstNum >= t.rows.length / 2) {
    return 'team-list'
  }
  return 'other'
}

function playersFromTable(t: ParsedTable): ImportedPlayer[] {
  const nameIdx = headerIndex(t.headers, 'name')
  const attendIdx = headerIndex(t.headers, 'attend')
  const players: ImportedPlayer[] = []
  for (const row of t.rows) {
    const nameCell = nameIdx >= 0 ? row[nameIdx] ?? '' : row.find((c) => /[A-Za-z]/.test(c)) ?? ''
    const { name, cap: namedCap } = parsePlayerName(nameCell)
    if (isJunkName(name)) continue
    const numCell = (row[0] || '').trim().match(/^(\d+)/)
    const cap = namedCap || (numCell && nameIdx !== 0 ? numCell[1] : null)
    let attended: boolean | number | undefined
    if (attendIdx >= 0) {
      const a = (row[attendIdx] || '').trim()
      if (/^\d+$/.test(a)) attended = Number(a)
      else if (a) attended = true
    }
    players.push({ name, cap, capGuessed: false, attended })
  }
  return assignMissingCaps(players)
}

const GENERIC_HEADING =
  /^(team statistics|match information|match card|fixtures & results|fixtures for team|team information|team list|coming up|previous result|other matches between these teams|sponsors|we support|contacts|follow|\d+)$/i

function parsePageHeading(html: string): { heading?: string; competition?: string; grade?: string; round?: string } {
  const all = [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => stripTags(m[2])).filter(Boolean)
  const heading = all.find((h) => !GENERIC_HEADING.test(h)) || all[0] || ''
  const parts = heading.split(/\s*[·•|]\s*|\s+[-–]\s+/).map((p) => p.trim()).filter(Boolean)
  let competition: string | undefined
  let grade: string | undefined
  let round: string | undefined
  if (parts.length >= 2) {
    competition = parts[0]
    grade = parts[1]
    round = parts[2]
  } else if (parts.length === 1 && !/won!$/i.test(parts[0])) {
    competition = parts[0]
  }
  return { heading: heading || undefined, competition, grade, round }
}

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
}

export function parseRevSportDate(raw: string): { date?: string; time?: string } {
  const t = raw.replace(/\s+/g, ' ').trim()
  const m = t.match(
    /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})(?:\s+(\d{1,2}:\d{2}))?/i,
  )
  if (!m) {
    const timeOnly = t.match(/\b(\d{1,2}:\d{2})\b/)
    return { time: timeOnly?.[1] }
  }
  const dd = m[1].padStart(2, '0')
  const mm = MONTHS[m[2].slice(0, 3).toLowerCase()]
  return { date: `${m[3]}-${mm}-${dd}`, time: m[4] }
}

const PATH_ROUND = /\/games\/\d+\/\d+\/round\/\d+\/?$/i
const PATH_GRADE = /\/games\/\d+\/\d+\/?$/i
const PATH_GAME = /\/game\/\d+\/?$/i
const PATH_TEAM_GAMES = /\/games\/team\/\d+\/\d+\/?$/i
const PATH_TEAMS = /\/teams\/\d+\/?$/i

function pageOrigin(html: string, pageUrl?: string): string | undefined {
  if (pageUrl) {
    try {
      return new URL(pageUrl).origin
    } catch {
      /* fall through */
    }
  }
  const re = /href="(https:\/\/[^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1])
      if (isRevSportUrl(u.toString()) || isRevSportPath(u.pathname)) return u.origin
    } catch {
      /* next */
    }
  }
  return undefined
}

function hrefUrl(href: string, origin?: string): string {
  return resolveHref(href, origin)
}

function hrefPathname(url: string): string {
  try {
    if (/^https:/i.test(url)) return new URL(url).pathname
  } catch {
    /* relative */
  }
  return url.split('?')[0]
}

interface Anchor {
  href: string
  inner: string
  index: number
  after: number
}

function matchAnchors(html: string): Anchor[] {
  const out: Anchor[] = []
  const re = /<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    out.push({ href: m[1], inner: m[2], index: m.index, after: m.index + m[0].length })
  }
  return out
}

/** /club/games/team/{comp}/{id} → /club/teams/{id} (public team list). */
export function rosterUrlFromTeamLink(url: string): string {
  const m = url.match(/^(https:\/\/[^/]+)(\/[^/]+)?\/games\/team\/\d+\/(\d+)/i)
  if (!m) return url
  const slug = m[2] && !/^\/games$/i.test(m[2]) ? m[2] : ''
  return `${m[1]}${slug}/teams/${m[3]}`
}

function labelledValue(html: string, label: string): string {
  const re = new RegExp(
    `${label.replace(/&/g, '(?:&amp;|&)')}\\s*</div>([\\s\\S]*?)(?:</div>|$)`,
    'i',
  )
  const m = html.match(re)
  return m ? stripTags(m[1]) : ''
}

/** Format street + suburb + postcode: "Freeborn Place  Alstonville 2477" → "Freeborn Place, Alstonville 2477". */
export function formatVenueAddressLine(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const m = t.match(/^(.*)\s+(\d{4})$/)
  if (!m) return t
  const before = m[1].trim().replace(/,$/, '')
  const postcode = m[2]
  const parts = before.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return t
  const suburb = parts[parts.length - 1]
  if (!/^[A-Za-z]/.test(suburb)) return t
  const street = parts.slice(0, -1).join(' ')
  return `${street}, ${suburb} ${postcode}`
}

/**
 * RevSport match-info venue block:
 *   Venue</div>Pool Name<div class="font-size-sm">Street  Suburb 2477</div>
 * → "Pool Name, Street, Suburb 2477"
 */
export function parseVenueField(html: string): string {
  const m = html.match(
    /Venue\s*<\/div>([^<]*)(?:<div[^>]*class="[^"]*font-size-sm[^"]*"[^>]*>([\s\S]*?)<\/div>)?/i,
  )
  if (m) {
    const name = stripTags(m[1]).trim()
    const address = formatVenueAddressLine(m[2] ? stripTags(m[2]) : '')
    return [name, address].filter(Boolean).join(', ')
  }
  return labelledValue(html, 'Venue')
}


function parseMatchInfo(html: string, meta: ReturnType<typeof parsePageHeading>, origin?: string): ImportResult | null {
  const dateRaw = labelledValue(html, 'Date & time')
  const venue = parseVenueField(html)
  const subvenue = labelledValue(html, 'Subvenue')
  const referees = labelledValue(html, 'Referees')
  if (!dateRaw && !venue) return null

  const base = origin || pageOrigin(html)
  const seen = new Set<string>()
  const named: { name: string; url: string }[] = []
  for (const a of matchAnchors(html)) {
    const abs = hrefUrl(a.href, base)
    const path = hrefPathname(abs)
    if (!PATH_TEAM_GAMES.test(path) && !PATH_TEAMS.test(path)) continue
    const name = stripTags(a.inner)
    if (!name || /fixtures|teams$/i.test(name)) continue
    const url = rosterUrlFromTeamLink(abs)
    if (seen.has(url)) continue
    seen.add(url)
    named.push({ name, url })
    if (named.length >= 2) break
  }
  if (named.length < 1) return null

  const parsedDate = parseRevSportDate(dateRaw)
  const venueText = [venue, subvenue].filter(Boolean).join(' · ')
  return {
    source: 'match-info',
    ...meta,
    venue: venueText || venue || undefined,
    date: parsedDate.date,
    startTime: parsedDate.time,
    referees: referees || undefined,
    teams: named.map((t) => ({ name: t.name, players: [] })),
    teamPageUrls: named.map((t) => t.url),
    warnings: [],
  }
}

function parseFixtureCards(html: string, origin?: string): ImportedGame[] {
  const games: ImportedGame[] = []
  const page = origin || pageOrigin(html)
  const chunks = html.split(/class="card card-hover[^"]*"/)
  for (const chunk of chunks.slice(1)) {
    const card = chunk.slice(0, 5000)
    const origin = page || pageOrigin(card)
    const anchors = matchAnchors(card)
    const detailsA = anchors.find((a) => PATH_GAME.test(hrefPathname(hrefUrl(a.href, origin))))
    if (!detailsA) continue
    const detailsUrl = hrefUrl(detailsA.href, origin)
    const teams = anchors
      .filter((a) => PATH_TEAM_GAMES.test(hrefPathname(hrefUrl(a.href, origin))))
      .map((a) => ({ url: rosterUrlFromTeamLink(hrefUrl(a.href, origin)), name: stripTags(a.inner) }))
      .filter((x) => x.name)
    if (teams.length < 2) continue
    const text = stripTags(card)
    const dt = parseRevSportDate(text)
    const escapedHome = teams[0].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const venueM = text.match(new RegExp('\\d{4}\\s+\\d{1,2}:\\d{2}\\s+(.+?)\\s+' + escapedHome))
    let venue = venueM?.[1]?.trim()
    let subvenue: string | undefined
    if (venue) {
      const deep = venue.match(/^(.*)\s+(deep end|shallow|court\s*\d+|pool\s*\d+)$/i)
      if (deep) {
        venue = deep[1].trim()
        subvenue = deep[2]
      }
    }
    const refM = text.match(/Referees\s+(.+?)(?:\s+Details|$)/i)
    games.push({
      home: teams[0].name,
      away: teams[1].name,
      date: dt.date,
      time: dt.time,
      venue,
      subvenue,
      referees: refM?.[1]?.trim(),
      detailsUrl: detailsUrl,
      homeTeamUrl: teams[0].url,
      awayTeamUrl: teams[1].url,
    })
  }
  return games
}

function parseGrades(html: string, origin?: string): ImportedGrade[] {
  const base = origin || pageOrigin(html)
  const found: ImportedGrade[] = []
  const seen = new Set<string>()
  for (const a of matchAnchors(html)) {
    const url = hrefUrl(a.href, base)
    const path = hrefPathname(url)
    if (PATH_ROUND.test(path) || !PATH_GRADE.test(path)) continue
    if (/\/reports\//i.test(path)) continue
    if (seen.has(url)) continue
    const label = stripTags(a.inner).trim()
    if (!label || /statistics|report|^details$/i.test(label)) continue
    seen.add(url)
    found.push({ url, label })
  }
  return found
}

function parseRounds(html: string, todayISO: string, origin?: string): ImportedRound[] {
  const base = origin || pageOrigin(html)
  const found: { url: string; label: string; index: number; afterStart: number }[] = []
  const seen = new Set<string>()
  for (const a of matchAnchors(html)) {
    const url = hrefUrl(a.href, base)
    if (!PATH_ROUND.test(hrefPathname(url))) continue
    if (seen.has(url)) continue
    seen.add(url)
    const label = stripTags(a.inner).trim() || `Round ${found.length + 1}`
    found.push({ url, label, index: a.index, afterStart: a.after })
  }
  return found.map((item, i) => {
    const end = i + 1 < found.length ? found[i + 1].index : item.afterStart + 800
    const chunk = html.slice(item.afterStart, end)
    const text = stripTags(chunk)
    const dateM = text.match(
      /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*/i,
    )
    const date = dateM ? inferIsoDate(dateM[0], todayISO) : undefined
    return { url: item.url, label: item.label, date }
  })
}

function parseRoundUrls(html: string, origin?: string): string[] {
  return parseRounds(html, sydneyTodayISO(), origin).map((r) => r.url)
}

function teamWarnings(teams: ImportedTeam[]): string[] {
  const warnings: string[] = []
  for (const t of teams) {
    if (t.players.length === 0) warnings.push(`No players parsed for ${t.name}`)
    const guessed = t.players.filter((p) => p.capGuessed).length
    if (guessed) {
      warnings.push(
        `${guessed} player(s) on ${t.name} had no cap number — sequential caps assigned. Check them.`,
      )
    }
  }
  return warnings
}

export function parseRevSportHtml(html: string, todayISO = sydneyTodayISO(), pageUrl?: string): ImportResult {
  if (!htmlLooksLikeRevSport(html)) {
    return { source: 'unknown', teams: [], warnings: ['That page is not Revolutionise Sport'] }
  }
  const warnings: string[] = []
  const origin = pageOrigin(html, pageUrl)
  const meta = parsePageHeading(html)
  const tables = parseTables(html)
  const gameTables = tables.filter((t) => tableKind(t) === 'game')
  const listTables = tables.filter((t) => tableKind(t) === 'team-list')
  const statsTables = tables.filter((t) => tableKind(t) === 'team-stats')

  if (gameTables.length >= 1) {
    const teams: ImportedTeam[] = gameTables.map((t) => ({
      name: t.heading || 'Team',
      players: playersFromTable(t),
    }))
    return { source: 'game', ...meta, teams, warnings: [...warnings, ...teamWarnings(teams)] }
  }

  if (listTables.length >= 1) {
    const t = listTables[0]
    const nameFromHeading = (meta.heading || t.heading || '')
      .split(/[·•]/)
      .map((s) => s.trim())
      .filter(Boolean)
    const teamName =
      nameFromHeading.find((n) => !/team list|coming up|previous/i.test(n)) || t.heading || 'Team'
    const players = playersFromTable(t)
    const teams = [{ name: teamName, players }]
    return { source: 'team-list', ...meta, teams, warnings: [...warnings, ...teamWarnings(teams)] }
  }

  if (statsTables.length >= 1) {
    const t = statsTables[0]
    const nameFromHeading = (meta.heading || t.heading || '')
      .split(/[·•]/)
      .map((s) => s.trim())
      .filter(Boolean)
    const teamName = nameFromHeading[nameFromHeading.length - 1] || t.heading || 'Team'
    const players = playersFromTable(t)
    const teams = [{ name: teamName, players }]
    return { source: 'team-stats', ...meta, teams, warnings: [...warnings, ...teamWarnings(teams)] }
  }

  const matchInfo = parseMatchInfo(html, meta, origin)
  if (matchInfo) return matchInfo

  const games = parseFixtureCards(html, origin)
  const rounds = parseRounds(html, todayISO, origin)
  const roundUrls = rounds.length ? rounds.map((r) => r.url) : parseRoundUrls(html, origin)
  if (games.length || roundUrls.length) {
    if (!games.length) {
      warnings.push('Fixtures page — pick a round/game to load teams and players.')
    }
    return {
      source: 'fixtures',
      ...meta,
      teams: [],
      games,
      roundUrls,
      rounds: rounds.length ? rounds : undefined,
      warnings,
    }
  }

  const grades = parseGrades(html, origin)
  if (grades.length) {
    return {
      source: 'fixtures',
      ...meta,
      teams: [],
      grades,
      warnings,
    }
  }

  warnings.push('No match-card, fixtures, or team-list found. Try Paste HTML from the RevSport page.')
  return { source: 'unknown', ...meta, teams: [], warnings }
}

export function parsePastedTable(text: string): ImportResult {
  const htmlIsh =
    /<(?:table|tr|td|div|a|html|body)\b/i.test(text) ||
    /revolutionise\.com\.au/i.test(text) ||
    /\/games\/\d+/i.test(text)
  if (htmlIsh) {
    const found = text.match(/https:\/\/[^\s"'<>]+/i)
    const pageUrl = found && isRevSportUrl(found[0]) ? found[0] : undefined
    return parseRevSportHtml(text, sydneyTodayISO(), pageUrl)
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const players: ImportedPlayer[] = []
  let teamName = 'Pasted team'
  for (const line of lines) {
    if (/^team\s*:/i.test(line) || /^name\s*:/i.test(line)) {
      teamName = line.split(':').slice(1).join(':').trim() || teamName
      continue
    }
    if (/^name\b/i.test(line) && /cap|#/.test(line.toLowerCase())) continue
    const parts = line.split(/\t|,|;|\s{2,}/).map((p) => p.trim()).filter(Boolean)
    const joined = parts.join(' ')
    const parsed = parsePlayerName(joined)
    if (isJunkName(parsed.name)) continue
    let cap = parsed.cap
    if (!cap && parts[0] && /^\d+[A-Za-z]?$/.test(parts[0]) && parts.length > 1) {
      cap = parts[0]
      parsed.name = parsePlayerName(parts.slice(1).join(' ')).name
    }
    players.push({ name: parsed.name, cap, capGuessed: !cap, attended: true })
  }
  return {
    source: 'unknown',
    teams: [{ name: teamName, players: assignMissingCaps(players) }],
    warnings: players.length ? [] : ['Could not parse any players from pasted text'],
  }
}

