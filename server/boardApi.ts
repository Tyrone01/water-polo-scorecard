/**
 * Shareable spectator board snapshots.
 *
 * Storage: Worker in-memory Map keyed by board id (not a Durable Object).
 * Temp-worker / workers.dev deploys may not reliably run `new_sqlite_classes`
 * migrations. The HTTP contract is the same if we later bind ScoreboardRoom as BOARD.
 */
const BOARD_ID_RE = /^[a-zA-Z0-9_-]{4,40}$/

const boards = new Map<string, unknown>()

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

/** Handle GET/PUT/POST/OPTIONS `/api/board/:id`. Returns null if the path is not a board API route. */
export async function handleBoardRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url)
  const m = url.pathname.match(/^\/api\/board\/([^/]+)$/)
  if (!m) return null
  const id = decodeURIComponent(m[1])

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (!BOARD_ID_RE.test(id)) {
    return json(400, { error: 'bad id' })
  }

  if (request.method === 'GET') {
    const snap = boards.get(id)
    if (!snap) return json(404, { error: 'no board' })
    return json(200, snap)
  }

  if (request.method === 'PUT' || request.method === 'POST') {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json(400, { error: 'invalid json' })
    }
    boards.set(id, body)
    return json(200, { ok: true })
  }

  return json(405, { error: 'GET, PUT, POST only' })
}
