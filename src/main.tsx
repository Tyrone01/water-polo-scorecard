import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { SpectatorBoard } from './components/SpectatorBoard'
import { BOARD_ID_RE, FNC_BOARD_VENUE_IDS, isFncBoardVenueId } from './boardPublish'
import './index.css'

const path = window.location.pathname.replace(/\/$/, '') || '/'
const host = window.location.hostname.toLowerCase()
const onPublicBoardHost = host === 'board.fncwp.com'

/** /board/{id} always; on board.* also /alstonville (short TV URLs). */
const boardMatch = path.match(/^\/board(?:\/([^/]+))?$/)
const shortMatch = onPublicBoardHost ? path.match(/^\/([a-z0-9_-]{4,40})$/) : null
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
  return (
    <div className="board board-hub">
      <div className="board-hub-bar" aria-hidden="true" />
      <header className="board-hub-header">
        <img className="fnc-logo board-hub-logo" src="/logo-fnc.jpg" alt="Far North Coast Water Polo" />
        <div className="board-hub-text">
          <h1>Far North Coast Water Polo</h1>
          <p className="board-hub-sub">Pool TV scoreboards — pick a venue</p>
        </div>
      </header>
      <div className="board-hub-grid">
        {FNC_BOARD_VENUE_IDS.map((id) => (
          <a
            key={id}
            className="board-hub-card"
            href={onPublicBoardHost ? `/${id}` : `/board/${id}`}
          >
            <strong>{VENUE_LABELS[id] ?? id}</strong>
            <span className="board-hub-path">{onPublicBoardHost ? `/${id}` : `/board/${id}`}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isBoardRoute ? (
      boardId ? (
        <SpectatorBoard id={boardId} />
      ) : (
        <BoardIndex />
      )
    ) : (
      <App />
    )}
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* preview without HTTPS is fine — scoring still works */
    })
  })
}
