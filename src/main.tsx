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

function BoardIndex() {
  return (
    <div className="board board-wait">
      <p>Open a pool board:</p>
      <p>
        {FNC_BOARD_VENUE_IDS.map((id, i) => (
          <span key={id}>
            {i > 0 ? ' · ' : null}
            <a href={onPublicBoardHost ? `/${id}` : `/board/${id}`}>
              {onPublicBoardHost ? `/${id}` : `/board/${id}`}
            </a>
          </span>
        ))}
      </p>
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
