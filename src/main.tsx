import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { AppErrorBoundary } from './components/AppError'
import { SpectatorBoard } from './components/SpectatorBoard'
import { BOARD_ID_RE, FNC_BOARD_VENUE_IDS, isFncBoardVenueId } from './boardPublish'
import { AJWP_FRIDAY_NIGHT } from './revsport/sync'
import './index.css'

const path = window.location.pathname.replace(/\/$/, '') || '/'
const host = window.location.hostname.toLowerCase()
const onPublicBoardHost = host === 'board.fncwp.com'

/** /board/{id} always; on board.* also /alstonville (short TV URLs). */
const boardMatch = path.match(/^\/board(?:\/([^/]+))?$/)
/** Where scorers go to pick a pool and that night's games (the scorer app, not a TV board). */
const SCORE_PATH = '/score'
/**
 * On the TV host, scorers go to the main scorer address so saved games and Google
 * sign-in stay in one place. A build can override it with VITE_SCORER_ORIGIN.
 */
const envScorer = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_SCORER_ORIGIN
const SCORER_ORIGIN = (envScorer ?? 'https://water-polo-scorecard.tyrone-mcgillick.workers.dev').replace(/\/$/, '')
const isScorePath = path === SCORE_PATH
const shortMatch = onPublicBoardHost && !isScorePath && !boardMatch ? path.match(/^\/([a-z0-9_-]{4,40})$/) : null
const rawId = boardMatch?.[1] || shortMatch?.[1] || null
const boardId = rawId && BOARD_ID_RE.test(rawId) ? rawId : null
const isBoardIndex = path === '/board' || (onPublicBoardHost && path === '/')
const isBoardRoute = Boolean(boardMatch) || Boolean(shortMatch && isFncBoardVenueId(rawId || '')) || isBoardIndex

const VENUE_LABELS: Record<string, string> = {
  alstonville: 'Alstonville',
  ballina: 'Ballina',
  lismore: 'Lismore',
  mullumbimby: 'Mullumbimby',
}

function BoardIndex() {
  // Pool lives in the URL (?pool=alstonville) so the phone's Back button steps
  // scorer -> choices -> pool picker instead of leaving the site.
  const poolFromUrl = () => {
    const v = (new URLSearchParams(window.location.search).get('pool') || '').toLowerCase()
    return isFncBoardVenueId(v) ? v : null
  }
  const [venueId, setVenueIdState] = React.useState<string | null>(poolFromUrl)
  React.useEffect(() => {
    const onPop = () => setVenueIdState(poolFromUrl())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const setVenueId = (id: string | null) => {
    if (id) window.history.pushState(null, '', `${window.location.pathname}?pool=${encodeURIComponent(id)}`)
    else if (poolFromUrl()) window.history.back()
    setVenueIdState(id)
  }
  const label = venueId ? VENUE_LABELS[venueId] ?? venueId : ''
  const scoreHref = venueId ? `${onPublicBoardHost ? (SCORER_ORIGIN ? `${SCORER_ORIGIN}/` : SCORE_PATH) : '/'}?venue=${encodeURIComponent(venueId)}` : '#'
  const boardHref = venueId ? (onPublicBoardHost ? `/${venueId}` : `/board/${venueId}`) : '#'
  const ajwpHref = onPublicBoardHost && SCORER_ORIGIN ? `${SCORER_ORIGIN}/?night=${AJWP_FRIDAY_NIGHT}` : `/?night=${AJWP_FRIDAY_NIGHT}`
  return (
    <div className="board board-hub">
      <div className="board-hub-bar" aria-hidden="true" />
      <header className="board-hub-header">
        <img className="fnc-logo board-hub-logo" src="/logo-fnc.jpg" alt="Far North Coast Water Polo" />
        <div className="board-hub-text">
          <h1>Far North Coast Water Polo</h1>
          <p className="board-hub-sub">{venueId ? `${label}: what do you need?` : 'Which pool are you at?'}</p>
        </div>
      </header>
      {!venueId ? (
        <>
          <div className="board-hub-grid">
            {FNC_BOARD_VENUE_IDS.map((id) => (
              <button key={id} type="button" className="board-hub-card" onClick={() => setVenueId(id)}>
                <strong>{VENUE_LABELS[id] ?? id}</strong>
              </button>
            ))}
          </div>
          <div className="board-hub-extra">
            <a className="board-hub-card" href={ajwpHref}>
              <strong>AJWP Friday night comp</strong>
              <span className="board-hub-path">Friday games</span>
            </a>
          </div>
        </>
      ) : (
        <>
          <div className="board-hub-grid">
            <a className="board-hub-card board-hub-choice" href={scoreHref}>
              <strong>Score a game</strong>
              <span className="board-hub-path">Tonight&apos;s games at {label}</span>
            </a>
            <a className="board-hub-card board-hub-choice" href={boardHref}>
              <strong>Set up the TV board</strong>
              <span className="board-hub-path">Open this on the pool TV</span>
            </a>
          </div>
          <button type="button" className="board-hub-back" onClick={() => setVenueId(null)}>
            ← Change pool
          </button>
        </>
      )}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      {isBoardRoute ? (
        boardId ? (
          <SpectatorBoard id={boardId} />
        ) : (
          <BoardIndex />
        )
      ) : (
        <App />
      )}
    </AppErrorBoundary>
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* preview without HTTPS is fine — scoring still works */
    })
  })
}
