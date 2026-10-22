/**
 * RevSport IDs pulled from public page URLs. Everything that links a game, team
 * or player back to RevSport goes through these — never through names or the
 * order things appear on a page.
 */

function pathOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url.split(/[?#]/)[0]
  }
}

/** /game/2684429 → "2684429" */
export function gameIdFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  return pathOf(url).match(/\/game\/(\d+)\/?$/i)?.[1]
}

/** /games/team/27800/443848, /games/team-stats/27800/443848 or /teams/443848 → "443848" */
export function teamIdFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  const p = pathOf(url)
  return (
    p.match(/\/games\/team(?:-stats)?\/\d+\/(\d+)\/?$/i)?.[1] ||
    p.match(/\/teams\/(\d+)\/?$/i)?.[1]
  )
}

/** /games/27800/3790(/round/2), /games/team(-stats)/27800/… → "27800" */
export function competitionIdFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  const p = pathOf(url)
  return (
    p.match(/\/games\/team(?:-stats)?\/(\d+)\//i)?.[1] ||
    p.match(/\/games\/(\d+)\/\d+(?:\/|$)/i)?.[1]
  )
}

/** /games/27800/3790 → "3790" */
export function gradeIdFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  return pathOf(url).match(/\/games\/\d+\/(\d+)(?:\/|$)/i)?.[1]
}

/** Player link on a team-stats page: /games/statistics/mwzjUP?competition_id=27800 → "mwzjUP" */
export function playerIdFromHref(href: string | undefined): string | undefined {
  if (!href) return undefined
  return pathOf(href).match(/\/games\/statistics\/([A-Za-z0-9_-]+)\/?$/)?.[1]
}
