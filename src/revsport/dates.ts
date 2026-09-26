import type { ImportedGame } from './parser'

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

/** Calendar date in Australia/Sydney as YYYY-MM-DD (en-CA). */
export function sydneyTodayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
}

/**
 * Infer YYYY-MM-DD from a label like "Fri 17 Oct" (no year).
 * Tries year-1 / year / year+1 relative to todayISO and picks the closest.
 */
export function inferIsoDate(label: string, todayISO: string): string | undefined {
  const m = label
    .replace(/\s+/g, ' ')
    .trim()
    .match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*/i)
  if (!m) return undefined
  const dd = m[1].padStart(2, '0')
  const mm = MONTHS[m[2].slice(0, 3).toLowerCase()]
  if (!mm) return undefined
  const todayY = Number(todayISO.slice(0, 4))
  if (!Number.isFinite(todayY)) return undefined
  const todayMs = Date.parse(`${todayISO}T12:00:00Z`)
  if (Number.isNaN(todayMs)) return undefined
  let best: string | undefined
  let bestDist = Infinity
  for (const y of [todayY - 1, todayY, todayY + 1]) {
    const iso = `${y}-${mm}-${dd}`
    const ms = Date.parse(`${iso}T12:00:00Z`)
    if (Number.isNaN(ms)) continue
    const dist = Math.abs(ms - todayMs)
    if (dist < bestDist) {
      bestDist = dist
      best = iso
    }
  }
  return best
}

/**
 * Date most relevant to today: today if present, else earliest date >= today,
 * else the latest past date.
 */
export function pickRelevantDate(dates: string[], todayISO: string): string {
  const uniq = [...new Set(dates.filter(Boolean))].sort()
  if (!uniq.length) return todayISO
  if (uniq.includes(todayISO)) return todayISO
  const upcoming = uniq.filter((d) => d >= todayISO)
  if (upcoming.length) return upcoming[0]
  return uniq[uniq.length - 1]
}

export function gamesOnDate(games: ImportedGame[], date: string): ImportedGame[] {
  return games.filter((g) => g.date === date)
}
