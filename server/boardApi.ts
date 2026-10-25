/**
 * Shareable spectator board snapshots.
 *
 * Storage: Cloudflare KV when `env.SCOREBOARD` is bound (production Worker).
 * Falls back to an in-memory Map when KV is not bound (Vite local dev).
 *
 * GET is public so pool TVs can poll. PUT, POST, and DELETE are locked.
 * See server/boardWriteAuth.ts and docs/ACCESS-AND-WRITE-LOCK.md.
 */
import { authorizeBoardWrite, type BoardWriteDeps, type BoardWriteEnv } from './boardWriteAuth'

const BOARD_ID_RE = /^[a-zA-Z0-9_-]{4,40}$/

const boards = new Map<string, unknown>()

/** Minimal KV interface so we do not depend on @cloudflare/workers-types in the Vite build. */
export interface BoardKvNamespace {
  get(key: string, type?: 'text' | 'json'): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete?(key: string): Promise<void>
}

export interface BoardEnv extends BoardWriteEnv {
  SCOREBOARD?: BoardKvNamespace
}

/**
 * `*` stays so pool TVs can GET from any origin without cookies.
 * Bearer auth is a header, not a cookie, so credentialed CORS is not required.
 * Allowing the Authorization header does not skip the write lock.
 */
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Jwt-Assertion',
  'Access-Control-Max-Age': '86400',
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

async function readBoard(id: string, env?: BoardEnv): Promise<unknown | undefined> {
  const kv = env?.SCOREBOARD
  if (kv) {
    const text = await kv.get(id, 'text')
    if (text == null) return undefined
    try {
      return JSON.parse(text) as unknown
    } catch {
      return undefined
    }
  }
  return boards.get(id)
}

async function writeBoard(id: string, body: unknown, env?: BoardEnv): Promise<void> {
  const kv = env?.SCOREBOARD
  if (kv) {
    await kv.put(id, JSON.stringify(body))
    return
  }
  boards.set(id, body)
}

async function deleteBoard(id: string, env?: BoardEnv): Promise<void> {
  const kv = env?.SCOREBOARD
  if (kv) {
    if (typeof kv.delete === 'function') {
      await kv.delete(id)
    } else {
      /* No delete — overwrite with cleared sentinel so GET still yields wait state via client. */
      await kv.put(id, JSON.stringify({ v: 1, cleared: true, updatedAt: Date.now() }))
    }
    return
  }
  boards.delete(id)
}

/**
 * Handle GET/PUT/POST/DELETE/OPTIONS `/api/board/:id`.
 * Pass `env` from the Worker so snapshots persist in KV across isolates.
 * Vite passes a local env (no KV). Writes are locked unless that env has a
 * write token, Access settings, or BOARD_WRITE_OPEN=1.
 * Returns null if the path is not a board API route.
 */
export async function handleBoardRequest(
  request: Request,
  env?: BoardEnv,
  deps?: BoardWriteDeps,
): Promise<Response | null> {
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
    const snap = await readBoard(id, env)
    if (snap === undefined) return json(404, { error: 'no board' })
    if (snap && typeof snap === 'object' && (snap as { cleared?: boolean }).cleared) {
      return json(404, { error: 'no board' })
    }
    return json(200, snap)
  }

  if (request.method === 'PUT' || request.method === 'POST' || request.method === 'DELETE') {
    const auth = await authorizeBoardWrite(request, env, deps)
    if (!auth.ok) return json(auth.status, { error: auth.error })
  }

  if (request.method === 'PUT' || request.method === 'POST') {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json(400, { error: 'invalid json' })
    }
    try {
      await writeBoard(id, body, env)
    } catch {
      // KV throws 429 when the same pool key is written more than once a second.
      // A busy response lets the tablet retry; it must not take down the Worker.
      return json(503, { error: 'Scoreboard is busy. The table will try again.' })
    }
    return json(200, { ok: true })
  }

  if (request.method === 'DELETE') {
    await deleteBoard(id, env)
    return json(200, { ok: true })
  }

  return json(405, { error: 'GET, PUT, POST, DELETE only' })
}
