/** Shared RevSport URL checks for the Worker, Vite proxy, and parser. */

const REVSPORT_HOSTS = new Set(['revolutionise.com.au', 'www.revolutionise.com.au'])

/** Path looks like a Revolutionise Sport fixtures / game / team / ajax page. */
export function isRevSportPath(pathname: string): boolean {
  return /(?:^|\/)(?:games(?:\/|$)|game(?:\/|$)|teams(?:\/|$)|fixtures(?:\/|$)|ajax(?:\/|$)|reports\/games(?:\/|$))/i.test(
    pathname,
  )
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.local')) return true
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true
  return false
}

/**
 * https Revolutionise Sport URLs: official host, or a custom club domain whose
 * path looks like RevSport (`/games/…`, `/game/…`, `/teams/…`, `/ajax/…`).
 * Not an open proxy — https://example.com/not-revsport is rejected.
 */
export function isRevSportUrl(value: string): boolean {
  try {
    const u = new URL(value.trim())
    if (u.protocol !== 'https:') return false
    if (isBlockedHost(u.hostname)) return false
    const host = u.hostname.toLowerCase()
    if (REVSPORT_HOSTS.has(host) || host.endsWith('.revolutionise.com.au')) return true
    return isRevSportPath(u.pathname)
  } catch {
    return false
  }
}

/**
 * Page HTML fingerprint from AJWP / NSW / QLD / FNC: script and link tags to
 * cdn.revolutionise.com.au or cdn-static.revolutionise.com.au (jquery, bootstrap,
 * theme.min.js, …). Also alt="revolutioniseSPORT".
 */
export function htmlLooksLikeRevSport(html: string): boolean {
  return /cdn(?:-static)?\.revolutionise\.com\.au/i.test(html) || /revolutionisesport/i.test(html)
}

export function resolveHref(href: string, origin?: string): string {
  const raw = href.trim()
  if (!raw || raw.startsWith('#') || /^javascript:/i.test(raw)) return ''
  try {
    if (/^https:/i.test(raw)) return new URL(raw).toString()
    if (/^http:/i.test(raw)) return ''
    if (origin) return new URL(raw, origin).toString()
    return raw.startsWith('/') ? raw : ''
  } catch {
    return ''
  }
}
