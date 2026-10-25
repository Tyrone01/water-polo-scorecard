/**
 * Write lock for `/api/board/:id`.
 *
 * GET stays public. PUT, POST, and DELETE need a matching Bearer token
 * (`BOARD_WRITE_TOKEN`) or a Cloudflare Access JWT for the one allowed publisher.
 * If neither is configured, mutations fail closed. `BOARD_WRITE_OPEN=1` skips
 * the check only for localhost / vite.local, so it cannot unlock a deployed Worker.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

/** The only Access email that may publish a board. Compared exactly. */
export const BOARD_PUBLISHER_EMAIL = 'tyrone.mcgillick@gmail.com'

export const WRITE_LOCK_UNCONFIGURED =
  'This board is locked. Writes are turned off until a write token or Access sign-in is set on the server.'
export const WRITE_LOCK_REFUSED =
  'This board is locked. Send the board write token, or sign in as the allowed publisher.'
export const WRITE_LOCK_EMAIL =
  'This board is locked. That sign-in is not allowed to publish the board.'

export interface BoardWriteEnv {
  /** Worker secret. Empty or unset means the Bearer check is not available. */
  BOARD_WRITE_TOKEN?: string
  /** Access application audience (AUD) tag. Both Access vars are required. */
  ACCESS_AUD?: string
  /**
   * Access team issuer, `https://<team>.cloudflareaccess.com`
   * (a bare team host is accepted and normalised to that URL).
   */
  ACCESS_TEAM_DOMAIN?: string
  /** Local escape hatch. Honoured only when the value is `1` and the host is local. */
  BOARD_WRITE_OPEN?: string
}

export interface AccessJwtIdentity {
  email: string | null
}

export type AccessJwtCheck = (
  token: string,
  opts: { audience: string; issuer: string },
) => Promise<AccessJwtIdentity>

export interface BoardWriteDeps {
  verifyAccessJwt?: AccessJwtCheck
}

export type WriteAuthDecision =
  | { ok: true }
  | { ok: false; status: 401 | 403; error: string }

const LOCAL_WRITE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'vite.local'])

const remoteJwksByIssuer = new Map<string, JWTVerifyGetKey>()

function configuredToken(env?: BoardWriteEnv): string {
  const raw = env?.BOARD_WRITE_TOKEN
  return typeof raw === 'string' ? raw.trim() : ''
}

/** https origin of the Access team, or empty when the value is not usable. */
export function accessIssuer(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'https:') return ''
    if (url.username || url.password || url.search || url.hash) return ''
    if (url.pathname !== '/' && url.pathname !== '') return ''
    return url.origin
  } catch {
    return ''
  }
}

export function configuredAccess(env?: BoardWriteEnv): { audience: string; issuer: string } | null {
  const audience = env?.ACCESS_AUD?.trim() ?? ''
  const issuer = accessIssuer(env?.ACCESS_TEAM_DOMAIN)
  if (!audience || !issuer) return null
  return { audience, issuer }
}

export function localWriteOpen(request: Request, env?: BoardWriteEnv): boolean {
  if (env?.BOARD_WRITE_OPEN?.trim() !== '1') return false
  let host = ''
  try {
    host = new URL(request.url).hostname.toLowerCase()
  } catch {
    return false
  }
  return LOCAL_WRITE_HOSTS.has(host)
}

function bearerToken(request: Request): string {
  const header = request.headers.get('Authorization') ?? ''
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header)
  return match?.[1] ?? ''
}

/**
 * Compare two secrets without leaking the expected value through a length check.
 * Workers expose `crypto.subtle.timingSafeEqual`. Node 22's Web Crypto does not,
 * so the fallback walks the two SHA-256 digests, which are always the same length.
 */
export async function tokensMatch(provided: string, expected: string): Promise<boolean> {
  if (!provided || !expected) return false
  const encoder = new TextEncoder()
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  const a = new Uint8Array(providedHash)
  const b = new Uint8Array(expectedHash)
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (left: BufferSource, right: BufferSource) => boolean
  }
  if (typeof subtle.timingSafeEqual === 'function') return subtle.timingSafeEqual(a, b)
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

function jwksForIssuer(issuer: string): JWTVerifyGetKey {
  const cached = remoteJwksByIssuer.get(issuer)
  if (cached) return cached
  const created = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
  remoteJwksByIssuer.set(issuer, created)
  return created
}

/** Verify an Access JWT against the team JWKS. Tests pass `jwks` so CI does not call Cloudflare. */
export async function verifyAccessJwt(
  token: string,
  opts: { audience: string; issuer: string; jwks?: JWTVerifyGetKey },
): Promise<AccessJwtIdentity> {
  const jwks = opts.jwks ?? jwksForIssuer(opts.issuer)
  const { payload } = await jwtVerify(token, jwks, {
    issuer: opts.issuer,
    audience: opts.audience,
  })
  const email = payload.email
  return { email: typeof email === 'string' ? email : null }
}

export async function authorizeBoardWrite(
  request: Request,
  env?: BoardWriteEnv,
  deps?: BoardWriteDeps,
): Promise<WriteAuthDecision> {
  if (localWriteOpen(request, env)) return { ok: true }

  const expected = configuredToken(env)
  const access = configuredAccess(env)
  if (!expected && !access) return { ok: false, status: 403, error: WRITE_LOCK_UNCONFIGURED }

  if (expected && (await tokensMatch(bearerToken(request), expected))) return { ok: true }

  if (access) {
    const jwt = request.headers.get('Cf-Access-Jwt-Assertion')?.trim() ?? ''
    if (jwt) {
      try {
        const verify = deps?.verifyAccessJwt ?? verifyAccessJwt
        const identity = await verify(jwt, access)
        if (identity.email === BOARD_PUBLISHER_EMAIL) return { ok: true }
        if (identity.email) return { ok: false, status: 403, error: WRITE_LOCK_EMAIL }
      } catch {
        /* Bad signature, audience, issuer, or expiry. Same refusal as a missing token. */
      }
    }
  }

  return { ok: false, status: 401, error: WRITE_LOCK_REFUSED }
}
