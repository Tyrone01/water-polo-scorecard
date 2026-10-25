import { blockedOriginMessage, missingClientMessage } from './driveErrors'
import {
  OAUTH_STABLE_ORIGIN,
  driveOAuthPlan,
  isGoogleClientId,
  readDriveOAuthMessage,
} from './googleOrigins'
import { GOOGLE_SIGNIN_SCOPES } from './types'

const TOKEN_SESSION_KEY = 'ajwp-scorecard-gsi-token-v1'

interface StoredToken {
  accessToken: string
  expiresAt: number
  email?: string
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (resp: GoogleTokenResponse) => void
            error_callback?: (err: { type?: string; message?: string }) => void
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void }
        }
      }
    }
  }
}

interface GoogleTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
  expires_in?: number
}

function readStored(): StoredToken | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredToken
    if (!parsed.accessToken || !parsed.expiresAt) return null
    return parsed
  } catch {
    return null
  }
}

function writeStored(token: StoredToken): void {
  try {
    sessionStorage.setItem(TOKEN_SESSION_KEY, JSON.stringify(token))
  } catch {
    /* private mode */
  }
}

export function hasGoogleSession(): boolean {
  const t = readStored()
  return !!t && t.expiresAt > Date.now() + 15_000
}

export function googleSessionEmail(): string | undefined {
  return readStored()?.email
}

export function googleSessionSnapshot(): { accessToken: string; expiresIn: number; email?: string } | null {
  const t = readStored()
  if (!t) return null
  return {
    accessToken: t.accessToken,
    expiresIn: Math.max(30, Math.round((t.expiresAt - Date.now()) / 1000)),
    email: t.email,
  }
}

export function loadGsiClient(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No browser'))
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-ajwp-gsi]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.ajwpGsi = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(script)
  })
}

async function lookupEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return undefined
    const data = (await res.json()) as { email?: string }
    return data.email
  } catch {
    return undefined
  }
}

function requestAccessToken(clientId: string, prompt?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const oauth = window.google?.accounts?.oauth2
    if (!oauth) {
      reject(new Error('Google Identity Services is not loaded'))
      return
    }
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SIGNIN_SCOPES,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || 'Google sign-in failed'))
          return
        }
        const expiresIn = typeof resp.expires_in === 'number' && resp.expires_in > 0 ? resp.expires_in : 3600
        const prev = readStored()
        writeStored({
          accessToken: resp.access_token,
          expiresAt: Date.now() + expiresIn * 1000,
          email: prev?.email,
        })
        resolve(resp.access_token)
      },
      error_callback: (err) => {
        reject(new Error(err.message || err.type || 'Google sign-in cancelled'))
      },
    })
    if (prompt != null) client.requestAccessToken({ prompt })
    else client.requestAccessToken()
  })
}

function requireClientId(clientId: string): string {
  const id = clientId.trim()
  if (!id || !isGoogleClientId(id)) throw new Error(missingClientMessage())
  return id
}

function finishConnect(clientId: string, prompt?: string): Promise<string> {
  return requestAccessToken(clientId, prompt).then(async (token) => {
    const email = await lookupEmail(token)
    if (email) {
      const stored = readStored()
      if (stored) writeStored({ ...stored, email })
    }
    return token
  })
}

function connectInPage(clientId: string, prompt?: string): Promise<string> {
  if (window.google?.accounts?.oauth2) return finishConnect(clientId, prompt)
  return loadGsiClient().then(() => finishConnect(clientId, prompt))
}

function connectViaRelay(clientId: string): Promise<string> {
  const from = window.location.origin
  const url = new URL('/drive-oauth', OAUTH_STABLE_ORIGIN)
  url.searchParams.set('from', from)
  url.searchParams.set('client_id', clientId)
  const popup = window.open(url.toString(), 'ajwp-drive-oauth', 'popup=yes,width=480,height=720')
  if (!popup) {
    return Promise.reject(new Error('The Google window did not open. Allow popups for this site, then tap Save to Drive again.'))
  }
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = window.setTimeout(() => {
      finish(new Error(`Google sign-in did not finish. Open ${OAUTH_STABLE_ORIGIN} and tap Save to Drive there.`))
    }, 180_000)
    const poll = window.setInterval(() => {
      if (popup.closed) {
        finish(new Error('Google sign-in was closed. Tap Save to Drive again and finish the Google window.'))
      }
    }, 400)
    function onMsg(ev: MessageEvent) {
      const parsed = readDriveOAuthMessage(ev.data, ev.origin)
      if (!parsed) return
      if (!parsed.ok) {
        finish(new Error(parsed.error))
        return
      }
      writeStored({
        accessToken: parsed.accessToken,
        expiresAt: Date.now() + parsed.expiresIn * 1000,
        email: parsed.email,
      })
      finish(null, parsed.accessToken)
    }
    function finish(err: Error | null, token?: string) {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      window.clearInterval(poll)
      window.removeEventListener('message', onMsg)
      if (err) reject(err)
      else resolve(token || '')
    }
    window.addEventListener('message', onMsg)
  })
}

function beginGoogle(clientId: string, prompt?: string): Promise<string> {
  let id: string
  try {
    id = requireClientId(clientId)
  } catch (err) {
    return Promise.reject(err)
  }
  const plan = driveOAuthPlan(window.location.origin)
  if (plan === 'blocked') return Promise.reject(new Error(blockedOriginMessage()))
  if (plan === 'relay') return connectViaRelay(id)
  return connectInPage(id, prompt)
}

export function connectGoogle(clientId: string): Promise<string> {
  return beginGoogle(clientId, 'consent')
}

export function getValidAccessToken(clientId: string): Promise<string> {
  const stored = readStored()
  if (stored && stored.expiresAt > Date.now() + 15_000) return Promise.resolve(stored.accessToken)
  return beginGoogle(clientId)
}
