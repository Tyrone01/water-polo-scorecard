import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { handleBoardRequest, type BoardEnv, type BoardKvNamespace } from './boardApi'
import {
  BOARD_PUBLISHER_EMAIL,
  WRITE_LOCK_EMAIL,
  WRITE_LOCK_REFUSED,
  WRITE_LOCK_UNCONFIGURED,
  verifyAccessJwt,
} from './boardWriteAuth'

const TOKEN = 'pool-write-token-with-enough-length'
const ISSUER = 'https://fnc.cloudflareaccess.com'
const AUD = 'board-aud-tag'

function memoryKv() {
  const store = new Map<string, string>()
  const puts: string[] = []
  const deletes: string[] = []
  const api: BoardKvNamespace = {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => {
      puts.push(key)
      store.set(key, value)
    },
    delete: async (key) => {
      deletes.push(key)
      store.delete(key)
    },
  }
  return { store, puts, deletes, api }
}

function boardRequest(
  method: string,
  id = 'alstonville',
  opts?: {
    host?: string
    token?: string
    jwt?: string
    body?: unknown
    rawBody?: string
    query?: string
  },
) {
  const host = opts?.host ?? 'https://board.fncwp.com'
  const headers = new Headers()
  if (opts?.token) headers.set('Authorization', `Bearer ${opts.token}`)
  if (opts?.jwt) headers.set('Cf-Access-Jwt-Assertion', opts.jwt)
  const hasBody = opts?.rawBody !== undefined || opts?.body !== undefined
  if (hasBody) headers.set('Content-Type', 'application/json')
  const query = opts?.query ? `?${opts.query}` : ''
  return new Request(`${host}/api/board/${id}${query}`, {
    method,
    headers,
    body: opts?.rawBody ?? (opts?.body !== undefined ? JSON.stringify(opts.body) : undefined),
  })
}

function lockedEnv(extra?: Partial<BoardEnv>): BoardEnv {
  return { BOARD_WRITE_TOKEN: TOKEN, ...extra }
}

async function errorOf(res: Response | null): Promise<string> {
  const body = (await res?.json()) as { error?: string }
  return body.error ?? ''
}

describe('board API', () => {
  it('returns a busy response when the scoreboard store rejects a write', async () => {
    const res = await handleBoardRequest(
      boardRequest('POST', 'alstonville', {
        token: TOKEN,
        body: { v: 1, updatedAt: 1 },
      }),
      {
        BOARD_WRITE_TOKEN: TOKEN,
        SCOREBOARD: {
          get: async () => null,
          put: async () => {
            throw new Error('KV PUT failed: 429 Too Many Requests')
          },
        },
      },
    )
    expect(res?.status).toBe(503)
    expect(await errorOf(res!)).toMatch(/busy/i)
  })
})

