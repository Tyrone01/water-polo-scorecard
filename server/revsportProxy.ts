import { pickRelevantDate, sydneyTodayISO } from '../src/revsport/dates'
import { parseRevSportHtml } from '../src/revsport/parser'
import { htmlLooksLikeRevSport, isRevSportUrl } from '../src/revsport/url'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  })
}

async function fetchUpstream(target: string): Promise<{ ok: boolean; status: number; html: string }> {
  const upstream = await fetch(target, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  })
  return { ok: upstream.ok, status: upstream.status, html: await upstream.text() }
}

/** If a grade listing has round tabs but no game cards, return the round URL to fetch next. */
export function listingFollowUrl(html: string, pageUrl: string, todayISO = sydneyTodayISO()): string | null {
  try {
    if (/\/round\/\d+\/?$/i.test(new URL(pageUrl).pathname)) return null
  } catch {
    return null
  }
  const parsed = parseRevSportHtml(html, todayISO, pageUrl)
  if (parsed.source !== 'fixtures') return null
  if ((parsed.games?.length || 0) > 0) return null
  const rounds = parsed.rounds?.length
    ? parsed.rounds
    : (parsed.roundUrls || []).map((url) => ({ url, label: url }))
  if (!rounds.length) return null
  const dates = rounds.map((r) => r.date).filter((d): d is string => !!d)
  if (!dates.length) return rounds[0].url
  const relevant = pickRelevantDate(dates, todayISO)
  return rounds.find((r) => r.date === relevant)?.url || rounds[0].url
}

export async function handleRevSportRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    })
  }
  if (request.method !== 'GET') return json(405, { error: 'GET only' })
  const target = new URL(request.url).searchParams.get('url') || ''
  if (!isRevSportUrl(target)) {
    return json(400, { error: 'Only https Revolutionise Sport fixtures or game URLs are allowed' })
  }
  try {
    let pageUrl = new URL(target).toString()
    let upstream = await fetchUpstream(pageUrl)
    if (!htmlLooksLikeRevSport(upstream.html)) {
      return json(400, { error: 'That page is not Revolutionise Sport' })
    }
    const follow = listingFollowUrl(upstream.html, pageUrl)
    if (follow && follow !== pageUrl) {
      const next = await fetchUpstream(follow)
      if (next.ok && htmlLooksLikeRevSport(next.html)) {
        pageUrl = follow
        upstream = next
      }
    }
    return json(upstream.ok ? 200 : 502, {
      url: pageUrl,
      status: upstream.status,
      html: upstream.html,
      error: upstream.ok ? undefined : 'Revolutionise returned HTTP ' + upstream.status,
    })
  } catch (err) {
    const timeout = err instanceof Error && err.name === 'TimeoutError'
    return json(502, {
      error: timeout ? 'RevSport took too long (15s)' : err instanceof Error ? err.message : 'Upstream request failed',
    })
  }
}
