import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { SpectatorBoard } from './components/SpectatorBoard'
import { LIVE_BOARD_ID } from './boardPublish'
import './index.css'

const path = window.location.pathname.replace(/\/$/, '') || '/'
const isBoard = path === '/board' || path === `/board/${LIVE_BOARD_ID}`

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isBoard ? <SpectatorBoard id={LIVE_BOARD_ID} /> : <App />}
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* preview without HTTPS is fine — scoring still works */
    })
  })
}