describe('board write lock', () => {
  it('serves GET with no auth, including CORS for pool TVs', async () => {
    const kv = memoryKv()
    await kv.api.put('alstonville', JSON.stringify({ v: 1, updatedAt: 5, white: 2 }))
    const res = await handleBoardRequest(boardRequest('GET'), {
      BOARD_WRITE_TOKEN: TOKEN,
      SCOREBOARD: kv.api,
    })
    expect(res?.status).toBe(200)
    expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const body = (await res?.json()) as { white?: number }
    expect(body.white).toBe(2)
    expect(kv.puts).toEqual(['alstonville'])
  })

  it('keeps a missing board as a public 404', async () => {
    const kv = memoryKv()
    const res = await handleBoardRequest(boardRequest('GET', 'ballina'), {
      SCOREBOARD: kv.api,
    })
    expect(res?.status).toBe(404)
    expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('answers preflight without auth and allows the write headers', async () => {
    const res = await handleBoardRequest(boardRequest('OPTIONS'), { SCOREBOARD: memoryKv().api })
    expect(res?.status).toBe(204)
    expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const allow = res?.headers.get('Access-Control-Allow-Headers') ?? ''
    expect(allow).toMatch(/Authorization/)
    expect(allow).toMatch(/Cf-Access-Jwt-Assertion/)
    expect(allow).toMatch(/Content-Type/)
  })

  it('rejects PUT, POST, and DELETE with no auth and does not write', async () => {
    const kv = memoryKv()
    const env: BoardEnv = { BOARD_WRITE_TOKEN: TOKEN, SCOREBOARD: kv.api }
    for (const method of ['PUT', 'POST', 'DELETE'] as const) {
      const res = await handleBoardRequest(
        boardRequest(method, 'lismore', { body: method === 'DELETE' ? undefined : { v: 1 } }),
        env,
      )
      expect(res?.status).toBe(401)
      expect(await errorOf(res!)).toBe(WRITE_LOCK_REFUSED)
      expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('*')
    }
    expect(kv.puts).toEqual([])
    expect(kv.deletes).toEqual([])
  })

  it('rejects a write when the body is not JSON and no token was sent', async () => {
    const kv = memoryKv()
    const res = await handleBoardRequest(boardRequest('PUT', 'lismore', { rawBody: 'not-json' }), {
      BOARD_WRITE_TOKEN: TOKEN,
      SCOREBOARD: kv.api,
    })
    expect(res?.status).toBe(401)
    expect(kv.puts).toEqual([])
  })

  it('rejects the wrong bearer token and a token in the query string', async () => {
    const kv = memoryKv()
    const env = lockedEnv({ SCOREBOARD: kv.api })
    const wrong = await handleBoardRequest(
      boardRequest('PUT', 'alstonville', { token: 'nope', body: { v: 1, white: 9 } }),
      env,
    )
    expect(wrong?.status).toBe(401)
    expect(await errorOf(wrong!)).toBe(WRITE_LOCK_REFUSED)

    const query = await handleBoardRequest(
      boardRequest('PUT', 'alstonville', { body: { v: 1 }, query: `access_token=${TOKEN}` }),
      env,
    )
    expect(query?.status).toBe(401)
    expect(kv.puts).toEqual([])

    const basic = await handleBoardRequest(
      new Request('https://board.fncwp.com/api/board/alstonville', {
        method: 'PUT',
        headers: {
          Authorization: `Basic ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ v: 1 }),
      }),
      env,
    )
    expect(basic?.status).toBe(401)
    expect(kv.puts).toEqual([])
  })

  it('accepts PUT and POST with the bearer token, then DELETE', async () => {
    const kv = memoryKv()
    const env = lockedEnv({ SCOREBOARD: kv.api })
    const put = await handleBoardRequest(
      boardRequest('PUT', 'alstonville', { token: TOKEN, body: { v: 1, white: 3 } }),
      env,
    )
    expect(put?.status).toBe(200)
    const post = await handleBoardRequest(
      boardRequest('POST', 'ballina', { token: TOKEN, body: { v: 1, blue: 4 } }),
      env,
    )
    expect(post?.status).toBe(200)

    const got = await handleBoardRequest(boardRequest('GET', 'alstonville'), env)
    expect(got?.status).toBe(200)
    expect(((await got?.json()) as { white?: number }).white).toBe(3)

    const del = await handleBoardRequest(boardRequest('DELETE', 'alstonville', { token: TOKEN }), env)
    expect(del?.status).toBe(200)
    const after = await handleBoardRequest(boardRequest('GET', 'alstonville'), env)
    expect(after?.status).toBe(404)
    expect(kv.deletes).toEqual(['alstonville'])
  })

  it('accepts a configured token that was stored with a trailing newline', async () => {
    const kv = memoryKv()
    const res = await handleBoardRequest(
      boardRequest('PUT', 'murwillumbah', { token: TOKEN, body: { v: 1 } }),
      { BOARD_WRITE_TOKEN: `${TOKEN}\n`, SCOREBOARD: kv.api },
    )
    expect(res?.status).toBe(200)
    expect(kv.puts).toEqual(['murwillumbah'])
  })

  it('fails closed when no write token and no Access settings are configured', async () => {
    const kv = memoryKv()
    const hosts = ['https://board.fncwp.com', 'https://preview.example.workers.dev', 'https://board.test']
    for (const host of hosts) {
      const res = await handleBoardRequest(boardRequest('PUT', 'alstonville', { host, body: { v: 1 } }), {
        SCOREBOARD: kv.api,
        BOARD_WRITE_TOKEN: '   ',
        ACCESS_AUD: '',
      })
      expect(res?.status).toBe(403)
      expect(await errorOf(res!)).toBe(WRITE_LOCK_UNCONFIGURED)
    }
    expect(kv.puts).toEqual([])
  })

  it('fails closed when only one Access setting is present', async () => {
    const kv = memoryKv()
    const res = await handleBoardRequest(boardRequest('DELETE', 'alstonville'), {
      SCOREBOARD: kv.api,
      ACCESS_AUD: AUD,
    })
    expect(res?.status).toBe(403)
    expect(await errorOf(res!)).toBe(WRITE_LOCK_UNCONFIGURED)
    expect(kv.deletes).toEqual([])
  })

  it('does not treat a JWT header as access when Access is not configured', async () => {
    const verifyAccessJwt = vi.fn(async () => ({ email: BOARD_PUBLISHER_EMAIL }))
    const kv = memoryKv()
    const res = await handleBoardRequest(
      boardRequest('PUT', 'alstonville', { jwt: 'anything', body: { v: 1 } }),
      { SCOREBOARD: kv.api },
      { verifyAccessJwt },
    )
    expect(res?.status).toBe(403)
    expect(verifyAccessJwt).not.toHaveBeenCalled()
    expect(kv.puts).toEqual([])
  })

  it('ignores BOARD_WRITE_OPEN outside local dev', async () => {
    const kv = memoryKv()
    const res = await handleBoardRequest(boardRequest('POST', 'alstonville', { body: { v: 1 } }), {
      BOARD_WRITE_OPEN: '1',
      SCOREBOARD: kv.api,
    })
    expect(res?.status).toBe(403)
    expect(kv.puts).toEqual([])
  })

  it('opens writes on vite.local and localhost only when BOARD_WRITE_OPEN=1', async () => {
    for (const host of ['http://vite.local', 'http://localhost:5173', 'http://127.0.0.1:5173']) {
      const res = await handleBoardRequest(
        boardRequest('PUT', 'localopen1', { host, body: { v: 1, updatedAt: 1 } }),
        { BOARD_WRITE_OPEN: '1' },
      )
      expect(res?.status).toBe(200)
      const got = await handleBoardRequest(boardRequest('GET', 'localopen1', { host }))
      expect(got?.status).toBe(200)
    }

    const stillLocked = await handleBoardRequest(
      boardRequest('PUT', 'localopen2', { host: 'http://vite.local', body: { v: 1 } }),
      { BOARD_WRITE_OPEN: 'true' },
    )
    expect(stillLocked?.status).toBe(403)

    const omitted = await handleBoardRequest(
      boardRequest('PUT', 'localopen3', { host: 'http://vite.local', body: { v: 1 } }),
    )
    expect(omitted?.status).toBe(403)
  })

  it('still checks JSON after a local open write is allowed', async () => {
    const res = await handleBoardRequest(
      boardRequest('POST', 'localopen4', { host: 'http://localhost', rawBody: '{' }),
      { BOARD_WRITE_OPEN: '1' },
    )
    expect(res?.status).toBe(400)
  })
})

describe('board write lock Access JWT', () => {
  let jwks: JWTVerifyGetKey
  let privateKey: CryptoKey

  beforeAll(async () => {
    const keys = await generateKeyPair('RS256', { extractable: true })
    privateKey = keys.privateKey
    const jwk = await exportJWK(keys.publicKey)
    jwk.kid = 'test-key'
    jwk.alg = 'RS256'
    jwk.use = 'sig'
    jwks = createLocalJWKSet({ keys: [jwk] })
  })

  function check(token: string, opts: { audience: string; issuer: string }) {
    return verifyAccessJwt(token, { ...opts, jwks })
  }

  async function sign(email: string | undefined, opts?: { audience?: string; issuer?: string; expiresIn?: string }) {
    const payload: Record<string, unknown> = {}
    if (email !== undefined) payload.email = email
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(opts?.issuer ?? ISSUER)
      .setAudience(opts?.audience ?? AUD)
      .setIssuedAt()
      .setExpirationTime(opts?.expiresIn ?? '2h')
      .sign(privateKey)
  }

  function accessEnv(kv: BoardKvNamespace): BoardEnv {
    return {
      ACCESS_AUD: AUD,
      ACCESS_TEAM_DOMAIN: ISSUER,
      SCOREBOARD: kv,
    }
  }

  it('accepts a verified token for the allowed publisher', async () => {
    const kv = memoryKv()
    const jwt = await sign(BOARD_PUBLISHER_EMAIL)
    const res = await handleBoardRequest(
      boardRequest('PUT', 'byron', { jwt, body: { v: 1, white: 1 } }),
      accessEnv(kv.api),
      { verifyAccessJwt: check },
    )
    expect(res?.status).toBe(200)
    const got = await handleBoardRequest(boardRequest('GET', 'byron'), accessEnv(kv.api))
    expect(((await got?.json()) as { white?: number }).white).toBe(1)
  })

  it('accepts a bare team domain as the issuer setting', async () => {
    const kv = memoryKv()
    const jwt = await sign(BOARD_PUBLISHER_EMAIL)
    const res = await handleBoardRequest(
      boardRequest('POST', 'byron', { jwt, body: { v: 1 } }),
      {
        ACCESS_AUD: AUD,
        ACCESS_TEAM_DOMAIN: 'fnc.cloudflareaccess.com',
        SCOREBOARD: kv.api,
      },
      { verifyAccessJwt: check },
    )
    expect(res?.status).toBe(200)
  })

  it('rejects a different email, including a different case', async () => {
    const kv = memoryKv()
    for (const email of ['someone.else@gmail.com', 'Tyrone.McGillick@gmail.com']) {
      const jwt = await sign(email)
      const res = await handleBoardRequest(
        boardRequest('PUT', 'byron', { jwt, body: { v: 1, white: 8 } }),
        accessEnv(kv.api),
        { verifyAccessJwt: check },
      )
      expect(res?.status).toBe(403)
      expect(await errorOf(res!)).toBe(WRITE_LOCK_EMAIL)
    }
    expect(kv.puts).toEqual([])
  })

  it('rejects a bad signature, the wrong audience, the wrong issuer, and an expired token', async () => {
    const kv = memoryKv()
    const other = await generateKeyPair('RS256', { extractable: true })
    const forged = await new SignJWT({ email: BOARD_PUBLISHER_EMAIL })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(ISSUER)
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(other.privateKey)
    const cases = [
      forged,
      await sign(BOARD_PUBLISHER_EMAIL, { audience: 'other-app' }),
      await sign(BOARD_PUBLISHER_EMAIL, { issuer: 'https://other.cloudflareaccess.com' }),
      await sign(BOARD_PUBLISHER_EMAIL, { expiresIn: '-1h' }),
      'not-a-jwt',
    ]
    for (const jwt of cases) {
      const res = await handleBoardRequest(
        boardRequest('DELETE', 'byron', { jwt }),
        accessEnv(kv.api),
        { verifyAccessJwt: check },
      )
      expect(res?.status).toBe(401)
      expect(await errorOf(res!)).toBe(WRITE_LOCK_REFUSED)
    }
    expect(kv.deletes).toEqual([])
  })

  it('lets a valid Access login through when the bearer token is wrong', async () => {
    const kv = memoryKv()
    const jwt = await sign(BOARD_PUBLISHER_EMAIL)
    const res = await handleBoardRequest(
      boardRequest('PUT', 'byron', { token: 'wrong', jwt, body: { v: 1 } }),
      lockedEnv({ ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: ISSUER, SCOREBOARD: kv.api }),
      { verifyAccessJwt: check },
    )
    expect(res?.status).toBe(200)
  })

  it('does not call Access verification when the bearer token already matches', async () => {
    const verify = vi.fn(async () => {
      throw new Error('verifier should not run')
    })
    const kv = memoryKv()
    const res = await handleBoardRequest(
      boardRequest('PUT', 'byron', { token: TOKEN, jwt: 'ignored', body: { v: 1 } }),
      lockedEnv({ ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: ISSUER, SCOREBOARD: kv.api }),
      { verifyAccessJwt: verify },
    )
    expect(res?.status).toBe(200)
    expect(verify).not.toHaveBeenCalled()
  })
})
