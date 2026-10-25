import { useEffect, useState } from 'react'
import { plainDriveError } from '../driveErrors'
import { connectGoogle, googleSessionSnapshot, loadGsiClient } from '../googleAuth'
import { DRIVE_OAUTH_MESSAGE, isAllowedDriveOAuthCaller, isGoogleClientId } from '../googleOrigins'
import { CLUB_GOOGLE_ACCOUNT, DEFAULT_GOOGLE_CLIENT_ID } from '../types'

export function DriveOAuthPopup() {
  const params = new URLSearchParams(window.location.search)
  const from = params.get('from') || ''
  const clientFromQuery = params.get('client_id') || ''
  const allowed = isAllowedDriveOAuthCaller(from)
  const [phase, setPhase] = useState<'ready' | 'working' | 'done' | 'error'>('ready')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadGsiClient().catch(() => {})
  }, [])

  function go() {
    if (!window.opener || !allowed || phase === 'working') return
    setPhase('working')
    setMessage('')
    const clientId = isGoogleClientId(clientFromQuery) ? clientFromQuery.trim() : DEFAULT_GOOGLE_CLIENT_ID
    const pending = connectGoogle(clientId)
    void pending.then(() => {
      const snap = googleSessionSnapshot()
      if (!snap || !window.opener) throw new Error('Google sign-in returned no token')
      window.opener.postMessage({
        type: DRIVE_OAUTH_MESSAGE,
        accessToken: snap.accessToken,
        expiresIn: snap.expiresIn,
        email: snap.email,
      }, from)
      setPhase('done')
      window.setTimeout(() => window.close(), 300)
    }).catch((err: unknown) => {
      const error = plainDriveError(err instanceof Error ? err.message : 'Google sign-in failed', 'the club folder')
      window.opener?.postMessage({ type: DRIVE_OAUTH_MESSAGE, error }, from)
      setPhase('error')
      setMessage(error)
    })
  }

  return (
    <div className="app">
      <section className="drive-oauth">
        <h1>Save the scorecard to Drive</h1>
        {!window.opener ? (
          <p>Open Save to Drive from the scorecard. This window only finishes Google sign-in.</p>
        ) : !allowed ? (
          <p>This page will not send Google access to that address.</p>
        ) : (
          <>
            <p>
              Sign in as {CLUB_GOOGLE_ACCOUNT}. That personal Gmail is the checklist account until an FNC Google tenant exists.
              The scorecard then files the two CSVs.
            </p>
            <button className="btn primary drive-save-go" type="button" disabled={phase === 'working' || phase === 'done'} onClick={go}>
              {phase === 'working' ? 'Waiting for Google…' : phase === 'done' ? 'Signed in' : 'Continue with Google'}
            </button>
            {phase === 'error' ? <p className="drive-save-detail">{message}</p> : null}
            {phase === 'done' ? <p>You can close this window.</p> : null}
          </>
        )}
      </section>
    </div>
  )
}
