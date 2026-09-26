import { DRIVE_FILE_SCOPE } from './types'

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
      scope: DRIVE_FILE_SCOPE,
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

export async function connectGoogle(clientId: string): Promise<string> {
  const id = clientId.trim()
  if (!id) {
    throw new Error(
      'Connect Google needs a Google Cloud OAuth Web client ID with JS origins for http://localhost:5173 and this preview origin.',
    )
  }
  await loadGsiClient()
  const token = await requestAccessToken(id, 'consent')
  const email = await lookupEmail(token)
  if (email) {
    const stored = readStored()
    if (stored) writeStored({ ...stored, email })
  }
  return token
}

export async function getValidAccessToken(clientId: string): Promise<string> {
  const id = clientId.trim()
  if (!id) {
    throw new Error(
      'Connect Google needs a Google Cloud OAuth Web client ID with JS origins for http://localhost:5173 and this preview origin.',
    )
  }
  const stored = readStored()
  if (stored && stored.expiresAt > Date.now() + 15_000) return stored.accessToken
  await loadGsiClient()
  const token = await requestAccessToken(id)
  const email = stored?.email || (await lookupEmail(token))
  if (email) {
    const next = readStored()
    if (next) writeStored({ ...next, email })
  }
  return token
}
