/** Page addresses on the OAuth Web client. Preview hostnames are not in this list. */
export const BAKED_OAUTH_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://board.fncwp.com',
  'https://water-polo-scorecard.tyrone-mcgillick.workers.dev',
] as const

/** Sign-in for a preview link is handed to this host so each new preview hostname is not an OAuth origin. */
export const OAUTH_STABLE_ORIGIN = 'https://board.fncwp.com'

const PREVIEW_HOST_SUFFIX = '.water-polo-scorecard.tyrone-mcgillick.workers.dev'

export const DRIVE_OAUTH_MESSAGE = 'ajwp-drive-oauth-v1'

export type DriveOAuthPlan = 'direct' | 'relay' | 'blocked'

export function isBakedOauthOrigin(origin: string): boolean {
  return (BAKED_OAUTH_ORIGINS as readonly string[]).includes(origin)
}

/** Who may receive a Drive token from the stable sign-in window. */
export function isAllowedDriveOAuthCaller(origin: string): boolean {
  if (isBakedOauthOrigin(origin)) return true
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (url.origin !== origin) return false
  if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return true
  if (url.protocol !== 'https:') return false
  return url.hostname.endsWith(PREVIEW_HOST_SUFFIX) && url.hostname.length > PREVIEW_HOST_SUFFIX.length
}

export function driveOAuthPlan(origin: string): DriveOAuthPlan {
  if (isBakedOauthOrigin(origin)) return 'direct'
  if (isAllowedDriveOAuthCaller(origin)) return 'relay'
  return 'blocked'
}

export function isDriveOauthPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === '/drive-oauth'
}

export function isGoogleClientId(id: string): boolean {
  return /^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(id.trim())
}

export type DriveOAuthRelayResult =
  | { ok: true; accessToken: string; expiresIn: number; email?: string }
  | { ok: false; error: string }

/** Ignore anything that is not a token message from the stable sign-in host. */
export function readDriveOAuthMessage(data: unknown, eventOrigin: string): DriveOAuthRelayResult | null {
  if (eventOrigin !== OAUTH_STABLE_ORIGIN) return null
  if (!data || typeof data !== 'object') return null
  const msg = data as Record<string, unknown>
  if (msg.type !== DRIVE_OAUTH_MESSAGE) return null
  if (typeof msg.error === 'string' && msg.error.trim()) return { ok: false, error: msg.error }
  if (typeof msg.accessToken !== 'string' || !msg.accessToken.trim()) {
    return { ok: false, error: 'Google sign-in returned no token' }
  }
  const expiresIn = typeof msg.expiresIn === 'number' && msg.expiresIn > 0 ? msg.expiresIn : 3600
  const email = typeof msg.email === 'string' && msg.email.includes('@') ? msg.email : undefined
  return { ok: true, accessToken: msg.accessToken, expiresIn, email }
}
