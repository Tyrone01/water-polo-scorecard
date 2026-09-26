import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { SpectatorBoard } from './components/SpectatorBoard'
import { BOARD_ID_RE } from './boardPublish'
import './index.css'

const path = window.location.pathname.replace(/\/$/, '') || '/'
const boardMatch = path.match(/^\/board(?:\/([^/]+))?$/)
const boardId = boardMatch?.[1] && BOARD_ID_RE.test(boardMatch[1]) ? boardMatch[1] : null
const isBoardRoute = Boolean(boardMatch)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isBoardRoute ? (
      boardId ? (
        <SpectatorBoard id={boardId} />
      ) : (
        <div className="board board-wait">
          <p>Open a pool board:</p>
          <p>
            <a href="/board/alstonville">/board/alstonville</a>
            {' · '}
            <a href="/board/ballina">/board/ballina</a>
            {' · '}
            <a href="/board/lismore">/board/lismore</a>
            {' · '}
            <a href="/board/mullumbimby">/board/mullumbimby</a>
          </p>
        </div>
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
